---
id: price_list_line
type: entity
title: price_list_line — позиция прайс-листа поставщика (append-only, драйвер freshness)
status: built
scope: org
table: price_list_lines
pk: id (int)
used_by: ["[[LCOS-F73-price-list-parsing]]", "[[LCOS-F74-supplier-assortment-freshness]]", "[[LCOS-F75-supplier-price-analytics]]"]
requirements: ["[[multitenancy]]", "[[sku-identity-resolver]]"]
sources: [entities/price_list_line.md, LCOS-E4-suppliers, LCOS-F73-price-list-parsing]
updated: 2026-07-13
---
# price_list_lines · позиция прайс-листа

**Scope:** org (`organization_id` — граница изоляции) · **Status:** built

## Назначение
Отдельная позиция прайс-листа поставщика, полученная парсингом загрузки
[[price_list_upload]] (любой вход: файл/фото/буклет/сообщение → структурированные строки,
[[LCOS-F73-price-list-parsing]]). Таблица **append-only**: каждая наблюдённая цена
фиксируется как исторический факт и не переписывается.

Ключевой драйвер — поле `observed_at`: дата наблюдения цены (= `effective_date` загрузки,
иначе дата загрузки). Оно питает freshness ассортимента ([[LCOS-F74-supplier-assortment-freshness]],
«обновлено N дней назад») и аналитику ([[LCOS-F75-supplier-price-analytics]]).

Разрешённые (со связанным SKU) строки **проецируются** в единый временной ряд
`supplier_prices` [[LCOS-F20-price-history]] (`source = price_list_upload`, `observed_at`
из загрузки, цена = `price_per_base_unit`). Проекция идемпотентна по
`source_price_list_line_id`, поэтому [[LCOS-F21-price-change-signal]] и сравнение поставщиков
работают поверх всех источников.

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | int PK | no | |
| `organization_id` | uuid FK→organizations | no | `RESTRICT`; граница изоляции; indexed |
| `price_list_upload_id` | int FK→price_list_uploads.id | no | `CASCADE`; родительская загрузка |
| `supplier_id` | int FK→suppliers.id | no | `CASCADE`; денормализовано для запросов |
| `line_no` | int | no | порядок в документе |
| `raw_name` | varchar(512) | no | как напечатано в прайсе |
| `raw_unit` | varchar(64) | yes | |
| `raw_packing` | varchar(128) | yes | |
| `price` | numeric(14,4) | no | цена как в прайсе; **CHECK (price >= 0)**; `price = 0` допускается, но НЕ проецируется в `supplier_prices` |
| `currency` | varchar(8) | no | default `BYN` |
| `price_per_base_unit` | numeric(14,4) | yes | нормализовано через фактор фасовки (`packings`), когда SKU разрешён |
| `pos_ingredient_id` | varchar(256) | yes | долговечный POS-SKU (через `sku_mapping` / [[LCOS-F13-sku-identity-resolver]]); длина как у `SkuMapping.pos_ingredient_id` |
| `ingredient_id` | uuid FK→ingredients.id | yes | `SET NULL`; локальный каталожный SKU, если есть (`ingredients.id` — uuid) |
| `resolution_method` | varchar | yes | enum `mapping_method`: `manual` / `fuzzy` / `ai`; **NULL = unresolved**; переиспользует существующий тип (`create_type=False`) |
| `resolution_confidence` | numeric(4,3) | yes | |
| `is_available` | boolean | no | default `true`; присутствует ли позиция в этом прайсе (для ассортимента) |
| `observed_at` | date | no | дата наблюдения цены (= `effective_date` загрузки, иначе дата загрузки); **драйвер freshness** |
| `created_at` | timestamptz | no | |

## Отношения, FK, уникальность
- `price_list_upload_id → price_list_uploads.id` **CASCADE** — строки живут вместе с загрузкой.
- `supplier_id → suppliers.id` **CASCADE** — денормализация для прямых запросов по поставщику.
- `ingredient_id → ingredients.id` **SET NULL** — локальный каталожный SKU не обязателен.
- `pos_ingredient_id` — долговечная POS-строка (не FK), резолв через `sku_mapping` (F13).
- **Индексы:** `(organization_id, supplier_id, observed_at)`,
  `(organization_id, pos_ingredient_id, observed_at)`, `(price_list_upload_id)`.

## Инвариант append-only
- `price`, `raw_*` (`raw_name` / `raw_unit` / `raw_packing`), `observed_at` — **immutable**
  после создания: это исторический факт наблюдённой цены.
- Поля связи с SKU `resolution_*` (`resolution_method`, `resolution_confidence`,
  `pos_ingredient_id`, `ingredient_id`, `price_per_base_unit`) **МОГУТ** дозаполняться и
  исправляться при ручной дочистке строк со статусом `needs_review` — это не нарушает
  историю цен, а лишь уточняет связь с каталогом.

## Используется фичами
[[LCOS-F73-price-list-parsing]] (создаёт строки, резолвит SKU, проецирует в `supplier_prices`),
[[LCOS-F74-supplier-assortment-freshness]] (ассортимент + freshness по `observed_at`),
[[LCOS-F75-supplier-price-analytics]] (аналитика роста цен и ассортимента).

## Источники
- Спецификация эпика [[LCOS-E4-suppliers]], фича [[LCOS-F73-price-list-parsing]]
- Родительская сущность [[price_list_upload]]; проекция в [[LCOS-F20-price-history]]
