---
id: LCOS-F13
type: feature
title: Двухконтекстный резолвер идентичности SKU
epic: "[[LCOS-E3-sku-identity]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[sku_mapping]]", "[[ingredients]]", "[[ingredient_cache]]", "[[invoice_lines]]", "[[subdivisions]]", "[[organizations]]"]
requirements: ["[[sku-identity-resolver]]", "[[fail-closed]]", "[[erp-esupl-integration]]", "[[invoice-status-machine]]"]
adrs: ["[[ADR-018]]", "[[ADR-019]]", "[[ADR-020]]"]
legacy_refs: [DEC-0011, DEC-0013, DEC-0012, "08 F1.1", "08 F1.2"]
sources: ["APP_OVERVIEW.md §7", "04_DECISIONS__DEC-0011.md", "04_DECISIONS__DEC-0013.md", "mvp.be app/services/invoice_service.py:295", "mvp.be app/services/sku_service.py"]
updated: 2026-07-09
---
# LCOS-F13 · Двухконтекстный резолвер идентичности SKU
**Эпик:** [[LCOS-E3-sku-identity]] · **Статус:** built · **Фаза:** Phase 1

## Описание

Ядро «рва» LCOS: как строка инвойса превращается в **долговечную** идентичность POS-SKU. Модель разделяет две сущности (`DEC-0011`):

- **Master-данные ингредиента** (`name`, `unit`, `category`) — сторонний актив, которым владеет POS (Esupl). LCOS никогда не авторитетен.
- **Маппинг** (`source_key` → идентичность) — актив LCOS, накапливающийся «ров».

Разрешение идентичности намеренно разделено на **два контекста** с разной строгостью:

- **Draft resolve** (`prepare`, толерантный): строит POS-payload из **локального каталога** — числовые Esupl FK (`esupl_item_id`, `esupl_unit_id`, `packing`), `tax_rate`. Подсказки (нечёткие / LLM / точно-кэшевые) живут **только здесь**. Долговечный `pos_ingredient_id` здесь **не трогается** (`_resolve_line`).
- **Commit resolve** (`submit` → `_resolve_commit_identities` → live-валидация Phase-2, **fail-closed**): долговечный `pos_ingredient_id` берётся **только из `sku_mapping`**, приоритет `subdivision → org`, и **только подтверждённая идентичность** (`method=manual` ИЛИ `confirmed_by IS NOT NULL`). Кэш / нечёткость / AI в коммите **не** участвуют.

После разрешения из маппинга делается **live-запрос к POS** (`GET /teams/{id}/products?id=`); при отсутствии точного совпадения — `None`, **без фолбэка `items[0]`**. `None` / несовпадение / недоступность POS → **блок + review** (строка не коммитится). Это **вариант A** (`DEC-0013`, `[[ADR-018]]`): точное совпадение в кэше без подтверждённого маппинга НЕ авто-коммитит и НЕ авто-создаёт маппинг. Вариант C (авто-создание) был предложен в ТЗ и **отклонён**.

## Возможности

- Разделение draft-контекста (толерантный, payload) и commit-контекста (fail-closed, долговечная идентичность).
- Commit resolve в **одном запросе** для всех строк: `IN` по `(scope_type, scope_id)` ∈ {`subdivision`, `org`} + равенство по `supplier_external_id` + `source_key IN keys` + фильтр `commit_eligible`; приоритет `subdivision → org` разрешается в памяти.
- **Ключ маппинга составной** (`DEC-0012`, `[[ADR-019]]`): `(scope_type, scope_id, supplier_external_id, source_key)`; тот же текст строки от **разных поставщиков** может указывать на разные POS-SKU — без поставщика в ключе это коллизия.
- `source_key` — **нормализованный сырой текст строки** (не имя SKU каталога); нормализация — это бэкенд-SSOT `normalize_source_key`; FE-нормализация зеркалит её (golden-vector тест паритета).
- Два представления одной сущности Esupl: `esupl_item_id` (int, копия каталога для payload) vs `pos_ingredient_id` (str, якорь идентичности; `pos_ingredient_id == str(esupl id)`).
- **Авторитетность единицы (D2):** единица payload приходит из POS (`esupl_unit_id`); единица OCR — толерантная перекрёстная проверка (блок только если обе установлены и различаются).
- Live-проверки на строку при коммите выполняются **параллельно** (`asyncio.gather`) — ~1×RTT вместо N×RTT.
- Fail-closed на всех неопределённостях: нет подтверждённого маппинга / POS недоступен / несовпадение → блок, никогда fail-open.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Подтверждает совпадение строка → SKU при отправке инвойса (это человеческое подтверждение идентичности); резолвер работает внутри его scope арендатора. |
| [[admin]] | То же внутри subdivision. |
| [[superadmin]] | Межарендаторский доступ. |

У резолвера нет собственного UI-endpoint — он вызывается внутри `submit` (см. [[LCOS-F10-invoice-status-machine]]); запись подтверждённого маппинга — отдельный вызов (см. [[LCOS-F14-learning-loop]]).

## Задействованные сущности

- [[sku_mapping]] — **единственный** источник долговечной идентичности на коммите; ключ `(scope_type, scope_id, supplier_external_id, source_key)`; поля `pos_ingredient_id`, `method`, `confidence`, `confirmed_by`, `packing`.
- [[ingredients]] — локальный каталог (зеркало POS); источник числовых Esupl FK и `tax_rate` на draft resolve.
- [[ingredient_cache]] — неавторитетный кэш только для черновика; он **не** участвует на пути коммита (VER-022 закрыт).
- [[invoice_lines]] — строка держит долговечный `pos_ingredient_id` (снимок закоммиченного id на `prepared`).
- [[subdivisions]], [[organizations]] — определяют приоритет scope разрешения (`subdivision → org`).

## Зависимости / связи

- **Требования:** [[sku-identity-resolver]] (нормативный SSOT этой механики), [[fail-closed]] (блок + review на неопределённостях), [[erp-esupl-integration]] (live `products?id=`, только-чтение), [[invoice-status-machine]] (где вызывается commit resolve).
- **Фичи:** [[LCOS-F14-learning-loop]] (запись подтверждённого маппинга, persist-then-commit), [[LCOS-F15-sku-catalog]] (каталог + упаковки), [[LCOS-F16-ingredient-cache]] (кэш только для черновика), [[LCOS-F9-line-matching]] (draft resolve строк), [[LCOS-F22-sku-stabilization]] (merge-gate стабилизации).
- **ADR:** [[ADR-018]] (вариант A — коммит требует подтверждённой идентичности; вариант C отклонён), [[ADR-019]] (составной ключ, DEC-0012), [[ADR-020]] (persist-then-commit — почему маппинг переживает reject).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `_resolve_commit_identities` разрешает долговечный `pos_ingredient_id` **только из `sku_mapping`** — кэш/нечёткость/AI не читаются на коммите.
- [ ] AC-BE-2. Учитывается только **подтверждённая** идентичность: `method=MappingMethod.manual` ИЛИ `confirmed_by IS NOT NULL` (`commit_eligible`).
- [ ] AC-BE-3. Приоритет scope `subdivision → org`: когда существуют оба маппинга, побеждает subdivision (разрешается в памяти через `by_key`).
- [ ] AC-BE-4. Ключ включает `supplier_external_id`: тот же `source_key` от разных поставщиков разрешается в разные `pos_ingredient_id` (DEC-0012); опирается на `UNIQUE(scope_type,scope_id,supplier_external_id,source_key)`.
- [ ] AC-BE-5. `source_key` = `normalize_source_key(line.description)` (сырой текст строки), не имя каталога; та же нормализация, что и при записи маппинга.
- [ ] AC-BE-6. Строка без подтверждённого маппинга → `pos_ingredient_id = None` → ошибка `unresolved_sku` и блок (fail-closed, НЕ skip).
- [ ] AC-BE-7. Live-валидация: `GET products?id=`; нет точного совпадения → `None` **без фолбэка `items[0]`**; несовпадение единиц (обе установлены) → блок; исключение провайдера (POS недоступен) → блок (fail-closed).
- [ ] AC-BE-8. Точное совпадение в кэше без подтверждённого маппинга НЕ авто-коммитит и НЕ создаёт маппинг (вариант A, `[[ADR-018]]`) — покрыто merge-gate тестом.
- [ ] AC-BE-9. Commit resolve — один SQL-запрос по всем строкам; live-проверки параллельны (`asyncio.gather`).
- [ ] AC-BE-10. Изоляция арендаторов: разрешение не видит маппинги другой организации (scope в сигнатуре репозитория/запроса).

### Frontend
- [ ] AC-FE-1. `normalizeSourceKey(rawName)` зеркалит бэкенд-нормализацию — golden-vector тест паритета зелёный.
- [ ] AC-FE-2. Строка без подтверждённой идентичности показывается как «требует подтверждения SKU» (состояние блока), а не отправляется молча.

### Прочее (данные)
- [ ] AC-OTHER-1. Маркер `merge_gate` (17 тестов долговечных id + DEC-0013) зелёный и блокирует merge.
- [ ] AC-OTHER-2. `ingredient_cache` подтверждённо отсутствует на пути коммита (регресс-тест VER-022).

## Открытые вопросы / гейты

- **VER-021** — долговечность `pos_ingredient_id` при edit/delete-recreate в Esupl НЕ подтверждена эмпирически; проба требует ЗАПИСИ в песочницу → **запуск владельцем**, merge остаётся гейтированным. См. [[VER-021_ESUPL_DURABILITY_TEST]].
- **S1 только-чтение** — подтвердить, что фильтры `products?id=` / `product_name` учитываются; расхождение endpoint-ов `/products?id=` (код) vs `/ingredients/{id}` (проба) задокументировано.
- Семантический матчинг (`invoice_lines.sku_embedding`) — неиспользуемый столбец, намечен к очистке мёртвого кода (`DEC-0011`, backlog `DEC-02`, `status: open`).

## Источники

- `APP_OVERVIEW.md §7` (модель двух контекстов, вариант A, DEC-0012, авторитетность единицы), `§8` (цикл обучения), `§11`.
- `04_DECISIONS__DEC-0011.md`, `04_DECISIONS__DEC-0013.md` (вариант A vs C).
- `mvp.be/app/services/invoice_service.py:295` (`_resolve_commit_identities`), `:343` (`_validate_ingredients_on_commit`), `:422` (`_resolve_line`, draft-контекст).
- `mvp.be/app/services/sku_service.py` (`normalize_source_key`).
