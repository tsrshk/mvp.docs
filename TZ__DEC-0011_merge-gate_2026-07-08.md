# ТЗ — закрытие merge-gate DEC-0011 (BLOCKER #3 follow-up)

- **Date:** 2026-07-08
- **For:** coding agent
- **Authority (по убыванию доверия):** code + CLAUDE.md > DEC-0011 > DEC-0013 (ниже) > IMPLEMENTATION_REVIEW__PATCH_DEC-0011 > исходный review
- **Status of base work:** ядро BLOCKER #3 реализовано (нормализованный lookup + fail-closed цепь подтверждены структурно). Этот документ закрывает оставшиеся gate и одно нератифицированное решение.

## Правила отчётности (обязательны)

- НЕ отчитываться процентами и словами «готово / ready / 95%». Отчёт = **артефакт-доказательство** (лог, вывод команды, ссылка на строки).
- «Тесты созданы» не принимается. Принимается **вывод** `pytest`.
- Каждая задача закрывается только приложенным Evidence из её блока. Нет Evidence → задача открыта.
- Структурный комментарий в коде («non-authoritative») не является доказательством поведения. Поведение доказывается тестом.

---

## РЕШЕНИЕ, зафиксированное этим ТЗ — DEC-0013

**Контекст.** Строка накладной без подтверждённого `sku_mapping`, но с точным совпадением имени в `ingredient_cache` (Tier 3), сейчас авторезолвится и коммитится после live-валидации Phase 2. Это было принято реализацией молча (открытый вопрос §3.4 патча).

**Рассмотренные варианты.**

| Вариант | Трение UX | Moat накапливается | Fail-closed |
|---|---|---|---|
| A. Блокировать в review до ручного подтверждения | высокое (на каждой новой позиции) | да | да |
| B. Авторезолв exact-match, как сейчас | нет | **нет** (mapping не создаётся) | да (live-валидация) |
| C. Авторезолв exact-match **+ создание `sku_mapping` на первом commit** | нет | **да** | да |

**Решение: вариант C.** Детерминированный exact-cache-match — это не «догадка» (в отличие от fuzzy/AI), он live-валидируется в Phase 2, поэтому авто-доверие оправдано. Но текущая реализация теряет главный актив: mapping не создаётся, и moat не растёт. C устраняет ровно эту потерю без UX-трения.

**Нормативно (DEC-0013):**
- Успешный commit строки, резолвнутой через Tier 3 (exact cache-match, без предсуществующего mapping), MUST создать `sku_mapping` (`method='cache_exact'`, `confirmed_by='system'`, `confirmed_at=now`) в scope строки.
- Fuzzy/AI-совпадения MUST NOT авторезолвиться в commit-пути и MUST NOT создавать mapping без явного подтверждения человеком (они живут только в draft-пути как подсказки).

> **Veto-окно:** DEC-0013 применяется по умолчанию. Если Ivan отклонит вариант C в пользу A/B — сообщить до начала T6.

---

## Задачи (строгий порядок; T1–T2 — gate, не начинать T6 до их закрытия)

### T1 — VER-021: эмпирическая durability `pos_ingredient_id`  `[GATE · P0]`
Весь durable-id plumbing держится на недоказанном допущении.

- Выполнить на Esupl sandbox (team_id 17957): create → записать id; edit (rename / смена `unit` / смена категории) → сверить id; delete+recreate → зафиксировать поведение; merge/split (если есть) → поведение.
- **MUST** записать результат в `01_ARCHITECTURE`.
- Если id НЕ durable при edit → **STOP всей ветки**, открыть DEC на альтернативный якорь, не продолжать.

**Evidence:** таблица «операция → id до/после» из sandbox + diff `01_ARCHITECTURE`.

### T2 — PRE-2: семантика `esupl_item_id` vs `pos_ingredient_id`  `[GATE · P0]`
- Установить по коду, чем физически заполняется каждое поле и указывают ли они на **один** объект Esupl или на **разные**.
- Объяснить разницу типов (`int` vs `str`): это одно значение в разных представлениях или две сущности.
- Если это одна сущность — привести имена/типы к единообразию или задокументировать маппинг представлений.

**Evidence:** одно-два предложения с ответом + ссылки на строки, где каждое поле присваивается.

### T3 — Доказать прохождение merge-gate тестов  `[P0]`
- Приложить **полный вывод** `pytest -m merge_gate -v`.
- Все 5 тестов из `test_merge_gate_durable_id.py` — PASSED.
- `TrackerErpProvider` MUST реально ассертить, что в `validate_ingredient_on_commit` пришёл `mapping.pos_ingredient_id` (durable), а НЕ суррогат кэша.

**Evidence:** raw-вывод pytest (не список имён).

### T4 — Локализовать fuzzy/AI и подтвердить исключение из commit  `[P1]`
Реализованный commit-роутинг — `subdivision mapping → org mapping → org cache exact`. Fuzzy/AI в `_resolve_line` отсутствуют.

- Показать, где fuzzy/AI живут в **draft-пути** (подсказки дропдауна).
- Подтвердить, что их отсутствие в commit-резолве — **намеренно** (согласуется с DEC-0013: догадка не коммитится). Если fuzzy/AI просто выпали и нигде нет — это дыра, восстановить в draft-пути.

**Evidence:** ссылки на строки draft-пути с fuzzy/AI + одно предложение о намеренности.

### T5 — Устранить асимметрию scope в Tier 3  `[P1]`
Mapping-тиры проверяют `subdivision → org`; cache-тир проверяет только `org`. Либо кэш только org-scoped (тогда зафиксировать в VER-022), либо это баг приоритета.

- Определить фактический scope `ingredient_cache` (org-only или per-subdivision).
- Если per-subdivision возможен → cache-тир MUST соблюдать `subdivision → org`, как mapping.
- Зафиксировать вывод в `01_ARCHITECTURE` (закрывает VER-022).

**Evidence:** решение + diff `01_ARCHITECTURE`; при необходимости — правка резолвера + тест приоритета для кэша.

### T6 — Реализовать DEC-0013 (moat на exact-cache commit)  `[P1]`
- Commit строки через Tier 3 без предсуществующего mapping → создать `sku_mapping` (`method='cache_exact'`, `confirmed_by='system'`, `confirmed_at`).
- Идемпотентность: повторный commit той же строки не плодит дубликаты (опора на UNIQUE `(scope_type, scope_id, source_key)`).
- Fuzzy/AI — MUST NOT создавать mapping без подтверждения человеком.

**Evidence:** новый тест `test_tier3_commit_creates_sku_mapping` (PASSED) + тест идемпотентности + тест `test_fuzzy_ai_does_not_autocreate_mapping`.

### T7 — Type safety на write-пути  `[P0 для write-кластера]`
16 mypy-ошибок из отчёта. Разделены по критичности:

**Блокирующие (граница записи прихода):**
- `invoice_service.py:171-173` — `team_id / supplier_id / warehouse_id` могут быть `None` при сборке `EsuplOutgoingInvoice`. MUST добавить None-guards **до** построения payload; None → commit blocked (часть fail-closed, не косметика).
- `invoice_service.py:136-141` — Optional в required-полях `EsuplLineItem`. Аналогично: guard до создания.
- `sku_service.py:171,175` — `float → Decimal`. В учётных/денежных/количественных полях float недопустим. Обернуть `Decimal(str(...))`.

**Неблокирующие:** остальные mypy-ошибки — устранить или явно затриажить в PR-описании.

**Evidence:** вывод `mypy` — write-кластер чист; остаток либо чист, либо затриажен списком.

### T8 — Doc-alignment: два контекста резолва  `[P2]`
Из реализации выкристаллизовалась (корректная) двухконтекстная модель — зафиксировать в каноне вместо старой формулировки:

- **Draft-резолв** (подсказки, толерантно): `subdivision mapping → org mapping → fuzzy → AI` поверх кэша.
- **Commit-резолв** (детерминированно, fail-closed): `subdivision mapping → org mapping → cache exact-match`. Никаких fuzzy/AI. Tier 3 создаёт mapping (DEC-0013).

- **MUST** обновить `01_ARCHITECTURE` и, при расхождении, `DEC-0011` под эту двухконтекстную модель.
- Убрать любую формулировку, где draft- и commit-порядок смешаны в один список.

**Evidence:** diff `01_ARCHITECTURE` / `04_DECISIONS`.

---

## Definition of Done (merge-gate)

Merge разрешён только когда все пункты закрыты **с приложенным Evidence**:

- [ ] T1 — VER-021 выполнен на sandbox, durability подтверждена, записана в `01_ARCHITECTURE` (иначе STOP).
- [ ] T2 — семантика полей разрешена, ответ в PR.
- [ ] T3 — `pytest -m merge_gate` зелёный, вывод приложен; Tracker ассертит durable id.
- [ ] T4 — fuzzy/AI локализованы в draft-пути; исключение из commit подтверждено.
- [ ] T5 — scope-асимметрия Tier 3 закрыта; VER-022 задокументирован.
- [ ] T6 — DEC-0013 реализован; три теста зелёные.
- [ ] T7 — write-кластер mypy чист; остаток затриажен.
- [ ] T8 — канон приведён к двухконтекстной модели резолва.

## Итоговый deliverable

Один PR + **evidence-бандл** в описании: вывод `pytest -m merge_gate`, вывод `mypy`, таблица VER-021 из sandbox, ответ по T2, ссылки на строки по T4/T5. Без бандла PR к ревью не принимается.
