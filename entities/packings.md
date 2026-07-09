---
id: packings
type: entity
title: packings — фасовки SKU (коэффициент к базовой единице)
status: built
scope: org
table: packings
pk: id (uuid)
used_by: ["[[LCOS-F15-sku-catalog]]", "[[LCOS-F10-invoice-status-machine]]"]
requirements: ["[[erp-esupl-integration]]", "[[multitenancy]]"]
sources: [mvp.be/app/db/models.py:336-363, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# packings · фасовки SKU

**Scope:** org (несёт `organization_id`, привязана к [[ingredients]]) · **Status:** built

## Назначение
Фасовка SKU: сколько базовых учётных единиц в одной единице фасовки (`factor`). У SKU может
быть несколько фасовок; ровно одна помечена как default и подставляется при матчинге
строки — это делает автоподстановку детерминированной. Несёт `esupl_packing_id` для
payload ([[erp-esupl-integration]]).

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `organization_id` | uuid FK | no | граница, RESTRICT, индексируется (mixin) |
| `ingredient_id` | uuid FK→ingredients | no | `ondelete="CASCADE"`, индексируется |
| `name` | varchar(128) | no | напр. "коробка 12 шт" |
| `factor` | numeric(14,4) | no | default 1; базовых единиц в фасовке |
| `is_default` | boolean | no | default false; ≤1 default на SKU |
| `esupl_packing_id` | integer | yes | id фасовки в Esupl |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Отношения, FK, уникальность
- FK `organization_id → organizations.id` **RESTRICT** (mixin).
- FK `ingredient_id → ingredients.id` **CASCADE** (удаление SKU удаляет его фасовки).
- **Частичный уникальный индекс:** `uq_packings_default_per_ingredient`(`ingredient_id`) UNIQUE
  `WHERE is_default` — не более одной default-фасовки на SKU → детерминированная
  автоподстановка.

## Используется фичами
[[LCOS-F15-sku-catalog]] (каталог SKU и фасовки), [[LCOS-F10-invoice-status-machine]] (payload: пересчёт количества по
`factor`, `esupl_packing_id`).

> Обученный коэффициент фасовки по (supplier, source_key) хранится отдельно — в
> [[sku_mapping]].`packing` (learning-loop), а не в этой таблице.

## Источники
- `mvp.be/app/db/models.py:336-363` (модель `Packing`)
- [[erp-esupl-integration]], [[architecture]] — data-model
