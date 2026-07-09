---
id: suppliers
type: entity
title: suppliers — suppliers (shared across the organization)
status: built
scope: org
table: suppliers
pk: id (int)
used_by: ["[[LCOS-F17-supplier-cards]]", "[[LCOS-F18-supplier-criteria]]", "[[LCOS-F11-esupl-read]]", "[[LCOS-F9-line-matching]]", "[[LCOS-F10-invoice-status-machine]]"]
requirements: ["[[supplier-criteria-registry]]", "[[multitenancy]]"]
sources: [mvp.be/app/db/models.py:198-232, 01_ARCHITECTURE.md#data-model, APP_OVERVIEW.md §10]
updated: 2026-07-09
---
# suppliers · suppliers

**Scope:** org (shared across the organization, no subdivision) · **Status:** built

## Purpose
A supplier card: identification, contacts, delivery terms, and a flexible set of criteria
([[supplier-criteria-registry]]). A supplier is shared at the organization level. Matching an invoice
to a supplier uses a **blended score** (trigram 0.65 + token Jaccard 0.35, min threshold
0.4) — NOT "Jaccard≥0.5" (the historical phrasing in older docs is incorrect). See
[[LCOS-F17-supplier-cards]], [[LCOS-F18-supplier-criteria]].

## Key fields
| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | int PK | no | autoincrement |
| `organization_id` | uuid FK→organizations | no | isolation boundary, RESTRICT, indexed |
| `external_id` | varchar(128) | yes | supplier id in Esupl; indexed |
| `name` | varchar(512) | no | name |
| `tax_id` | varchar(64) | yes | UNP / tax id |
| `contact_name` / `phone` / `messenger` | varchar | yes | F3-B1 contacts |
| `delivery_terms` | text | yes | delivery terms, free text |
| `min_order_amount` | numeric(14,2) | yes | minimum order (amount) |
| `min_order_note` | varchar(512) | yes | note on the minimum order |
| `criteria` | JSONB | no | default `{}`; flexible criteria per the [[supplier-criteria-registry]] registry |
| `is_active` | boolean | no | default true; soft hide |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Relations, FK, uniqueness
- FK `organization_id → organizations.id` **RESTRICT** (an organization with suppliers
  cannot be deleted).
- `invoices` — one-to-many (no cascade delete; see below).
- **Uniqueness:** `suppliers_org_external` UNIQUE(`organization_id`, `external_id`).
- **Index:** `ix_suppliers_org_name`(`organization_id`, `name`).
- [[invoices]].`supplier_id → suppliers.id` **without ondelete** (PG default RESTRICT
  semantics) — hence `is_active` for a soft hide instead of deletion.
- `criteria` — JSONB rather than columns: criteria are added/removed without a migration;
  values are validated against the `app/domain/supplier_criteria` registry.

## Used by features
[[LCOS-F17-supplier-cards]] (card CRUD + terms), [[LCOS-F18-supplier-criteria]] (flexible criteria registry),
[[LCOS-F11-esupl-read]] (Esupl read — `external_id`), [[LCOS-F9-line-matching]]/[[LCOS-F10-invoice-status-machine]] (supplier auto-match
in the invoice flow, payload).

## Sources
- `mvp.be/app/db/models.py:198-232` (`Supplier` model)
- [[supplier-criteria-registry]], [[architecture]] — data-model, APP_OVERVIEW.md §10
