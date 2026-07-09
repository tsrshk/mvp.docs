---
id: sku_mapping
type: entity
title: sku_mapping — durable mapping source_key → POS ingredient (learning-loop moat)
status: built
scope: scoped
table: sku_mapping
pk: id (uuid)
used_by: ["[[LCOS-F13-sku-identity-resolver]]", "[[LCOS-F14-learning-loop]]"]
requirements: ["[[sku-identity-resolver]]", "[[fail-closed]]"]
adrs: ["[[ADR-019]]", "[[ADR-020]]"]
sources: [mvp.be/app/db/models.py:464-507, __DEC-0011, __DEC-0013]
updated: 2026-07-09
---
# sku_mapping · learning-loop moat

**Scope:** scope-aware (`scope_type` + `scope_id`) · **Status:** built

## Purpose
A mapping of the raw invoice line text (`source_key`) to a **durable POS ingredient id**.
The core of the learning-loop moat ([[LCOS-E3-sku-identity]], [[LCOS-F14-learning-loop]]): every confirmed match is
reused. `pos_ingredient_id` is a durable POS string **without an FK** to
[[ingredient_cache]], so rebuilding the cache does not orphan the mappings
(DEC-0011/DEC-0013, [[ADR-019]]/[[ADR-020]]).

**DEC-0012 (ADR-019):** the supplier is part of the key. The same raw text from DIFFERENT
suppliers may map to DIFFERENT POS SKUs — without `supplier_external_id` in the key this is
a UNIQUE collision. `''` = supplier-agnostic/legacy.

## Key fields
| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `scope_type` | varchar(32) | no | `org` / `subdivision` (as a string) |
| `scope_id` | uuid | no | indexed |
| `source_key` | varchar(512) | no | raw line text (normalized) |
| `supplier_external_id` | varchar(256) | no | server_default `''`; durable Esupl supplier id |
| `pos_ingredient_id` | varchar(256) | no | durable POS id (NOT an FK) |
| `method` | enum `mapping_method` | no | `manual` / `fuzzy` / `ai` |
| `confidence` | numeric(5,4) | yes | match score |
| `confirmed_by` | uuid FK→users | yes | `ondelete="SET NULL"` |
| `confirmed_at` | timestamptz | yes | moment of confirmation |
| `packing` | numeric(12,4) | yes | learned packing factor per (supplier, source_key) |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Composite key / uniqueness
- **Composite UNIQUE:** `uq_sku_mapping_scope_supplier_source` UNIQUE(**`scope_type`,
  `scope_id`, `supplier_external_id`, `source_key`**) — the mapping's identity. It is
  precisely the supplier in the key that separates identical text from different suppliers.
- **No FK** `pos_ingredient_id → ingredient_cache` (by design — rebuild-safe).
- FK `confirmed_by → users.id` **SET NULL** (deleting a user does not break the mapping).
- **Index:** `scope_id` indexed.

## Behavior notes
- `packing` is **not read** by the fail-closed commit resolver ([[fail-closed]]); but on
  auto-fill the FE restores it into the line, and it multiplies into the quantity actually
  sent to POS → an incorrect value is a data-quality problem, not cosmetics.
- Nullable `packing`: legacy/identity-only mappings without a packing.

## Used by features
[[LCOS-F13-sku-identity-resolver]] (the identity resolver reads mappings), [[LCOS-F14-learning-loop]] (learning-loop:
write/confirm, the durable moat).

## Sources
- `mvp.be/app/db/models.py:464-507` (`SkuMapping` model), `:75-78` (`MappingMethod`)
- [[ADR-019]], [[ADR-020]], DEC-0011/DEC-0013, [[sku-identity-resolver]]
