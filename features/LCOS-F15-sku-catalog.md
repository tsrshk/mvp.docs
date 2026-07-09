---
id: LCOS-F15
type: feature
title: Каталог SKU и упаковки
epic: "[[LCOS-E3-sku-identity]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[ingredients]]", "[[packings]]", "[[invoice_lines]]", "[[suppliers]]", "[[subdivisions]]", "[[organizations]]"]
requirements: ["[[erp-esupl-integration]]", "[[sku-identity-resolver]]", "[[multitenancy]]"]
adrs: ["[[DEC-0011]]", "[[ADR-018]]"]
legacy_refs: [DEC-0011, "08 F1.1", "08 F1.2", "REQ 3", "REQ 4"]
sources: ["APP_OVERVIEW.md §7 §11", "mvp.be app/api/v1/routes/ingredients.py:70", "mvp.be app/services/catalog.py:25", "mvp.be app/services/catalog.py:59", "mvp.be app/services/invoice_service.py:422", "mvp.be app/db/models.py:303"]
updated: 2026-07-09
---
# LCOS-F15 · Каталог SKU и упаковки

**Эпик:** [[LCOS-E3-sku-identity]] · **Статус:** built · **Фаза:** Phase 1

## Описание

Локальная таблица `ingredients` — это **зеркало каталога POS** в LCOS — со scope организации, с опциональным override на уровне subdivision (позиция, специфичная для одной точки; `NULL` = общая для организации). Она намеренно **неавторитетна**: POS (Esupl) — единственный источник истины для идентичности и атрибутов ингредиента (`[[DEC-0011]]`), так что этот каталог никогда не трактуется как авторитет на пути коммита. Его две задачи: (1) питать толерантный **draft-resolve**, который строит payload исходящего инвойса Esupl, и (2) обеспечивать SKU-picker на фронтенде (REQ 3/4).

На draft-resolve (`_resolve_line`, см. [[LCOS-F9-line-matching]]) каталог поставляет числовые внешние ключи Esupl каждой строки — `esupl_item_id`, `esupl_unit_id` — плюс `default_tax_rate` и дефолтную упаковку. Отметьте два представления одной сущности Esupl: `esupl_item_id` (int, копия для payload) против долговечной строки `pos_ingredient_id`/`external_id`, используемой как якорь идентичности в других местах (`pos_ingredient_id == str(esupl id)`). Если какое-либо требуемое для POS поле отсутствует, строка помечается *not POS-ready* с resolution-note — ничего не фабрикуется.

`packings` моделируют, сколько базовых единиц живёт в одной единице упаковки (`factor`); у SKU может быть несколько, при этом **не более одной дефолтной** (обеспечивается частичным уникальным индексом), так что авто-заполнение детерминировано. Каждая упаковка также несёт `esupl_packing_id`.

Наполнение каталога — через `POST /ingredients/sync-from-erp`, который тянет каталог POS через read-only-шов [[erp-esupl-integration]] и добавляет отсутствующие позиции уровня организации. Он **идемпотентен и только-добавляет**: существующие `external_id` пропускаются, а хранимые строки не обновляются и не удаляются (дрейф каталога — известный пробел). Та же функция синхронизации — SSOT и для стартового bootstrap, и для ручного endpoint-а.

## Возможности

- `GET /ingredients` — возвращает каталог для активного scope (строки организации + override активной subdivision) как `IngredientRef`, включая упаковки, отсортированные default-first.
- `GET /ingredients/search?q=` — регистронезависимое частичное совпадение по имени.
- `GET /ingredients/by-supplier/{supplier_id}` — различные ингредиенты, которые поставлял этот поставщик, выведенные из истории инвойсов (`invoice_lines.sku == Ingredient.external_id`), со scope организации; используется для группировки в SKU-dropdown и предзаполнения заказов.
- Draft-resolve потребляет каталог: `esupl_item_id`, `esupl_unit_id`, `default_tax_rate` и дефолтная (или первая) упаковка копируются в строку для payload.
- Упаковки: `factor`, `is_default` (≤ 1 дефолтной на ингредиент через частичный уникальный индекс), `esupl_packing_id`.
- `POST /ingredients/sync-from-erp` — идемпотентная только-добавляющая синхронизация каталога уровня организации (`subdivision_id = NULL`); существующие ключи загружены одним запросом (нет N+1); ошибки распространяются (сбои VPN/ERP всплывают как `503`, а не глотаются в `200`).
- Уникальность `(organization_id, subdivision_id, external_id)`; `external_id` — это id SKU в ERP.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Читает каталог и ищет в нём внутри своего scope; триггерит синхронизацию с ERP (со scope арендатора). |
| [[admin]] | То же, внутри своей subdivision. |
| [[superadmin]] | Межарендаторский доступ. |
| [[sqladmin-operator]] | Не участвует в потоке каталога. |

Endpoint-ы со scope арендатора (активный контекст из JWT); member видит позиции уровня организации плюс override своей активной subdivision (REQ 3). См. [[auth]], [[multitenancy]].

## Задействованные сущности

- [[ingredients]] — локальный каталог (зеркало POS); источник числовых Esupl FK и `default_tax_rate` на draft-resolve; `(org, subdivision, external_id)` уникально.
- [[packings]] — опции упаковки на SKU; ≤ 1 дефолтной на ингредиент; `factor`, `esupl_packing_id`.
- [[invoice_lines]] — `by-supplier` выводит историю из строк; разрешённая строка несёт `external_id` каталога в `sku`.
- [[suppliers]] — ключ группировки `by-supplier`.
- [[subdivisions]], [[organizations]] — граница scope (строка организации vs override subdivision).

## Зависимости / связи

- **Требования:** [[erp-esupl-integration]] (синхронизация через `list_ingredients`, только-чтение), [[sku-identity-resolver]] (каталог — только толерантный *draft*-уровень, не авторитет коммита), [[multitenancy]] (scope org/subdivision).
- **Фичи:** [[LCOS-F13-sku-identity-resolver]] (draft-resolve потребляет FK; коммит **не** доверяет каталогу), [[LCOS-F9-line-matching]] (матчит строку к SKU каталога), [[LCOS-F11-esupl-read]] (чтение POS, из которого тянет синхронизация), [[LCOS-F16-ingredient-cache]] (отдельный неавторитетный шов ускорения), [[LCOS-F14-learning-loop]] (долговечный id выбранного SKU каталога — это то, что хранит подтверждённый маппинг).
- **ADR:** [[DEC-0011]] (POS = SoT, каталог неавторитетен), [[ADR-018]] (коммит доверяет только подтверждённому `sku_mapping`, никогда каталогу/кэшу).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `GET /ingredients` возвращает строки организации + override активной subdivision как `IngredientRef`, упаковки отсортированы default-first.
- [ ] AC-BE-2. `GET /ingredients/search?q=` — регистронезависимое частичное совпадение по имени.
- [ ] AC-BE-3. `GET /ingredients/by-supplier/{id}` возвращает различные ингредиенты, соединённые через `invoice_lines.sku == Ingredient.external_id`, отфильтрованные по организации вызывающего.
- [ ] AC-BE-4. Draft-resolve (`_resolve_line`) заполняет `esupl_item_id`, `esupl_unit_id`, `default_tax_rate` и дефолтную упаковку; когда какое-либо требуемое для POS поле отсутствует, строка помечается not-POS-ready с note (нет фабрикованных значений).
- [ ] AC-BE-5. Не более одной дефолтной упаковки на ингредиент (частичный уникальный индекс); резолвер выбирает дефолтную, иначе первую упаковку.
- [ ] AC-BE-6. `POST /ingredients/sync-from-erp` идемпотентен и только-добавляет: существующие `external_id` пропускаются; хранимые строки не обновляются и не удаляются; существующие ключи загружаются одним запросом (нет N+1).
- [ ] AC-BE-7. Синхронизация требует, чтобы организация была связана с командой Esupl (иначе `400`); сбои ERP/VPN распространяются к глобальным обработчикам (`VpnUnavailable → 503`), а не глотаются в тело `200`.
- [ ] AC-BE-8. Уникальность `(organization_id, subdivision_id, external_id)`; синхронизация каталога и стартовый bootstrap вызывают одну и ту же SSOT-функцию.
- [ ] AC-BE-9. Изоляция арендаторов: чтения каталога и синхронизация никогда не пересекают границы организаций.

### Frontend
- [ ] AC-FE-1. SKU-picker перечисляет каталог из `GET /ingredients` и авто-заполняет дефолтную упаковку при совпадении.
- [ ] AC-FE-2. Поиск по мере ввода запрашивает `GET /ingredients/search`.
- [ ] AC-FE-3. SKU-dropdown может группироваться по поставщику через `GET /ingredients/by-supplier/{id}`.
- [ ] AC-FE-4. Строка, чьё совпадение в каталоге отсутствует или неполно для POS, показывает свой resolution-note, а не молча продолжает.

### Прочее
- [ ] AC-OTHER-1. `ingredient_to_ref` — единственный конвертер ORM→домен (SSOT), используемый и маршрутами, и `SKUService`.

## Открытые вопросы / гейты

- **Дрейф каталога** — синхронизация только-добавляет; она не обновляет переименованные/перецененные/удалённые строки POS. Проход reconcile/update — отдельная задача (отмечено в `catalog.py`).
- **Слияние base + override** — комбинирование базовой строки организации с override subdivision в одно эффективное представление намеренно *не* реализовано (spec §2); override-ы стоят отдельно.
- **S1 только-чтение** — подтвердить, что фильтры `products?id=` / `product_name` учитываются; расхождение endpoint-ов `/products?id=` (код) vs `/ingredients/{id}` (проба) задокументировано (см. [[LCOS-F11-esupl-read]]).

## Источники

- `APP_OVERVIEW.md §7` (модель двух контекстов, каталог как draft-уровень), `§11` (модель данных, миграции `0001…0009`).
- `mvp.be/app/api/v1/routes/ingredients.py:70` (`list_ingredients`), `:75` (`search`), `:86` (`by-supplier`), `:210` (`sync-from-erp`).
- `mvp.be/app/services/catalog.py:25` (`ingredient_to_ref` SSOT), `:52` (`list_catalog`), `:59` (`sync_catalog_from_erp`, идемпотентная только-добавляющая).
- `mvp.be/app/services/invoice_service.py:422` (`_resolve_line`, разрешение каталога draft-контекста).
- `mvp.be/app/services/sku_service.py:82` (`SKUService` suppliers/ingredients/by-supplier).
- `mvp.be/app/db/models.py:303` (`Ingredient`), `:336` (`Packing`, частичный уникальный индекс одной дефолтной).
