# ТЗ — Стабилизация (ВЫРОВНЕНО с DEC-0011/DEC-0013 и реальным кодом)

- **Date:** 2026-07-09
- **Supersedes-scope:** пересматривает `TZ__STABILIZATION_2026-07-09.md` после верификации против кода + ратифицированных решений.
- **For:** coding agent
- **Authority (по убыванию):** code + CLAUDE.md > DEC-0011 > DEC-0013 > этот ТЗ > предыдущие review/TZ.
- **Constraint (жёсткий):** Esupl — **read-only**. Читать можно; писать (create/edit/delete/POST) — ЗАПРЕЩЕНО. `ERP_WRITE_ENABLED` остаётся OFF.

## Почему этот документ

Предыдущий `TZ__STABILIZATION_2026-07-09` был проверен построчно против кода и DEC-0011/DEC-0013 (8 независимых агентов + adversarial-пасс). Итог: **несколько задач воскрешали отклонённый вариант C** и откатили бы корректный код + сломали зелёные merge_gate-тесты. Ниже — только то, что реально открыто и не нарушает архитектуру. Снятое зафиксировано в §«Снято» с обоснованием (ничего не теряем молча).

---

## Подтверждённый поток данных (SSOT — не менять без нового DEC)

- **Draft (`prepare()`, толерантно):** Esupl-payload строится из ЛОКАЛЬНОГО каталога — `esupl_item_id` (int), `esupl_unit_id` (POS-зеркало), packing. Подсказки fuzzy/AI/exact-cache — ТОЛЬКО здесь. `pos_ingredient_id` не трогается.
- **Commit (`submit()` → `_resolve_commit_identities` → Phase 2, fail-closed):** `pos_ingredient_id` резолвится ТОЛЬКО из `sku_mapping` (`method=manual` OR `confirmed_by`), приоритет subdivision → org. Затем live-валидация в POS (`GET /teams/{id}/products?id=`; нет точного матча → `None`, fail-closed, без `items[0]`). Unit: POS авторитетен, OCR — толерантный cross-check (block только если оба present и различаются). Кэш/fuzzy/AI на commit НЕ участвуют.
- **Write:** за `ERP_WRITE_ENABLED` (default OFF) → payload не уходит, возвращается prepared-id.

Этот поток = DEC-0011 (T2/T5) + DEC-0013 (вариант A). Код ему соответствует.

---

## Задачи (только реально открытые)

### S0 — Инфра-гейт: поднять БД и прогнать suite  `[P0 · блокирует верификацию]`
`conftest.py` требует ЖИВОЙ Postgres+pgvector (testcontainers НЕ подключены — упоминание в старом ТЗ было аспирационным). Нужна env с `DATABASE_URL` на Postgres+pgvector.
- `alembic upgrade head` (вкл. `0007_supplier_criteria`; downgrade рабочий — проверено).
- `pytest -m merge_gate -v`, полный DB-backed suite, `vitest run`.

**Evidence:** raw-вывод трёх прогонов; подтверждение `0007` (up + down).

### S1 — Esupl-контракт (read-only часть)  `[P0]`
Разделено на выполнимое-сейчас и заблокированное ограничением:
- **(read-only, делать сейчас)** Подтвердить чтением, что `GET /teams/{id}/products?id=` реально фильтрует по id (не игнорирует), и `product_name` + `operator[product_name]=like` реально ищет. Никаких записей.
- **(read-only)** Разрешить расхождение эндпоинтов: код commit-валидации читает `/teams/{id}/products?id=`, а VER-021 probe/док оперируют `/teams/{id}/ingredients/{id}` — это РАЗНЫЕ ресурсы. Либо задокументировать `products.id == ingredients.id` (тогда evidence probe переносится), либо мерить durability на реально используемом `/products?id=`.

**Acceptance:** таблица «запрос → ответ» из sandbox (только GET) + diff `01_ARCHITECTURE`. Если `id=` не честится → **STOP**, открыть DEC на резолв по стабильному коду.

### S1-GATE — VER-021 durability  `[P0 · ЗАБЛОКИРОВАНО ОГРАНИЧЕНИЕМ]`
Probe (`scripts/ver021_durability_probe.py`) требует create/edit/delete в sandbox (`VER021_CONFIRM=yes-write-to-sandbox-17957`, `ERP_WRITE_ENABLED=true`) — **нарушает read-only**. Под этим ограничением **не может быть закрыто агентом**.
**Действие:** гейт остаётся OPEN; прогон — за владельцем (Ivan) вне read-only сессии, вставить таблицу в `01_ARCHITECTURE`. Merge остаётся gated по VER-021 (как и было).

### S5 — Unit authority (D2) — дополнить тест  `[P1]`
D2 УЖЕ реализован (payload берёт POS-unit; comparator empty-tolerant/normalized; block только оба present+различаются). Из трёх тестов два уже есть под другими именами (`test_esupl_commit_validation_flags_real_unit_mismatch`, `test_esupl_commit_validation_tolerates_missing_ocr_unit`).
- Добавить недостающий: `test_unit_present_equal_passes` — оба unit present и равны (норм.) → `valid=True`. Страхует от регрессий over-blocking/нормализации.

**Evidence:** зелёный новый тест + ссылки на два существующих.

### S6 — Судьба `IngredientSKUFactory.save()` (FE)  `[P1]`
`mvp.fe/src/shared/sku/factory/ingredientFactory.ts:87` — `save()` осиротел (зовётся только своим тестом; singleton идёт в `SkuSelect2`→`SKUDropdown`, но `.save()` без рантайм-вызова). Пишет `method='manual'` — **commit-eligible под DEC-0013(A)**, значит провязка консистентна.
- **Либо** провязать в flow «create mapping from picker» (`method='manual'`, требует явного действия человека), **либо** удалить (zero dead code).
- ⚠️ НЕ реализовывать cache_exact/`confirmed_by='system'` auto-create (это снятый вариант C).

**Evidence:** строка, где `save()` провязан или удалён.

### S8 — Доказать + дополнить тесты  `[P0 · зависит от S0]`
- Приложить зелёный `pytest -m merge_gate` — **10 тестов** (7 durable-id + 3 DEC-0013 commit-gate), НЕ «5». `TrackerErpProvider` уже ассертит durable `pos_ingredient_id` (не суррогат).
- Добавить реально отсутствующие DB/HTTP/component-тесты:
  - criteria: HTTP 422 + JSONB round-trip (сейчас только pure `validate_criteria`);
  - `get_esupl_access` None-ветки (fail-closed) — тестов 0;
  - `sync_catalog_from_erp` — тестов 0;
  - per-org bootstrap resilience — тестов 0;
  - `GET /suppliers/criteria-schema` на уровне HTTP-клиента (сейчас только прямой вызов `criteria_schema()`);
  - `CriteriaFields` render/emit (сейчас только `lib/criteria.ts` helpers).

**Evidence:** raw-вывод pytest/vitest со всеми PASSED.

### S9 — Doc-alignment (канон)  `[P2]`
- Зафиксировать в `04_DECISIONS`, что **D1 (вариант C) отклонён/vetoed**, DEC-0013(A) остаётся в силе (append-запись, без удаления истории).
- `S2` семантика id — закрыть ссылкой на DEC-0011 T2 (уже решено).
- `01_ARCHITECTURE`: unit-authority (D2), VER-022 (закрыт DEC-0013), статус VER-021 (OPEN, write-gated); убрать формулировки, где draft/commit-порядок смешаны.

**Evidence:** diff `01_ARCHITECTURE` / `04_DECISIONS`.

---

## Снято относительно исходного ТЗ (с обоснованием — ничего не теряем молча)

| Пункт | Причина снятия | Пруф |
|---|---|---|
| **D1** (exact-cache commit → авто-`sku_mapping` `cache_exact`/`system`) | Это вариант C — явно **отклонён** DEC-0013; ниже по авторитету, чем DEC-0013. Решение Ivan (2026-07-09): оставить вариант A. | `DEC-0013.md:32` (C отклонён), adversarial: refuted=false |
| **S4** (scope-симметрия cache-тира на commit) | Кэша **нет** в commit-пути (`_resolve_commit_identities` читает только `sku_mapping`); VER-022 уже закрыт DEC-0013; модель кэша уже scope-aware. Возврат кэша в commit нарушил бы DEC-0011/0013. | `invoice_service.py:295-336`; `DEC-0011.md:99`; `DEC-0013.md:48` |
| **S6 auto-create** | Тот же вариант C. | `DEC-0013.md:42-43` MUST NOT |
| **S2 как открытый вопрос** | Уже решено: одна сущность Esupl в двух представлениях (`esupl_item_id` int-payload / `pos_ingredient_id` str-anchor, `== str(esupl id)`). | `DEC-0011.md:97` (T2); код `models.py:296/319/479` |
| **S7 (три line-ref)** | Все три **уже сделаны**; строки протухли: guards на `invoice_service.py:201-203` и `157-165`; float→Decimal в `catalog.py:38,43` (не `sku_service.py:171/175`, которых нет). | код |

---

## Definition of Done (выровненный)

- [ ] S0 — БД поднята, `merge_gate`(10) + DB-backed + vitest зелёные, `0007` применена.
- [ ] S1 — `id=`/`product_name` подтверждены чтением; расхождение `/products` vs `/ingredients` разрешено; в `01_ARCHITECTURE`.
- [ ] S1-GATE — VER-021: помечен owner-run/write-gated (НЕ закрывается в read-only сессии); merge остаётся gated.
- [ ] S5 — добавлен `test_unit_present_equal_passes` (зелёный).
- [x] S6 — moat provязан end-to-end: learning-loop мигрирован localStorage → backend `sku_mapping` (DEC-0012 композитный ключ + packing, миграции 0008/0009), persist на send + apply из backend, localStorage удалён. НИКАКОГО cache_exact auto-create. Verified: BE 201 / FE 37 / tsc / build.
- [x] S8 — `merge_gate` зелёный (17); добавлены недостающие DB/HTTP/component-тесты (criteria API, get_esupl_access, catalog sync, CriteriaFields); починена сломанная `conftest` client-фикстура. BE 201 passed, FE 37 passed.
- [ ] S9 — D1 зафиксирован как vetoed; S2 закрыт ссылкой на T2; канон приведён.
- [ ] Guardrails целы (fail-closed, single SoT, one-impl-per-seam, durable-id, zero dead code).

## Итоговый deliverable
Один PR + evidence-бандл: `pytest -m merge_gate`, DB-backed suite, `vitest`, таблица Esupl (только GET) из S1, diff доков. **Без бандла PR к ревью не принимается.** Проценты готовности не использовать.
