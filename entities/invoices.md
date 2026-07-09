---
id: invoices
type: entity
title: invoices — invoice (draft → payload → record)
status: built
scope: subdivision
table: invoices
pk: id (int)
used_by: ["[[LCOS-F8-ocr-recognition]]", "[[LCOS-F9-line-matching]]", "[[LCOS-F10-invoice-status-machine]]", "[[LCOS-F11-esupl-read]]"]
requirements: ["[[invoice-status-machine]]", "[[erp-esupl-integration]]", "[[multitenancy]]"]
sources: [mvp.be/app/db/models.py:235-274, 01_ARCHITECTURE.md#data-model, APP_OVERVIEW.md §7]
updated: 2026-07-09
---
# invoices · invoice

**Scope:** subdivision (carries `organization_id` + `subdivision_id`) · **Status:** built

## Purpose
The invoice is the central operational entity of the wedge flow (see [[LCOS-E2-invoice-intake]]). It moves
through the status machine `draft → validated/rejected → prepared → written/failed`
([[invoice-status-machine]]). At `status=prepared` the fully resolved outgoing-invoice body
is saved into `esupl_payload`, so that the (gated) send to Esupl reproduces exactly the
validated data ([[erp-esupl-integration]]; the write is behind `ERP_WRITE_ENABLED`, see [[fail-closed]]).

## Key fields
| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | int PK | no | autoincrement |
| `organization_id` | uuid FK | no | boundary, RESTRICT, indexed (mixin) |
| `subdivision_id` | uuid FK | no | location, RESTRICT, indexed (mixin) |
| `supplier_id` | int FK→suppliers | yes | without ondelete (RESTRICT semantics) |
| `image_ref` | varchar(1024) | yes | reference to the scan |
| `ocr_provider` / `ocr_raw` | varchar/text | yes | OCR provider + raw response |
| `number` | varchar(128) | yes | invoice number; indexed |
| `issued_at` | timestamp | yes | document date |
| `total_amount` | numeric(14,2) | yes | amount |
| `currency` | varchar(8) | yes | currency |
| `status` | enum `invoice_status` | no | default `draft`; indexed |
| `validation_errors` | text | yes | rejected reasons |
| `external_id` | varchar(128) | yes | id in Esupl; indexed |
| `esupl_payload` | text | yes | JSON payload, filled at `prepared` |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

`status` enum: `draft`, `validated`, `rejected`, `prepared`, `written`, `failed`.

## Relations, FK, uniqueness
- FK `organization_id`/`subdivision_id` **RESTRICT** (mixin).
- FK `supplier_id → suppliers.id` without an explicit ondelete → RESTRICT by default.
- `lines` — one-to-many, `cascade="all, delete-orphan"` ([[invoice_lines]]).
- **Uniqueness:** `uq_invoices_org_external` UNIQUE(`organization_id`, `external_id`) —
  idempotency of the write to POS (NULLs are distinguishable in PG → drafts without an
  external_id do not conflict).
- **Index:** `ix_invoices_org_status`(`organization_id`, `status`).

## Used by features
[[LCOS-F8-ocr-recognition]] (OCR → InvoiceDraft), [[LCOS-F9-line-matching]] (line↔catalog matching),
[[LCOS-F10-invoice-status-machine]] (status machine + Esupl payload + gated write), [[LCOS-F11-esupl-read]] (Esupl read).

## Sources
- `mvp.be/app/db/models.py:235-274` (`Invoice` model), `:61-67` (`InvoiceStatus`)
- [[invoice-status-machine]], [[erp-esupl-integration]], [[architecture]] — data-model
