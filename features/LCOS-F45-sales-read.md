---
id: LCOS-F45
type: feature
title: Sales read + history backfill
epic: "[[LCOS-E9-sales-analytics]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin]
entities: ["[[ingredients]]", "[[subdivisions]]", "[[integration_credentials]]"]
requirements: ["[[erp-esupl-integration]]", "[[provider-abstraction]]", "[[fail-closed]]"]
adrs: []
legacy_refs: [plan F5-B1, 07 Э6]
sources: ["plan/PHASE_F5_SALES_ANALYTICS.md §0", "plan/PHASE_F5_SALES_ANALYTICS.md §1 F5-B1", "07_PHASES.md Э6"]
updated: 2026-07-09
---
# LCOS-F45 · Sales read + history backfill
**Epic:** [[LCOS-E9-sales-analytics]] · **Status:** future · **Phase:** Phase 2

## Description

Read-only ingestion of sales from Esupl through the ERP provider seam. Extends `ErpProvider` (Protocol) / `EsuplErpProvider` with authenticated read methods (e.g. `list_sales(team_id, warehouse_id?, date_from, date_to, api_token) -> list[SaleRecord]`, and `list_orders` for purchase history), returning domain DTOs — no new write methods. This is the entry point of the analytics epic: it pulls "what sold" out of Esupl so the owner no longer opens the POS to see it.

Phase gate first: a Week-1 Esupl API reconnaissance (against `reference/esupl-api/*` and the live team 17957 token, strictly READ-ONLY) must confirm which endpoints expose sales, at what granularity (line-item vs shift/category), pagination, rate limits and history depth. If positional sales are unavailable, scope is renegotiated with the owner before storage/digest work starts.

Backfill runs as a one-shot import to the depth discovered in the recon spike, plus an incremental manual trigger; import status surfaces on `/settings`. If POS depth is under ~3 months the kill-criterion (07 Э0) trims the feature to "from today forward".

## Capabilities

- Authenticated read of sales/orders from Esupl via the provider seam; token is mandatory — missing token is a fail-closed sync error, never a silent skip (does not reproduce DEC-06).
- Strictly read-only against Esupl (G6): no non-GET calls anywhere in this feature.
- One-shot history backfill to the recon-confirmed depth + incremental manual re-trigger.
- Import/sync status visible on the frontend `/settings` page.

## Access by role

| Role | What they can do |
|---|---|
| [[admin]] | Trigger a manual sales sync/backfill for their subdivision; see import status. |
| [[superadmin]] | Same across all tenants; configures the POS token that the read path requires. |
| [[member]] | No direct control of the read path; consumes downstream analytics only. |
| [[sqladmin-operator]] | Configures the POS credential / enable flags in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

## Involved entities

- [[integration_credentials]] — Fernet-encrypted POS token required by the authenticated read calls (backend-only).
- [[ingredients]] — local catalog that sales lines are mapped onto where possible (`ingredient_id` on the future `sales_records` table, see [[LCOS-F46-sales-storage]]).
- [[subdivisions]] — tenant scope of every read; sales are pulled per subdivision/warehouse.
- Future storage tables (`sales_records`, `sync_state`) are introduced in [[LCOS-F46-sales-storage]] and [[LCOS-F47-scheduler]].

## Dependencies / links

- **Requirements:** [[erp-esupl-integration]] (LCOS is read-only against Esupl), [[provider-abstraction]] (reads live behind the `ErpProvider` seam so a second POS is a drop-in), [[fail-closed]] (no token / Esupl unreachable → explicit failure, not silent skip).
- **Features:** feeds [[LCOS-F46-sales-storage]] (persistence + aggregates) and is scheduled by [[LCOS-F47-scheduler]]; the ERP write side lives in [[LCOS-F10-invoice-status-machine]] / [[LCOS-F11-esupl-read]] (this feature adds only reads).
- **Epics:** part of [[LCOS-E9-sales-analytics]]; closes the consumption↔purchasing loop with [[LCOS-E7-stock]] and [[LCOS-E8-purchasing]].

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). The recon report (AC-0 gate) and read-only/idempotency criteria are drafted only after the Esupl API spike and owner sign-off.

## Sources

- `plan/PHASE_F5_SALES_ANALYTICS.md §0` (recon gate), `§1 F5-B1` (ERP provider read extension).
- `07_PHASES.md Э6` (history port; `list_orders`/`list_sales`, backfill depth, idempotent re-run).
