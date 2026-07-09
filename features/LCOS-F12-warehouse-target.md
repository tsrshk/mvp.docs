---
id: LCOS-F12
type: feature
title: Warehouse-target selection
epic: "[[LCOS-E2-invoice-intake]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]", "[[subdivisions]]", "[[organizations]]", "[[integration_credentials]]"]
requirements: ["[[erp-esupl-integration]]", "[[invoice-status-machine]]", "[[fail-closed]]"]
adrs: ["[[ADR-008]]", "[[ADR-016]]", "[[ADR-006]]"]
legacy_refs: ["08 F0.6", 07 Э0]
sources: ["08_PHASE1_SPEC.md F0.6", "APP_OVERVIEW.md §9", "mvp.be app/services/invoice_service.py:177", "mvp.be app/domain/entities.py:106", "mvp.be app/providers/erp/esupl.py:245"]
updated: 2026-07-09
---
# LCOS-F12 · Warehouse-target selection
**Epic:** [[LCOS-E2-invoice-intake]] · **Status:** planned · **Phase:** Phase 1

## Description

A receipt in Esupl is always posted **to a specific warehouse**. Today `warehouse_id` in the outgoing-invoice payload is taken **silently** from `Subdivision.esupl_warehouse_id`; if that field is empty the invoice simply can't reach `prepared` (a warning "subdivision not linked to an Esupl warehouse" holds back readiness). There is no real warehouse list and no explicit choice at receiving time. F12 closes that gap: fetch the team's real warehouse list from Esupl, let the user pick the destination on the send step (defaulting to the subdivision's warehouse), persist the choice, and refuse to send a receipt with no warehouse selected (08 F0.6).

On the backend this adds a read method to the ERP provider — `list_warehouses(team_id, api_token) -> list[WarehouseRef]` (a small DTO of `esupl_warehouse_id: int`, `name: str`) — following the same team-scoped, fail-closed pattern as the other reads ([[LCOS-F11-esupl-read]]): no token → `[]` + warning, tolerant parse, live shape confirmed in the browser. The chosen `warehouse_id` flows into the existing `EsuplOutgoingInvoice.warehouse_id` field instead of the silent default, the default remains `Subdivision.esupl_warehouse_id` when set, and the selection is persisted on the invoice via a new nullable column `target_warehouse_id`. The same warehouse directory is shared with stock levels (`stock_levels.warehouse_id`, [[LCOS-E7-stock]]) for consistency (F0.6 REQ-4, [[ADR-016]]).

On the frontend a warehouse selector appears on the send step (prepare-step / invoice-workbench): it defaults to the subdivision warehouse, lists the values from `list_warehouses`, and **blocks submit until a warehouse is chosen** — the explicit validation that replaces today's silent not-ready behavior.

## Capabilities

- Backend `list_warehouses(team_id, api_token)` → `WarehouseRef[]` (`esupl_warehouse_id`, `name`); team-scoped, tolerant parse; no token → `[]` + warning ([[fail-closed]]).
- Chosen `warehouse_id` populates `EsuplOutgoingInvoice.warehouse_id` (field already exists) instead of the silent subdivision default.
- Default destination = `Subdivision.esupl_warehouse_id` when set.
- Persist the selection on the invoice via new nullable column `invoices.target_warehouse_id`.
- Submit is blocked (not-ready with a clear message) when no warehouse is resolved.
- Single warehouse directory shared with `stock_levels.warehouse_id` ([[LCOS-E7-stock]]).

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Pick the destination warehouse on the send step (defaulted to the coffee-shop's warehouse) before posting a receipt. |
| [[admin]] | Same as member; sets/maintains the subdivision default warehouse (`Subdivision.esupl_warehouse_id`). |
| [[superadmin]] | All tenants; can inspect/override warehouse links. |
| [[sqladmin-operator]] | Not in the flow; token that authorizes `list_warehouses` lives in `integration_credentials` ([[LCOS-F3-sqladmin-operator]]). |

Tenant-scoped: `team_id` from `Organization.esupl_team_id`, default from the active subdivision (see [[auth]], [[multitenancy]]).

## Involved entities

- [[invoices]] — gains `target_warehouse_id` (int, nullable) to persist the chosen destination.
- [[subdivisions]] — `esupl_warehouse_id` supplies the default warehouse (subdivision ↔ warehouse, [[ADR-008]]).
- [[organizations]] — `esupl_team_id` scopes the `list_warehouses` read.
- [[integration_credentials]] — per-org Esupl token authorizing the warehouse read (no env fallback).

## Dependencies / links

- **Requirements:** [[erp-esupl-integration]] (new team-scoped read + payload field), [[invoice-status-machine]] (warehouse becomes a readiness precondition for `prepared`), [[fail-closed]] (no token → `[]` + warning; no warehouse → not-ready).
- **Features:** extends the read surface of [[LCOS-F11-esupl-read]]; feeds the payload/readiness of [[LCOS-F10-invoice-status-machine]]; shares the warehouse directory with [[LCOS-F34-stock-levels]] in [[LCOS-E7-stock]]; unblocks the owner-run write trial (08 F0.4, part of [[LCOS-F10-invoice-status-machine]]).
- **ADR / decisions:** [[ADR-008]] (subdivision ↔ warehouse mapping), [[ADR-016]] (stock source → shared warehouse directory), [[ADR-006]] (fail-closed egress).

## Acceptance criteria (AC)

### Backend
- [ ] AC-BE-1. `ErpProvider.list_warehouses(team_id, api_token) -> list[WarehouseRef]` exists on the `Protocol` and the `esupl` implementation; `WarehouseRef` carries `esupl_warehouse_id: int`, `name: str`.
- [ ] AC-BE-2. `list_warehouses` is team-scoped and tolerant-parsed; no token → `[]` + warning (fail-closed), matching the other reads.
- [ ] AC-BE-3. The chosen `warehouse_id` populates `EsuplOutgoingInvoice.warehouse_id`; default = `Subdivision.esupl_warehouse_id` when set; no silent default when neither is present.
- [ ] AC-BE-4. New nullable column `invoices.target_warehouse_id` persists the selection (Alembic revision with working `downgrade()`).
- [ ] AC-BE-5. Submit with no resolved `warehouse_id` yields a not-ready invoice with a clear message (closes the current silent hold at `invoice_service.py`).
- [ ] AC-BE-6 (test). respx: `list_warehouses` assembles the list; no token → `[]` + warning; submit without `warehouse_id` → not-ready.

### Frontend
- [ ] AC-FE-1. A warehouse selector appears on the send step (prepare-step / invoice-workbench), populated from `list_warehouses`.
- [ ] AC-FE-2. The selector defaults to the subdivision's warehouse when one is configured.
- [ ] AC-FE-3. Submit is disabled/blocked until a warehouse is selected, with a clear message.

### Other (data / owner acceptance)
- [ ] AC-OTHER-1 (deferred, browser). The warehouse list matches the Esupl UI, and a receipt posted via the write trial (08 F0.4) lands on the selected warehouse.

## Open questions / gates

- Warehouse endpoint path is taken tolerantly from the API mirror (`warehouse.md` remains/item/warehouses family / `raw/collection.json` `/teams/{id}/warehouses`) and must be confirmed live in the browser once a token is saved.
- Consistency gate: Э3 (`stock_levels.warehouse_id`) and F12 must use the same warehouse directory (F0.6 REQ-4) — see [[LCOS-E7-stock]].
- Depends on real ERP writes being exercisable — gated with [[LCOS-F10-invoice-status-machine]] (`ERP_WRITE_ENABLED`, owner-run).

## Sources

- `08_PHASE1_SPEC.md F0.6` (why + REQ-1..4 + AC; the `list_warehouses` method, `target_warehouse_id`, FE selector, submit block).
- `APP_OVERVIEW.md §9` (Esupl read pattern, per-read token, `get_esupl_access`).
- `mvp.be/app/services/invoice_service.py:177` (where `team_id`/`warehouse_id` are read today and the not-ready warning), `:180` (silent `Subdivision.esupl_warehouse_id` default), `:203` (payload build).
- `mvp.be/app/domain/entities.py:106` (`EsuplOutgoingInvoice.warehouse_id` field already exists).
- `mvp.be/app/providers/erp/esupl.py:245` (`write_invoice` — the payload posted to `/teams/{id}/outgoing-invoices`).
