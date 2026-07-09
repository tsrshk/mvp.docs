# PATCH к IMPLEMENTATION_REVIEW — исправленный план фикса BLOCKER #3 + усиленный merge-gate

- **Date:** 2026-07-08
- **Supersedes:** раздел «Fixing Strategy → BLOCKER #3» и «Test Coverage» исходного репорта
- **Amends:** BLOCKER #2 (cascade), порядок работ (VER-021 поднят до gate)
- **Authority:** DEC-0011, DEC-0012, 05_BACKLOG (VER-021/022, ALIGN-014/015/016)

> Причина патча: диагнозы репорта по #1/#2/#3 верны, но **предложенный фикс #3 сам нарушает DEC-0011** — он превращает fail-closed в fail-open. Агент MUST выполнять этот патч, а НЕ «Fix Sequence» из исходного репорта.

---

## 0. Порядок работ (изменён)

Строгая последовательность. Не начинать шаг N+1 до закрытия N.

1. **PRE-1 — VER-021** (эмпирическая проверка durability `pos_ingredient_id`). Было «deferred» → поднято до **gate перед #3**.
2. **PRE-2** — прояснить семантику `esupl_item_id` vs `pos_ingredient_id`.
3. **BLOCKER #3** — по контракту из §3 (не по репорту).
4. **BLOCKER #2** — с поправкой на cascade (§4).
5. **BLOCKER #1** — тривиально, в любой момент (§5).
6. **Tests** — усилить до фактической защиты инварианта (§6).

---

## 1. PRE-1 — VER-021 обязателен ДО фикса #3  `[GATE]`

Форма фикса #3 зависит от того, durable ли `pos_ingredient_id` в Esupl. Строить plumbing durable-id, не проверив это, — риск переделки всего.

**Действие:** на Esupl sandbox (team_id 17957):
1. Создать позицию → записать `pos_ingredient_id`.
2. Edit (rename / смена `unit` / смена категории) → сверить, что ID не изменился.
3. Delete + recreate → зафиксировать, меняется ли / переиспользуется ID.
4. Merge/split позиций (если поддерживается) → поведение ID.

**Acceptance:** результат задокументирован в `01_ARCHITECTURE`.
- ID durable при edit → продолжаем §3 как есть.
- ID НЕ durable → **STOP**: открыть новый DEC на альтернативный якорь; §3 переписывается. Не писать код #3.

---

## 2. PRE-2 — прояснить `esupl_item_id` vs `pos_ingredient_id`  `[GATE]`

Репорт внутренне противоречив: имя `esupl_item_id` буквально означает «ID позиции в Esupl» (то есть durable POS ID), но репорт называет его суррогатом, который «меняется при rebuild кэша». Оба сразу быть не может. Пока это не установлено — фикс #3 применять НЕЛЬЗЯ (риск завести два конкурирующих «POS id» и чинить не то).

**Действие:** установить фактически (по коду `entities.py` / `models.py`), чем заполняется `esupl_item_id` на draft-строке:
- **Случай A:** это суррогатный PK строки `ingredient_cache` (`ingredient_cache.id`). → имя вводит в заблуждение; переименовать в `cache_row_id`; как authority не использовать нигде.
- **Случай B:** это snapshot-колонка `ingredient_cache.pos_ingredient_id` (durable). → тогда #3 — это не «взять другой id», а «гарантировать, что берётся durable-значение через `sku_mapping`, а не напрямую из кэша в обход mapping-приоритета».

**Acceptance:** в PR-описании явно указан выбранный случай (A/B). От него зависит формулировка §3.

---

## 3. BLOCKER #3 — корректный контракт (нормативный)

### 3.1 Что в фиксе репорта СЛОМАНО (MUST NOT воспроизводить)

- **(B) lookup по сырому тексту.** Репорт: `get(..., source_key=line.raw_name)`. Запись же нормализует ключ (`lowercase+trim+collapse`). Чтение по `raw_name` почти всегда промахивается → `pos_ingredient_id=None` → валидация пропущена. Это **тихо отключает Phase 2 на всех строках**. MUST NOT.
- **(C) «нет mapping → skip validation».** Это fail-open. Строка без durable id на commit MUST блокироваться, а не проскакивать гейт. MUST NOT skip.
- **(D) повторный отдельный запрос + только subdivision.** Репорт переискивает mapping вторым запросом и только в subdivision-scope. Ломается приоритет `subdivision→org`, а для fuzzy/AI durable id вообще неоткуда. MUST NOT re-query; durable id MUST протягиваться из момента резолва Phase 1.
- **esupl_item_id как authority.** MUST NOT читать его в Phase 2 как источник истины (см. PRE-2).

### 3.2 Корректный контракт

**MUST**
- Durable `pos_ingredient_id` присваивается `InvoiceLineDraft` **в момент резолва Phase 1** (в единственном шаге резолва, без повторного запроса), по источнику:
  - резолв через `sku_mapping` (manual/fuzzy/ai) → `line.pos_ingredient_id = mapping.pos_ingredient_id`, с соблюдением приоритета **subdivision → org**;
  - прямое fuzzy/AI-совпадение с кэшем без ещё существующего mapping → `line.pos_ingredient_id = ingredient_cache.pos_ingredient_id` (durable snapshot-колонка).
- Lookup `sku_mapping` MUST идти по **нормализованному** `source_key`, той же функцией нормализации, что и запись. Функция нормализации MUST быть одна (single source of truth) и вызываться и на write, и на read.
- Phase 2 MUST валидировать `line.pos_ingredient_id`.
- Если на commit `line.pos_ingredient_id is None` → **block + review**. MUST NOT skip, MUST NOT записывать приход.

**MUST NOT**
- MUST NOT брать durable id из суррогатного PK (`ingredient_cache.id` / любой row-id).
- MUST NOT переискивать mapping в Phase 2/prepare отдельным запросом по имени.
- MUST NOT молча пропускать валидацию при отсутствии id.

### 3.3 Иллюстрация (сверить идентификаторы с фактическим кодом!)

```python
# domain/entities.py
class InvoiceLineDraft:
    ...
    pos_ingredient_id: str | None = None   # durable POS ID, проставляется в Phase 1
    # esupl_item_id -> см. PRE-2: либо удалить, либо пометить display-only non-authoritative

# services/invoice_service.py — единый шаг резолва (Phase 1)
async def _resolve_line(self, line, ctx):
    key = normalize_source_key(line.raw_name)          # ТА ЖЕ ф-ция, что на write
    mapping = await self.mappings.resolve(              # приоритет внутри resolve():
        scope_chain=[("subdivision", ctx.subdivision_id),
                     ("org",         ctx.org_id)],
        source_key=key,
    )
    if mapping:
        line.pos_ingredient_id = mapping.pos_ingredient_id      # durable из mapping
        line.method = mapping.method
        return
    # нет mapping -> fuzzy/AI поверх кэша
    hit = await self.matcher.fuzzy_then_ai(key, ctx)           # возвращает cache-row
    if hit:
        line.pos_ingredient_id = hit.pos_ingredient_id          # durable snapshot из кэша
        line.method = hit.method                                # fuzzy | ai
    # иначе pos_ingredient_id остаётся None -> заблокируется на commit

# services/invoice_service.py — Phase 2 (commit, fail-closed)
async def _validate_line_on_commit(self, line):
    if line.pos_ingredient_id is None:
        raise CommitBlocked(line, reason="unresolved_sku")      # review, НЕ skip
    result = await self.erp.validate_ingredient_on_commit(
        pos_ingredient_id=line.pos_ingredient_id,               # durable, не кэш
        expected_unit=line.unit or "",
    )
    if not result.ok:
        raise CommitBlocked(line, reason=result.reason)         # missing / unit_mismatch / pos_unavailable
```

### 3.4 Открытый вопрос к ратификации (fail-closed vs UX)

Строка, чей `pos_ingredient_id` получен из **неподтверждённого** fuzzy/AI-предположения (`method in {fuzzy, ai}`, нет `confirmed_by`), — должна ли она коммититься автоматически?

- Строгий fail-closed: **нет** — неподтверждённая догадка на commit → block + review; commit разрешён только для подтверждённой идентичности (`manual` или подтверждённый mapping).
- **Рекомендация:** принять строгий вариант (это ровно «накладная — ответственный этап»). Оформить как DEC-0013, если решение положительное. До ратификации — реализовать строгий вариант по умолчанию (безопаснее откатить, чем чинить записанный мусор).

---

## 4. BLOCKER #2 — поправка (cascade + реальная проверка divergence)

Удаление FK со `scope_id` — верно (scope полиморфный, одним FK не выразить). Но:

- **MUST** зафиксировать судьбу `ondelete=CASCADE` явно, а не терять молча:
  - `ingredient_cache` — cascade не нужен (кэш выбрасываемый).
  - `sku_mapping` — cascade **не восстанавливать**: moat не должен сноситься каскадом при удалении subdivision. Очистка mappings — осознанная операция, не побочный эффект FK.
- **MUST** после правки прогнать `alembic revision --autogenerate` вхолостую и убедиться, что diff пуст. Репортовая проверка `alembic current` показывает лишь текущую ревизию, **не** расхождение ORM↔схема — её недостаточно.

---

## 5. BLOCKER #1 — без изменений (тривиально)

```diff
// mvp.fe/src/shared/sku/factory/ingredientFactory.ts:128
- const response = await fetch(`${this.baseUrl}/mappings`, {
+ const response = await fetch(`${this.baseUrl}/ingredients/mappings`, {
```
Verify: POST `/api/v1/ingredients/mappings` → 200/201 с `MappingResponse`.

---

## 6. Усиленные merge-gate тесты  `[обязательно]`

Причина: репорт сам признаёт, что `test_missing_pos_ingredient_id_blocks_commit` не ловит реальные пропуски — значит гейт зелёный при нарушенном инварианте. «6/6 passing» до этих правок ничего не значит.

**Обязательные новые/переписанные тесты:**

- `test_phase2_validates_durable_id_from_mapping`
  `FakeErpProvider` MUST запоминать id, с которым его вызвали. Тест ассертит: вызван с `mapping.pos_ingredient_id`, **не** с суррогатным row-id.
- `test_cache_rebuild_does_not_change_committed_id`
  Пересобрать `ingredient_cache` (суррогатные PK меняются) → id, уходящий в Phase 2 по той же строке, MUST остаться прежним durable-значением.
- `test_unresolved_line_blocks_commit_not_skip`
  Строка без mapping и без fuzzy/AI-хита на commit → `CommitBlocked(reason="unresolved_sku")`. MUST NOT записать приход, MUST NOT пропустить валидацию.
- `test_mapping_lookup_uses_normalized_key`
  Запись mapping по «Сахар Песок », чтение по «сахар песок» → находит. Защита от бага (B).
- `test_resolution_prefers_subdivision_over_org_for_durable_id`
  При наличии mapping и в subdivision, и в org → в Phase 2 уходит durable id из subdivision-mapping.

**Gate:** merge заблокирован, пока все перечисленные не зелёные **и** помечены как merge-blocking (`pytest -m merge_gate`).

---

## 7. Definition of Done (пересмотрено)

- [ ] PRE-1 (VER-021) выполнен, результат в `01_ARCHITECTURE`; durability подтверждена (иначе STOP).
- [ ] PRE-2 разрешён; случай A/B зафиксирован в PR.
- [ ] BLOCKER #3 по §3 (не по репорту); durable id протянут из Phase 1; нормализованный lookup; None-на-commit → block.
- [ ] BLOCKER #2: FK снят у обеих таблиц; cascade-решение записано; `autogenerate` diff пуст.
- [ ] BLOCKER #1: endpoint исправлен; POST не 404.
- [ ] Все тесты §6 зелёные и merge-blocking.
- [ ] Doc-alignment: порядок резолва в 01_ARCHITECTURE = `subdivision → org → fuzzy → AI` поверх кэша (убрать ошибочный отдельный тир `cache` из формулировки VER-022).
- [ ] (если ратифицировано) DEC-0013 про неподтверждённые fuzzy/AI на commit.

**Deferred (не блокирует этот PR):** DEC-0012 финальное правило `source_key` (композит с `supplier_id`) — но если scope многопоставщиковый уже сейчас, поднять до блокера (риск коллизий ключа).
