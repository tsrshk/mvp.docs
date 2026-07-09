---
id: LCOS-F46
type: feature
title: Sales storage + daily aggregates
epic: "[[LCOS-E9-sales-analytics]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin]
entities: ["[[ingredients]]", "[[subdivisions]]", "[[organizations]]"]
requirements: ["[[multitenancy]]", "[[erp-esupl-integration]]"]
adrs: []
legacy_refs: [plan F5-B2, 07 Э6]
sources: ["plan/PHASE_F5_SALES_ANALYTICS.md §1 F5-B2", "07_PHASES.md Э6"]
updated: 2026-07-09
---
# LCOS-F46 · Sales storage + daily aggregates
**Epic:** [[LCOS-E9-sales-analytics]] · **Status:** future · **Phase:** Phase 2

## Description

Persistence layer for the sales read by [[LCOS-F45-sales-read]]. Introduces two subdivision-scoped tables: `sales_records` (raw sale lines mirrored from Esupl) and `daily_aggregates` (per-day rollups materialized by the sync). The `external_id` uniqueness constraint is what makes re-syncing the same window idempotent — no duplicate rows — which is the core correctness property of the whole epic.

`sales_records` maps onto the local catalog where possible (nullable `ingredient_id` FK) so downstream features can reason in local-ingredient terms; where no mapping exists, the Esupl `name`/`category` are kept verbatim. `daily_aggregates` is recomputed for the affected days on every sync so revenue and top-positions always reflect the latest upsert.

## Capabilities

- `sales_records` (`SubdivisionScopedMixin`, int pk): `external_id` (unique within org), `sold_at` (tz-aware), `sku_external_id?`, `ingredient_id?` (FK, nullable), `name`, `category?`, `qty` `Numeric(14,3)`, `revenue` `Numeric(14,2)`, `cost?` `Numeric(14,2)`, `currency`. Unique `(organization_id, external_id)`.
- `daily_aggregates` (`SubdivisionScopedMixin`): `date`, `revenue`, `receipts_count?`, `top_positions JSONB?`; unique `(subdivision_id, date)`; recomputed for affected days by the sync.
- Idempotent upsert keyed on `external_id`; re-running the same window creates no duplicates.
- Deterministic aggregate math (Decimal) — unit-testable, no LLM involved.

## Access by role

| Role | What they can do |
|---|---|
| [[admin]] | Owns the data for their subdivision (populated by sync); no manual row editing. |
| [[superadmin]] | Cross-tenant visibility of stored sales/aggregates. |
| [[member]] | Reads only through downstream analytics (digest, reorder suggestion). |
| [[sqladmin-operator]] | Inspects tables in the SQLAdmin plane for operational visibility. |

## Involved entities

- [[organizations]] — org scope for the `external_id` idempotency key (`unique (organization_id, external_id)`).
- [[subdivisions]] — subdivision scope (`SubdivisionScopedMixin`) and the aggregate key `(subdivision_id, date)`.
- [[ingredients]] — nullable `ingredient_id` FK on `sales_records` mapping a sale line to the local catalog where possible.
- New tables `sales_records` and `daily_aggregates` are defined here; they have no standalone entity docs yet (Phase 2 stubs).

## Dependencies / links

- **Requirements:** [[multitenancy]] (both tables are tenant-scoped; isolation must be test-covered), [[erp-esupl-integration]] (rows originate from read-only Esupl data).
- **Features:** populated by [[LCOS-F45-sales-read]], written by the [[LCOS-F47-scheduler]] sync job, consumed by [[LCOS-F48-weekly-digest]] and [[LCOS-F49-reorder-suggestion]].
- **Epics:** [[LCOS-E9-sales-analytics]].

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). Idempotency (unique `external_id`), correct Decimal aggregate recompute, and tenant-isolation tests are drafted on activation.

## Sources

- `plan/PHASE_F5_SALES_ANALYTICS.md §1 F5-B2` (sales storage schema, aggregates, idempotency).
- `07_PHASES.md Э6` (`sales_history`, idempotent re-run, sums reconcile with Esupl).
