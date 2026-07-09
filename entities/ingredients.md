---
id: ingredients
type: entity
title: ingredients — каталог SKU (org + опциональный override по subdivision)
status: built
scope: org
table: ingredients
pk: id (uuid)
used_by: ["[[LCOS-F15-sku-catalog]]", "[[LCOS-F13-sku-identity-resolver]]"]
requirements: ["[[sku-identity-resolver]]", "[[erp-esupl-integration]]", "[[multitenancy]]"]
sources: [mvp.be/app/db/models.py:303-333, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# ingredients · каталог SKU

**Scope:** org обязателен (граница); `subdivision_id` — опциональный override
· **Status:** built

## Назначение
Каталог SKU организации. `organization_id` обязателен (граница изоляции);
`subdivision_id` — опциональный override (позиция для конкретной локации; NULL = общая
на всю организацию). Источник — синхронизация ERP или сид. Фаза 1 **не**
реализует логику слияния base+override (spec §2). Несёт числовые Esupl FK для построения
payload исходящей накладной ([[erp-esupl-integration]]).

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `organization_id` | uuid FK | no | граница, RESTRICT, индексируется (mixin) |
| `subdivision_id` | uuid FK→subdivisions | yes | `ondelete="CASCADE"`, индексируется; NULL = общий |
| `external_id` | varchar(128) | yes | id SKU в ERP; индексируется |
| `name` | varchar(512) | no | название |
| `unit` | varchar(32) | yes | базовая учётная единица |
| `esupl_item_id` | integer | yes | id позиции в Esupl (payload) |
| `esupl_unit_id` | integer | yes | id единицы в Esupl |
| `default_tax_rate` | numeric(6,2) | yes | ставка НДС по умолчанию, % |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Отношения, FK, уникальность
- FK `organization_id → organizations.id` **RESTRICT** (mixin).
- FK `subdivision_id → subdivisions.id` **CASCADE** (nullable override).
- `packings` — one-to-many, `cascade="all, delete-orphan"` ([[packings]]).
- **Уникальность:** `ingredients_org_sub_external` UNIQUE(`organization_id`,
  `subdivision_id`, `external_id`) — SKU уникален в своей области; общий по org и
  override по subdivision различаются по NULL/значению `subdivision_id`.
- **Индекс:** `ix_ingredients_org_name`(`organization_id`, `name`).

## Используется фичами
[[LCOS-F15-sku-catalog]] (каталог SKU и packings), [[LCOS-F13-sku-identity-resolver]] (identity resolver — целевой
каталог для матчинга строк). Поля Esupl FK питают payload [[LCOS-F10-invoice-status-machine]]/[[LCOS-F12-warehouse-target]].

## Источники
- `mvp.be/app/db/models.py:303-333` (модель `Ingredient`)
- [[sku-identity-resolver]], [[erp-esupl-integration]], [[architecture]] — data-model
