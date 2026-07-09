---
id: packings
type: entity
title: packings — SKU packings (factor to the base unit)
status: built
scope: org
table: packings
pk: id (uuid)
used_by: ["[[LCOS-F15-sku-catalog]]", "[[LCOS-F10-invoice-status-machine]]"]
requirements: ["[[erp-esupl-integration]]", "[[multitenancy]]"]
sources: [mvp.be/app/db/models.py:336-363, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# packings · SKU packings

**Scope:** org (carries `organization_id`, bound to [[ingredients]]) · **Status:** built

## Purpose
A SKU packing: how many base accounting units are in one packing unit (`factor`). A SKU can
have several packings; exactly one is marked as default and is substituted when a line is
matched — this makes auto-substitution deterministic. It carries `esupl_packing_id` for the
payload ([[erp-esupl-integration]]).

## Key fields
| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `organization_id` | uuid FK | no | boundary, RESTRICT, indexed (mixin) |
| `ingredient_id` | uuid FK→ingredients | no | `ondelete="CASCADE"`, indexed |
| `name` | varchar(128) | no | e.g. "box of 12 pcs" |
| `factor` | numeric(14,4) | no | default 1; base units per packing |
| `is_default` | boolean | no | default false; ≤1 default per SKU |
| `esupl_packing_id` | integer | yes | packing id in Esupl |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Relations, FK, uniqueness
- FK `organization_id → organizations.id` **RESTRICT** (mixin).
- FK `ingredient_id → ingredients.id` **CASCADE** (deleting the SKU deletes its packings).
- **Partial unique index:** `uq_packings_default_per_ingredient`(`ingredient_id`) UNIQUE
  `WHERE is_default` — at most one default packing per SKU → deterministic
  auto-substitution.

## Used by features
[[LCOS-F15-sku-catalog]] (SKU catalog and packings), [[LCOS-F10-invoice-status-machine]] (payload: recompute of quantity by
`factor`, `esupl_packing_id`).

> The learned packing factor per (supplier, source_key) is stored separately — in
> [[sku_mapping]].`packing` (learning-loop), not in this table.

## Sources
- `mvp.be/app/db/models.py:336-363` (`Packing` model)
- [[erp-esupl-integration]], [[architecture]] — data-model
