---
id: invoice_lines
type: entity
title: invoice_lines — invoice lines
status: built
scope: subdivision
table: invoice_lines
pk: id (int)
used_by: ["[[LCOS-F8-ocr-recognition]]", "[[LCOS-F9-line-matching]]", "[[LCOS-F13-sku-identity-resolver]]", "[[LCOS-F14-learning-loop]]"]
requirements: ["[[sku-identity-resolver]]", "[[multitenancy]]"]
sources: [mvp.be/app/db/models.py:277-300, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# invoice_lines · invoice lines

**Scope:** subdivision (`organization_id` + `subdivision_id`) · **Status:** built

## Purpose
Invoice line items obtained from OCR ([[LCOS-F8-ocr-recognition]]) and resolved to a POS identity
([[sku-identity-resolver]], [[LCOS-F13-sku-identity-resolver]]/[[LCOS-F14-learning-loop]]). `pos_ingredient_id` is the durable
POS identity, fixed at commit: a snapshot of [[sku_mapping]].`pos_ingredient_id` at the
moment of the write; it holds a durable POS ID, NOT a cache, so it survives a rebuild of
[[ingredient_cache]].

> **DEAD CODE:** the `sku_embedding` column (`Vector(1536)`) is **NOT USED**. It was planned
> for semantic mapping that was never implemented. Marked for cleanup (backlog **DEC-02**).
> It is neither read nor written by any path.

## Key fields
| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | int PK | no | autoincrement |
| `organization_id` | uuid FK | no | boundary, RESTRICT, indexed (mixin) |
| `subdivision_id` | uuid FK | no | RESTRICT, indexed (mixin) |
| `invoice_id` | int FK→invoices | no | `ondelete="CASCADE"`, indexed |
| `line_no` | int | no | line order |
| `description` | text | no | raw line text (matching source_key) |
| `sku` | varchar(128) | yes | SKU from the document |
| `quantity` | numeric(14,3) | yes | quantity |
| `unit` | varchar(32) | yes | unit |
| `unit_price` | numeric(14,4) | yes | price per unit |
| `line_total` | numeric(14,2) | yes | line total (arithmetic check) |
| `pos_ingredient_id` | varchar(256) | yes | durable POS id, snapshot at commit; NULL until commit |
| `sku_embedding` | Vector(1536) | yes | **UNUSED / dead-code (DEC-02)** |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Relations, FK, uniqueness
- FK `invoice_id → invoices.id` **CASCADE** (deleting the invoice deletes its lines).
- FK `organization_id`/`subdivision_id` **RESTRICT** (mixin).
- No UNIQUE constraints on lines (order is set by `line_no`).
- `pos_ingredient_id` — not an FK to [[ingredient_cache]]; a durable string by the
  learning-loop design (DEC-0011/DEC-0012, [[ADR-019]]).

## Used by features
[[LCOS-F8-ocr-recognition]] (OCR lines), [[LCOS-F9-line-matching]] (line↔catalog matching), [[LCOS-F13-sku-identity-resolver]] (identity
resolver), [[LCOS-F14-learning-loop]] (learning-loop, snapshot of `pos_ingredient_id` at commit).

## Sources
- `mvp.be/app/db/models.py:277-300` (`InvoiceLine` model), `:42` (`SKU_EMBEDDING_DIM`)
- [[sku-identity-resolver]], [[architecture]] — data-model
