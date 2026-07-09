---
id: ingredients
type: entity
title: ingredients — SKU catalog (org + optional subdivision override)
status: built
scope: org
table: ingredients
pk: id (uuid)
used_by: ["[[LCOS-F15-sku-catalog]]", "[[LCOS-F13-sku-identity-resolver]]"]
requirements: ["[[sku-identity-resolver]]", "[[erp-esupl-integration]]", "[[multitenancy]]"]
sources: [mvp.be/app/db/models.py:303-333, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# ingredients · SKU catalog

**Scope:** org required (boundary); `subdivision_id` — optional override
· **Status:** built

## Purpose
The organization's SKU catalog. `organization_id` is required (isolation boundary);
`subdivision_id` is an optional override (an item for a specific location; NULL = shared
across the organization). The source is an ERP sync or a seed. Phase 1 does **not**
implement base+override merge logic (spec §2). It carries the numeric Esupl FKs for building
the outgoing-invoice payload ([[erp-esupl-integration]]).

## Key fields
| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `organization_id` | uuid FK | no | boundary, RESTRICT, indexed (mixin) |
| `subdivision_id` | uuid FK→subdivisions | yes | `ondelete="CASCADE"`, indexed; NULL = shared |
| `external_id` | varchar(128) | yes | SKU id in the ERP; indexed |
| `name` | varchar(512) | no | name |
| `unit` | varchar(32) | yes | base accounting unit |
| `esupl_item_id` | integer | yes | item id in Esupl (payload) |
| `esupl_unit_id` | integer | yes | unit id in Esupl |
| `default_tax_rate` | numeric(6,2) | yes | default VAT rate % |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Relations, FK, uniqueness
- FK `organization_id → organizations.id` **RESTRICT** (mixin).
- FK `subdivision_id → subdivisions.id` **CASCADE** (nullable override).
- `packings` — one-to-many, `cascade="all, delete-orphan"` ([[packings]]).
- **Uniqueness:** `ingredients_org_sub_external` UNIQUE(`organization_id`,
  `subdivision_id`, `external_id`) — a SKU is unique within its scope; the org-shared and
  the subdivision-override are distinguished by NULL/value of `subdivision_id`.
- **Index:** `ix_ingredients_org_name`(`organization_id`, `name`).

## Used by features
[[LCOS-F15-sku-catalog]] (SKU catalog and packings), [[LCOS-F13-sku-identity-resolver]] (identity resolver — the target
catalog for matching lines). The Esupl FK fields feed the payload of [[LCOS-F10-invoice-status-machine]]/[[LCOS-F12-warehouse-target]].

## Sources
- `mvp.be/app/db/models.py:303-333` (`Ingredient` model)
- [[sku-identity-resolver]], [[erp-esupl-integration]], [[architecture]] — data-model
