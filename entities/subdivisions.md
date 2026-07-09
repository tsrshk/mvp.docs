---
id: subdivisions
type: entity
title: subdivisions — subdivision (location) within a tenant
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

**Scope:** subdivision (a section within an org) · **Status:** built

## Purpose
A subdivision is a physical location (coffee shop) within an organization. It is used to
attribute operational rows and as an access granule (a [[member]] is bound to a subdivision
via [[memberships]]). Phase 1 does **not** implement data inheritance between subdivisions.
POS binding: a subdivision = an Esupl team warehouse ([[erp-esupl-integration]]).

## Key fields
| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `organization_id` | uuid FK→organizations | no | isolation boundary, `ondelete="CASCADE"`, indexed |
| `name` | varchar(512) | no | location name |
| `address` | varchar(1024) | yes | physical address |
| `esupl_warehouse_id` | integer | yes | Esupl warehouse id for warehouse-target ([[LCOS-F12-warehouse-target]]) |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Relations, FK, uniqueness
- FK `organization_id → organizations.id` **ondelete=CASCADE** (deleting the organization
  deletes its subdivisions).
- `memberships` — one-to-many, `cascade="all, delete-orphan"`.
- **Uniqueness:** `subdivisions_org_name` UNIQUE(`organization_id`, `name`) — the location
  name is unique within an organization.
- `subdivisions.id` is referenced by: [[invoices]], [[invoice_lines]], [[ingredients]]
  (nullable override), [[refresh_sessions]] (active_subdivision_id, SET NULL),
  [[integration_credentials]] (subdivision scope, planned).

## Used by features
[[LCOS-F1-multitenancy]] (isolation), [[LCOS-F2-app-auth]] (switch-context, active subdivision in JWT),
[[LCOS-F12-warehouse-target]] (warehouse-target selection → `esupl_warehouse_id`), [[LCOS-F10-invoice-status-machine]] (payload).

## Sources
- `mvp.be/app/db/models.py:101-121` (`Subdivision` model)
- [[architecture]] — data-model
