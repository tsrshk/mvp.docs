---
id: subdivisions
type: entity
title: subdivisions — subdivision (локация) внутри арендатора
status: built
scope: subdivision
table: subdivisions
pk: id (uuid)
used_by: ["[[LCOS-F1-multitenancy]]", "[[LCOS-F2-app-auth]]", "[[LCOS-F12-warehouse-target]]", "[[LCOS-F10-invoice-status-machine]]"]
requirements: ["[[multitenancy]]", "[[auth]]"]
sources: [mvp.be/app/db/models.py:101-121, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# subdivisions · subdivision

**Scope:** subdivision (раздел внутри org) · **Status:** built

## Назначение
Subdivision — это физическая локация (кофейня) внутри организации. Используется для
атрибуции операционных строк и как гранула доступа ([[member]] привязан к subdivision
через [[memberships]]). Фаза 1 **не** реализует наследование данных между subdivisions.
Привязка POS: subdivision = склад команды Esupl ([[erp-esupl-integration]]).

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `organization_id` | uuid FK→organizations | no | граница изоляции, `ondelete="CASCADE"`, индексируется |
| `name` | varchar(512) | no | название локации |
| `address` | varchar(1024) | yes | физический адрес |
| `esupl_warehouse_id` | integer | yes | id склада Esupl для warehouse-target ([[LCOS-F12-warehouse-target]]) |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Отношения, FK, уникальность
- FK `organization_id → organizations.id` **ondelete=CASCADE** (удаление организации
  удаляет её subdivisions).
- `memberships` — one-to-many, `cascade="all, delete-orphan"`.
- **Уникальность:** `subdivisions_org_name` UNIQUE(`organization_id`, `name`) — название
  локации уникально в пределах организации.
- На `subdivisions.id` ссылаются: [[invoices]], [[invoice_lines]], [[ingredients]]
  (nullable override), [[refresh_sessions]] (active_subdivision_id, SET NULL),
  [[integration_credentials]] (область subdivision, planned).

## Используется фичами
[[LCOS-F1-multitenancy]] (изоляция), [[LCOS-F2-app-auth]] (switch-context, активный subdivision в JWT),
[[LCOS-F12-warehouse-target]] (выбор warehouse-target → `esupl_warehouse_id`), [[LCOS-F10-invoice-status-machine]] (payload).

## Источники
- `mvp.be/app/db/models.py:101-121` (модель `Subdivision`)
- [[architecture]] — data-model
