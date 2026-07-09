---
id: ingredient_cache
type: entity
title: ingredient_cache — POS ingredient cache (non-authoritative, rebuildable)
status: built
scope: scoped
table: ingredient_cache
pk: id (uuid)
used_by: ["[[LCOS-F16-ingredient-cache]]", "[[LCOS-F13-sku-identity-resolver]]"]
requirements: ["[[sku-identity-resolver]]"]
sources: [mvp.be/app/db/models.py:432-461, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# ingredient_cache · POS ingredient cache

**Scope:** scope-aware (`scope_type` + `scope_id`: org or subdivision) · **Status:** built

## Purpose
A cache of POS ingredient data. **Non-authoritative** and **rebuildable** without data loss
(draft-only, [[LCOS-F16-ingredient-cache]]). The scope key is the pair (`scope_type`, `scope_id`), not a
direct FK to [[organizations]]/[[subdivisions]] (the scope-aware learning-loop design). The
identity resolver ([[sku-identity-resolver]], [[LCOS-F13-sku-identity-resolver]]) reads the cache for match hints,
but the durable identity is held by [[sku_mapping]]/[[invoice_lines]] via `pos_ingredient_id`,
so rebuilding the cache does not orphan the mappings.

## Key fields
| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `scope_type` | varchar(32) | no | `org` / `subdivision` (as a string, not an enum) |
| `scope_id` | uuid | no | indexed; id of the organization or subdivision |
| `pos_ingredient_id` | varchar(256) | no | durable POS id |
| `name` | varchar(512) | yes | name from POS |
| `unit` | varchar(32) | yes | unit |
| `category` | varchar(256) | yes | POS category |
| `pos_version` | varchar(128) | yes | version of the record in POS |
| `content_hash` | varchar(128) | yes | content hash (change detection on sync) |
| `is_active` | boolean | no | default true |
| `synced_at` | timestamptz | yes | moment of the last synchronization |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Relations, FK, uniqueness
- **No FK** to organizations/subdivisions — the scope is set by the pair (`scope_type`,
  `scope_id`) for flexibility and rebuild.
- **Uniqueness:** `uq_ingredient_cache_scope_pos_id` UNIQUE(`scope_type`, `scope_id`,
  `pos_ingredient_id`).
- **Index:** `scope_id` indexed.

## Used by features
[[LCOS-F16-ingredient-cache]] (ingredient cache, draft-only), [[LCOS-F13-sku-identity-resolver]] (resolver: source of candidates
for matching lines).

## Sources
- `mvp.be/app/db/models.py:432-461` (`IngredientCache` model)
- [[sku-identity-resolver]], [[architecture]] — data-model
