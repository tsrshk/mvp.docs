---
id: REQ-SKU-IDENTITY
type: requirement
title: Двухконтекстный резолвер идентичности SKU (draft tolerant / commit fail-closed)
status: built
scope: cross-cutting
roles: [member, admin]
entities: ["[[sku_mapping]]", "[[ingredient_cache]]", "[[ingredients]]", "[[invoice_lines]]", "[[packings]]"]
adrs: ["[[ADR-018]]", "[[ADR-019]]", "[[ADR-020]]", "[[ADR-013]]"]
requirements: ["[[fail-closed]]", "[[invoice-status-machine]]", "[[supplier-criteria-registry]]", "[[erp-esupl-integration]]", "[[global-requirements]]"]
legacy_refs: [DEC-0011, DEC-0012, DEC-0013, 08 F1.1/F1.2]
sources: [01_ARCHITECTURE.md "SKU identity & two-context resolver", APP_OVERVIEW.md §7/§8, 04_DECISIONS ADR-018..020]
ssot_for: [sku-identity, two-context-resolver, commit-identity-resolution, sku-mapping-composite-key, source-key-normalization, learning-loop-persist]
updated: 2026-07-20
---

# REQ-SKU-IDENTITY · Двухконтекстный резолвер идентичности SKU

**Type:** cross-cutting SSOT · **Status:** built. Сердце moat на основе learning-loop. Кодифицирует **DEC-0011 + DEC-0013 variant A + DEC-0012** ([[ADR-018]]/[[ADR-019]]/[[ADR-020]]).

## Нормативное положение

- **N1. Два отдельных контекста (не смешивать):**
  - **Draft-resolve (`prepare()`, tolerant, дешёвый):** строит Esupl-payload из **локального каталога** [[ingredients]] — числовые FK (`esupl_item_id`, `esupl_unit_id`, дефолтный [[packings]]), tax_rate. Готовность = «payload собираем». Подсказки (fuzzy слой 1 client-side, LLM `suggest-matches`, точные попадания из [[ingredient_cache]]) живут **только здесь** как hints. `prepare()` **не** трогает `pos_ingredient_id`.
  - **Commit-resolve (`submit()` → `_resolve_commit_identities` → Phase 2, fail-closed):** durable `pos_ingredient_id` разрешается через `normalize_source_key(line.description)` (та же нормализация, что и на записи — `sku_service.normalize_source_key`, SSOT) против [[sku_mapping]], приоритет **subdivision → org**.
- **N2. Commit-eligible = только подтверждённая identity:** `method='manual'` **ИЛИ** `confirmed_by IS NOT NULL`. Cache / fuzzy / AI на commit-пути **никогда** не консультируются.
- **N3. Live-валидация на commit** (`validate_ingredient_on_commit`): разрешённый id проверяется в POS (`GET /teams/{id}/products?id=`); любое исключение, отсутствующий id, рассинхрон unit → **block + review** (`rejected`, ничего не пишется). Неразрешённый (нет подтверждённого mapping) тоже блокирует — **никогда тихий пропуск**. При успехе durable id снапшотится в `invoice_lines.pos_ingredient_id`.
- **N4. DEC-0013 variant A (блок до подтверждения):** точное совпадение `ingredient_cache` **без** подтверждённого `sku_mapping` **не** авто-коммитит и **не** авто-создаёт mapping — строка удерживается для ручного подтверждения. Variant C (авто-создание `cache_exact`/`confirmed_by='system'`) **отклонён** ([[ADR-018]] veto 2026-07-09) — он ниже DEC-0013 по авторитету и ломает merge-gate тест `test_exact_cache_match_does_not_commit_and_creates_no_mapping`.
- **N5. Композитный ключ (DEC-0012, [[ADR-019]]):** `sku_mapping` ключуется `UNIQUE(scope_type, scope_id, supplier_external_id, source_key)`. `supplier_external_id` = durable Esupl-id поставщика (`''` = supplier-agnostic/legacy). Причина — один и тот же сырой текст от **разных поставщиков** может указывать на разные POS SKU; без поставщика в ключе — коллизия/перезапись.
- **N6. Канал накопления moat ([[ADR-020]]):** единственный runtime-канал — client-side `POST /ingredients/mappings`, который FE вызывает в `onSend` (`method='manual'`, `confirmed_by`=аутентифицированный пользователь) **ДО** мутации `sendInvoice`, в **отдельной транзакции**. BE submit endpoint **не пишет** `sku_mapping` — он только читает на commit-resolve. Persist-then-commit → подтверждённый mapping **переживает reject** накладной by design.
- **N7. `source_key` = сырой текст строки** (не имя SKU из каталога). Нормализация принадлежит backend (`normalize_source_key`); FE отправляет `rawName` и читает mappings из backend. Нормализация FE зеркалит backend (golden-vector parity test).
- **N8. `esupl_item_id` (int) vs `pos_ingredient_id` (str)** — одна сущность Esupl в двух представлениях: int-копия каталога для payload (draft-resolve, одноразовая/re-syncable) и str-якорь identity в `sku_mapping`/на строке (commit-resolve, moat). `pos_ingredient_id == str(esupl id)`.
- **N9. Unit-authority (D2):** unit в payload — **из POS** (`esupl_unit_id`), не OCR. Unit из OCR — tolerant кросс-проверка: блокирует commit только когда **оба** заданы и различаются (нормализованные по регистру/пробелам).

## Обоснование

POS — единственный SoT идентичности/атрибутов ингредиента; LCOS никогда не авторитетен над master data. Ценность LCOS — **mapping** (сырой текст строки → durable POS id), накапливающийся moat. Привязка к durable id (а не к суррогатному PK кэша) позволяет ему пережить drop+rebuild кэша. Fail-closed commit («накладная — ответственный шаг») требует явного подтверждения человеком для каждой новой позиции — это «review». Композитный ключ и persist-then-commit — точечные фиксы реальных коллизий/bootstrap-багов, найденных верификацией.

## Режимы отказа

- **Нет подтверждённого mapping** → block + review (не тихий пропуск и не авто-создание).
- **POS недоступен / id пропал / рассинхрон unit на commit** → block + review.
- **VER-021 (durability `pos_ingredient_id`) — OPEN GATE:** стабильность id при edit/delete-recreate НЕ подтверждена; owner-run (WRITE в sandbox Esupl), merge gated. Если id не durable → STOP и переоткрыть DEC-0011 ради альтернативного якоря. См. [[erp-esupl-integration]].
- **VER-022 (асимметрия scope кэша) — CLOSED:** при variant A кэш вне commit-пути, конфликта приоритета cache-vs-mapping нет.
- **`invoice_lines.sku_embedding Vector(1536)` — UNUSED мёртвый код:** не читается/пишется, нет ANN-индекса, нет embedding-провайдера; помечен на очистку (backlog DEC-02). Текущий matching — fuzzy + LLM, не эта колонка.

## Связи

- ADR: [[ADR-018]] (commit-gate variant A + veto C), [[ADR-019]] (композитный ключ DEC-0012), [[ADR-020]] (канал moat = `onSend`/persist-then-commit), [[ADR-013]] (photo-first — поставщик с фото).
- Сущности: [[sku_mapping]] (moat), [[ingredient_cache]] (draft-only, неавторитетный), [[ingredients]] (+ [[packings]], каталог), [[invoice_lines]] (durable id на строке).
- Требования: [[fail-closed]], [[invoice-status-machine]], [[erp-esupl-integration]], [[global-requirements]].

## На это ссылаются

`LCOS-F13` (Two-context SKU identity resolver), `LCOS-F14` (Learning-loop moat), `LCOS-F15` (catalog & packings), `LCOS-F16` (ingredient cache), `LCOS-F22` (SKU-identity stabilization), `LCOS-F9` (line↔catalog matching, draft-hints).

## Источники

- 01_ARCHITECTURE.md → "SKU identity & the two-context resolver (DEC-0011/0013 variant A)", T1/T2/T5/D2.
- APP_OVERVIEW.md §7, §8; 04_DECISIONS.md ADR-018/019/020; `__DEC-0011.md`, `__DEC-0013.md`.
- Код: `app/services/sku_service.py`, `invoice_service.py::_resolve_commit_identities`; FE `entities/invoice/lib/backendMappings.persistLineMapping`.
