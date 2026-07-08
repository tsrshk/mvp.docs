# DEC-0011 — POS как источник истины для идентичности ингредиента; mapping на durable POS ID; двухфазная авторитетность

- **Status:** Accepted
- **Date:** 2026-07-08
- **Supersedes:** —
- **Depends on:** VER-021 (стабильность `pos_ingredient_id`), ALIGN-014 (`ERPProvider` READ-seam)
- **Related open decision:** DEC-0012 (правило ключа `source_key`)
- **Blocks:** F5–F10 (в части ingredient sync)

> Merge-инструкция: скопировать в `04_DECISIONS`. Если номер DEC-0011 занят — перенумеровать здесь и в ссылках из `05_BACKLOG`.

## Context

POS (Esupl) содержит каталог ингредиентов. LCOS распознаёт накладную и сопоставляет строки накладной с ингредиентами POS (SKU matching). Нужно решить: кто владеет данными об ингредиентах, где они хранятся, как избежать рассинхрона — при этом commit накладной является ответственным этапом и обязан подчиняться fail-closed.

Решение определяется разделением двух сущностей:

- **Ingredient master data** (`name`, `unit`, `category`) — чужой актив. Владелец — POS. LCOS никогда не authoritative по нему.
- **Mapping** (`source_key` → идентичность ингредиента) — актив LCOS. Накапливаемый moat. LCOS — единственный source of truth.

## Decision

1. **POS — единственный SoT для идентичности и атрибутов ингредиента.** LCOS не создаёт и не редактирует master data ингредиентов как authoritative.
2. **LCOS владеет mapping.** `sku_mapping` привязывается к durable-идентификатору POS (`pos_ingredient_id`), а НЕ к имени и НЕ к surrogate PK локального кэша.
3. **Локальный `ingredient_cache` — неавторитетный.** Обслуживает только draft-фазу matching и отображение. Может быть полностью снесён и пересобран без потери mappings.
4. **Двухфазная авторитетность:**
   - **Phase 1 — Matching (draft; толерантно, дёшево):** резолв по `ingredient_cache` в порядке `subdivision mapping → org mapping → fuzzy → AI`. Результат — предположение, не факт.
   - **Phase 2 — Commit накладной (ответственный; fail-closed):** перед записью прихода каждый резолвнутый `pos_ingredient_id` валидируется live-запросом в POS. Недоступность POS / отсутствие ID / расхождение `unit` → коммит блокируется, строка уходит на review. Authority на этом этапе НЕ берётся из кэша.

**Почему кэш не нарушает "no fallbacks":** fallback = подмена доверенного источника менее доверенным, чтобы всё равно завершить ответственное действие. Здесь ответственное действие (commit) остаётся fail-closed и всегда идёт в live POS; кэш обслуживает только необязательный draft, где он явно помечен как предположение.

## Normative rules (для агента)

**MUST**
- `sku_mapping.pos_ingredient_id` MUST ссылаться на durable POS ID.
- Commit-путь MUST выполнять live-валидацию каждого `pos_ingredient_id` против POS перед записью прихода.
- Расхождение `unit` (mapping-time vs live POS) MUST блокировать коммит и триггерить re-валидацию соответствующего mapping.
- `ingredient_cache` MUST быть полностью пересобираемым (drop + rebuild) без изменения `sku_mapping`.
- Разрешение mapping MUST соблюдать приоритет: `subdivision` перед `org`.

**MUST NOT**
- `sku_mapping` MUST NOT иметь FK на `ingredient_cache.id` (или любой surrogate PK кэша).
- Commit-путь MUST NOT читать authority (существование / `unit` ингредиента) из `ingredient_cache`.
- Расхождение `unit` MUST NOT молча обновлять кэш и продолжать коммит.
- LCOS MUST NOT хранить master data ингредиента как authoritative source.
- Данная модель MUST NOT вводить embedding-зависимость (unused `pgvector` column к matching не привлекать; его судьба — отдельная задача на чистку dead code).

## Data model (эскиз; финализировать в 01_ARCHITECTURE)

```
ingredient_cache            -- НЕ authoritative: acceleration + display only
  id              PK (surrogate)      -- НИКОГДА не ссылка для mapping
  scope_type      enum(org|subdivision)
  scope_id        FK(org_id|subdivision_id)
  pos_ingredient_id           -- durable POS ID (см. VER-021)
  name, unit, category        -- snapshot из POS
  pos_version | content_hash  -- детект изменения на refresh
  is_active       bool                -- soft-delete, если POS удалил
  synced_at       timestamptz
  UNIQUE(scope_type, scope_id, pos_ingredient_id)

sku_mapping                 -- authoritative: актив LCOS (moat)
  id              PK
  scope_type      enum(org|subdivision)
  scope_id        FK
  source_key      text                -- см. DEC-0012 (правило нормализации/ключа)
  pos_ingredient_id           -- durable POS ID; НЕ FK на ingredient_cache.id
  method          enum(manual|fuzzy|ai)
  confidence      numeric
  confirmed_by, confirmed_at
  created_at, updated_at
  UNIQUE(scope_type, scope_id, source_key)
```

**Линчпин:** `sku_mapping.pos_ingredient_id` держится за durable POS ID. `ingredient_cache` можно снести целиком — mappings это переживут.

## Invariants → merge-blocking tests

- `test_cache_rebuild_preserves_mappings` — drop + rebuild `ingredient_cache` оставляет `sku_mapping` целым и резолвимым.
- `test_commit_blocked_when_pos_unavailable` — POS недоступен на commit → приход НЕ записан, строки на review.
- `test_commit_blocked_when_pos_id_missing` — `pos_ingredient_id` больше не существует в POS → commit заблокирован.
- `test_commit_blocked_on_unit_mismatch` — `unit` в live POS ≠ `unit` на момент mapping → commit заблокирован + re-валидация mapping.
- `test_matching_resolves_subdivision_before_org` — при наличии обоих mapping выигрывает subdivision.
- `test_mapping_has_no_fk_to_cache` — схемный тест: у `sku_mapping` нет FK на `ingredient_cache`.

## Sync strategy

Для Customer Zero (каталог кофейни ≈ сотни позиций): lazy TTL-refresh + принудительный refresh при открытии накладной + re-валидация на commit (попутно обновляет затронутые строки кэша). Delta-sync / webhooks — **DEFER-016** (до триггера по объёму/частоте). Вся синхронизация — за seam `ERPProvider`, одна реализация (Esupl) до реального триггера на альтернативу.

## Amendment 2026-07-08 — двухконтекстная модель резолва (реализация)

Из реализации выкристаллизовалась двухконтекстная модель (заменяет старую формулировку «Phase 1 matching order» как единый список; см. `01_ARCHITECTURE` → «SKU identity & the two-context resolver»):

- **Draft-резолв (`prepare()`, толерантно):** строит Esupl-payload из локального каталога (числовые FK). Подсказки (fuzzy layer-1, LLM `suggest-matches`, exact `ingredient_cache`) живут ТОЛЬКО здесь. `prepare()` НЕ трогает `pos_ingredient_id`.
- **Commit-резолв (`submit()` → `_resolve_commit_identity` → Phase 2, fail-closed):** durable `pos_ingredient_id` по `normalize_source_key(line.description)` из `sku_mapping`, приоритет subdivision → org, ТОЛЬКО подтверждённая идентичность (`method=manual` OR `confirmed_by`). Cache/fuzzy/AI на commit-пути НЕ участвуют. Затем live-валидация; None/mismatch/недоступность → block+review.

**T2 (esupl_item_id vs pos_ingredient_id):** одна сущность Esupl в двух представлениях — `esupl_item_id` (int, копия каталога для payload) и durable `pos_ingredient_id` (str, якорь идентичности в `sku_mapping`/на строке). `pos_ingredient_id == str(esupl ingredient id)`.

**T5/VER-022:** `ingredient_cache` — draft-only, scope-aware; под DEC-0013(A) НЕ является commit-тиром → прежняя scope-асимметрия «cache только org» устранена (commit-authority только из `sku_mapping`).

**Открытая зависимость:** VER-021 (durability) — по-прежнему GATE, эмпирически НЕ подтверждён (см. `scripts/ver021_durability_probe.py`).

## Consequences

- (+) Moat (`sku_mapping`) устойчив к протуханию каталога: держится за durable ID, а не за атрибуты.
- (+) Commit защищён fail-closed; рассинхрон не может привести к неверной записи прихода.
- (−) Требует READ-seam `ERPProvider` (`list_ingredients`, `get_ingredient`) — сейчас интеграция write-point only. → **ALIGN-014**.
- (−) Завязано на стабильность `pos_ingredient_id` в Esupl. Если ID регенерится при edit/merge — модель переоткрывается на альтернативный якорь. → **VER-021** (P0-линчпин).
