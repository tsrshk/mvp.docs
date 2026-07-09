# ТЗ — Стабилизация проекта: единый merge-gate (DEC-0011 + Suppliers/Catalog/Perf)

- **Date:** 2026-07-09
- **For:** coding agent
- **Purpose:** свести два незакрытых потока (merge-gate DEC-0011 follow-up + Suppliers/Catalog/Perf) в один стабилизационный PR с общим определением «готово». Цель — выровняться по плану **без накопления архитектурного долга**.
- **Authority (по убыванию доверия):** code + CLAUDE.md > DEC-0011 > DEC-0013 / D2 (ниже) > этот ТЗ > предыдущие review.
- **Supersedes:** `TZ__DEC-0011_merge-gate_2026-07-08` (его T1–T8 перенесены сюда как S-задачи).

## Правила отчётности (без исключений)

- Отчёт = **артефакт-доказательство**: raw-вывод команды, лог sandbox, ссылка на строки. Проценты и слова «готово/ready/N%» не принимаются.
- «Тесты созданы/добавлены» ≠ закрыто. Закрыто = **вывод `pytest`**, где они PASSED.
- «mypy: no new vs baseline» не принимается для write-пути: требуется явно чистый write-кластер (S7), а не сравнение с шумным baseline.
- Структурный комментарий в коде не доказывает поведение. Поведение доказывается тестом.

## Архитектурные guardrails (каждая задача обязана их сохранить)

Стабилизация не имеет права нарушить ни один инвариант ради «быстрее замерджить»:

- **Fail-closed везде.** Никаких fallback, тихих skip, `items[0]`-подстановок на ответственном пути.
- **Single source of truth** на значение (креды через `get_esupl_access`, нормализация через `normalize_source_key`, unit-authority — см. D2).
- **Одна реализация на seam** (OCRProvider / ERPProvider / competitor-intel). Мёртвых/дублирующих реализаций не оставлять.
- **Durable-id anchoring:** authority Phase 2 — только `pos_ingredient_id` из mapping/кэш-snapshot, никогда суррогат.
- **Два независимых auth-плана** (SQLAdmin operator vs JWT app-user) не смешивать.
- **Zero dead code.** Осиротевший код либо провязывается, либо удаляется (см. S6).

---

## Последовательность (кратко)

```
S0 (инфра-гейт)  ──►  S1,S2 (гейты Esupl)  ──►  S3–S7 (корректность/moat/типы)  ──►  S8 (доказать тесты)  ──►  S9 (канон)
D1,D2 — ратифицировать до S5/S6 (по умолчанию применяются)
```

---

## РЕШЕНИЯ, зафиксированные этим ТЗ

### D1 — DEC-0013: moat на exact-cache commit  `[применяется по умолчанию · veto до S6]`

Строка, резолвнутая детерминированным exact-match по кэшу (без предсуществующего mapping) и успешно прошедшая live-валидацию Phase 2, **MUST создавать `sku_mapping`** (`method='cache_exact'`, `confirmed_by='system'`, `confirmed_at=now`). Fuzzy/AI — MUST NOT авторезолвиться в commit и MUST NOT создавать mapping без подтверждения человеком.

*Обоснование:* exact-match детерминирован и live-валидируется → авто-доверие оправдано; но без создания mapping moat не накапливается — это прямая потеря ключевого актива. Осиротевший `IngredientSKUFactory.save()` — симптом именно этой дыры.

### D2 — Unit authority: POS, OCR как cross-check  `[применяется по умолчанию · veto до S5]`

Уточнение DEC-0011 (POS — SoT для атрибутов ингредиента):
- Authoritative unit для записи прихода — **unit из POS-позиции** (`esupl_unit_id`), не из OCR.
- OCR-unit — только cross-check: **оба present и различаются → block + review** (расхождение по DEC-0011).
- OCR-unit **отсутствует → proceed** на POS-unit (расхождения нет, POS авторитетен).

*Обоснование:* делает толерантный компаратор (из последнего review) принципиальным, а не побочкой фикса over-blocking.
*Остаточный риск (осознать):* при отсутствующем OCR-unit количество принимается «как есть» в единицах POS; если накладная была в другой размерности — ошибка масштаба. Для Customer Zero приемлемо (человек в цикле, ручной ввод). **Veto-альтернатива:** отсутствие unit → soft-flag в review вместо тихого proceed.

---

## Задачи

### S0 — Инфра-гейт: поднять БД и прогнать полный suite  `[P0 · блокирует ВСЁ]`
Корень всех «непроверенных» отчётов: DB-backed и `merge_gate` тесты не запускались («host `db` unresolvable»). Пока не зелено — **ни один из двух потоков не верифицирован**.

- Поднять Postgres/testcontainers; `alembic upgrade head` (включая `0007_supplier_criteria`).
- Прогнать: `pytest -m merge_gate -v`, полный DB-backed suite, `vitest run`.

**Evidence:** raw-вывод всех трёх прогонов; подтверждение применения `0007` (up и down).

### S1 — Esupl-контракт + VER-021 (durability)  `[GATE · P0]`
Слито из T1 и §5.5 review: обе задачи проверяют одно — поведение Esupl по id/фильтрам. §5.5 сам сомневается, честит ли API `id=` — а если нет, `get_ingredient` вернёт `None` **всегда**, и вся Phase 2 тихо станет «всё блокируется».

На Esupl sandbox (team_id 17957):
- Подтвердить, что `GET /teams/{id}/products?id=` реально фильтрует по id (не игнорирует). Аналогично `product_name` LIKE.
- VER-021: create → id; edit (rename / unit / категория) → id неизменен? delete+recreate → поведение? merge/split → поведение?

**Acceptance:** результаты в `01_ARCHITECTURE`. Если `id=` не честится ИЛИ id не durable при edit → **STOP**, открыть DEC на альтернативу (например резолв по стабильному коду вместо id), не продолжать S6.
**Evidence:** таблица «запрос/операция → ответ» из sandbox + diff `01_ARCHITECTURE`.

### S2 — Семантика `esupl_item_id` vs `pos_ingredient_id`  `[GATE · P0]`
- Установить по коду: одно значение Esupl в двух представлениях (`int` vs `str`) или две разные сущности.
- Если одна — привести к единообразию либо задокументировать маппинг представлений; исключить риск двух конкурирующих «POS id».

**Evidence:** ответ 1–2 предложениями + ссылки на строки присвоения каждого поля.

### S3 — Локализовать fuzzy/AI; подтвердить commit-резолв детерминирован  `[P1]`
- Показать fuzzy/AI в **draft-пути** (подсказки; `fuzzy.ts` на FE подтверждён — нужен и backend-путь, если AI-тир есть).
- Подтвердить, что commit-резолв = `subdivision mapping → org mapping → cache exact` и **не содержит** fuzzy/AI (согласовано с D1).
- Если AI-тир отсутствует где-либо, где по DEC-0011 ожидался в draft — зафиксировать это как факт (дыра или намеренно).

**Evidence:** ссылки на строки draft- и commit-резолва + одно предложение о намеренности.

### S4 — Scope-симметрия cache-тира  `[P1]`
Mapping-тиры идут `subdivision → org`; cache-тир проверял только `org`.
- Определить фактический scope `ingredient_cache` (org-only или per-subdivision).
- Если per-subdivision возможен → cache-тир MUST соблюдать `subdivision → org`.
- Зафиксировать в `01_ARCHITECTURE` (закрывает VER-022).

**Evidence:** решение + diff; при правке резолвера — тест приоритета для кэша.

### S5 — Unit authority по D2  `[P1]`
- Реализовать модель D2: payload берёт unit из POS-позиции; OCR-unit — cross-check; оба present+различаются → block; OCR-unit отсутствует → proceed на POS-unit.
- Убедиться, что толерантный компаратор не пропускает **положительное** расхождение.

**Evidence:** тесты `test_unit_mismatch_blocks`, `test_unit_absent_uses_pos_unit`, `test_unit_present_equal_passes` (PASSED).

### S6 — DEC-0013: провязать moat  `[P1]`
- Commit через Tier-3 exact-match без mapping → создать `sku_mapping` (`method='cache_exact'`, `confirmed_by='system'`).
- Идемпотентность через UNIQUE `(scope_type, scope_id, source_key)` — повторный commit не плодит дубли.
- Разрешить судьбу `IngredientSKUFactory.save()`: **либо** провязать в «create mapping from picker» flow, **либо** удалить (zero dead code). Осиротевшим не оставлять.
- Fuzzy/AI — не создают mapping без подтверждения.

**Evidence:** `test_tier3_commit_creates_sku_mapping`, `test_tier3_commit_idempotent`, `test_fuzzy_ai_does_not_autocreate_mapping` (PASSED) + строка, где `save()` провязан либо удалён.

### S7 — Type safety на write-пути  `[P0 для write-кластера]`
- `invoice_service.py:171-173` — None-guards на `team_id/supplier_id/warehouse_id` **до** сборки `EsuplOutgoingInvoice`; None → commit blocked (часть fail-closed).
- `invoice_service.py:136-141` — guards на required-поля `EsuplLineItem` до создания.
- `sku_service.py:171,175` — `float → Decimal(str(...))` (деньги/количества — float недопустим).
- Остальной baseline-mypy шум — затриажить списком в PR (не обязателен к правке, но зафиксирован).

**Evidence:** вывод `mypy` — write-кластер чист; строки-guards; список затриажированного остатка.

### S8 — Доказать и дополнить тесты  `[P0 · зависит от S0]`
- Приложить зелёный `pytest -m merge_gate` (5 durable-id тестов) — из непрогнанного ведра S0.
- `TrackerErpProvider` MUST ассертить durable `pos_ingredient_id`, а не суррогат.
- Добавить отложенные DB-backed (§5.3 review): criteria 422 + JSONB round-trip, `get_esupl_access` None-ветки (fail-closed), `sync_catalog_from_erp`, per-org bootstrap resilience, `GET /suppliers/criteria-schema`, `CriteriaFields` render/emit.

**Evidence:** raw-вывод pytest со всеми перечисленными PASSED.

### S9 — Doc-alignment (канон)  `[P2]`
Зафиксировать двухконтекстную модель и оба решения:
- Draft-резолв: `subdivision mapping → org mapping → fuzzy → AI` поверх кэша.
- Commit-резолв: `subdivision mapping → org mapping → cache exact` (детерминированно, fail-closed), Tier-3 создаёт mapping (D1).
- Записать **DEC-0013** и **D2** в `04_DECISIONS`; обновить `01_ARCHITECTURE` (unit-authority, scope, VER-021/VER-022 findings); убрать формулировки, где draft- и commit-порядок смешаны.

**Evidence:** diff `01_ARCHITECTURE` / `04_DECISIONS`.

---

## Явно отложено (записать в 05_BACKLOG как DEFER, НЕ строить)

- **REQ 1b** — supplier analysis / order planning: model-only по checkpoint-решению; seam (JSONB + registry) готов. Consumer — следующая фаза.
- **`onSuggestLine` `useCallback`** — косметика; тяжёлая работа уже мемоизирована.
- **DEC-0012** — финальный композитный `source_key` (`supplier_id`): отложено. **НО** если scope уже многопоставщиковый — поднять до блокера (риск коллизий ключа); проверить и сообщить.

---

## Definition of Done (единый, оба потока)

Merge разрешён только когда всё закрыто **с Evidence**:

- [ ] S0 — БД поднята, `merge_gate` + DB-backed + vitest зелёные, `0007` применена (иначе НИЧЕГО не верифицировано).
- [ ] S1 — Esupl `id=`/`product_name` подтверждены; VER-021 durability подтверждена; в `01_ARCHITECTURE` (иначе STOP).
- [ ] S2 — семантика id-полей разрешена.
- [ ] S3 — fuzzy/AI локализованы; commit-резолв детерминирован.
- [ ] S4 — scope-симметрия cache-тира закрыта; VER-022 задокументирован.
- [ ] S5 — unit-authority по D2; три unit-теста зелёные.
- [ ] S6 — DEC-0013 провязан; `save()` провязан или удалён; три теста зелёные.
- [ ] S7 — write-кластер mypy чист; guards на месте; остаток затриажен.
- [ ] S8 — `merge_gate` зелёный (приложен); отложенные DB-тесты добавлены и зелёные.
- [ ] S9 — канон приведён к двухконтекстной модели; DEC-0013 и D2 записаны.
- [ ] Guardrails не нарушены (fail-closed, single SoT, one-impl-per-seam, durable-id, zero dead code).

## Итоговый deliverable

Один PR + **evidence-бандл** в описании: вывод `pytest -m merge_gate`, вывод полного DB-backed suite, `vitest`, `mypy` (write-кластер), таблица Esupl/VER-021 из sandbox, ответ по S2, ссылки на строки по S3/S4/S6. **Без бандла PR к ревью не принимается.** Проценты готовности в отчёте не использовать.
