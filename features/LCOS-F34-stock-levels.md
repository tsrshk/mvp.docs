---
id: LCOS-F34
type: feature
title: get_stock + stock_levels snapshots + sync
epic: "[[LCOS-E7-stock]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[stock_levels]]", "[[ingredients]]", "[[subdivisions]]"]
requirements: ["[[erp-esupl-integration]]", "[[provider-abstraction]]", "[[fail-closed]]", "[[multitenancy]]"]
adrs: ["[[ADR-016]]"]
legacy_refs: [07 Э3, "08 F3.1", ADR-016]
sources: ["07_PHASES.md Э3", "08_PHASE1_SPEC.md F3.1", "ADR-016", "mvp.be app/providers/erp/base.py", "mvp.be app/domain/entities.py", "mvp.be app/api/v1/routes/suppliers.py:26"]
updated: 2026-07-09
---
# LCOS-F34 · get_stock + stock_levels snapshots + sync

**Epic:** [[LCOS-E7-stock]] · **Status:** planned · **Phase:** Phase 1

## Description

The data backbone of the stock epic: a way to obtain ingredient quantities per warehouse, store them as timestamped snapshots in a new `stock_levels` table, and refresh them on demand. Stock visibility is the entry gate to order planning ([[LCOS-E8-purchasing]]) — without it, "propose an order" is guesswork.

Two stock sources coexist by [[ADR-016]]: **A** — `remains` pulled from Esupl via a new `ErpProvider.get_stock()` provider method (`source='esupl'`); **C** — manual entry (`source='manual'`, produced by the [[LCOS-F36-stock-screen]] adjustment path). The build strategy is to ship C first as a guaranteed-working path, then enable A once the `remains` contract is empirically confirmed in the browser against a real read-only token. `stock_levels` is a history table (snapshots, never overwritten): the latest snapshot per ingredient wins on read.

Following the portability convention, `stock_levels` carries `organization_id`, `subdivision_id`, `source` and the external warehouse id from day one. The manual refresh trigger (`POST /stock/sync`) mirrors the existing `POST /suppliers/sync` seam — synchronous, no Celery — resolving team and token the same way the supplier sync does, and matching returned items onto `ingredients.esupl_item_id`. Unmatched remains are surfaced as warnings rather than silently dropped.

## Capabilities

- Provider seam `ErpProvider.get_stock(team_id, warehouse_id, api_token) -> list[StockItemRef]` behind the existing ERP `Protocol`, with a tolerant parser for the unconfirmed `remains` field shapes (`item_id`/`ingredient_id`, `quantity`/`remains`, `unit`, `warehouse_id`).
- New `StockItemRef` DTO in `domain/entities.py` (modelled on the sibling `IngredientRef`): ingredient external id, quantity, unit, `as_of`.
- `stock_levels` snapshot table (history): `organization_id`, `subdivision_id`, `ingredient_id` (FK uuid), `warehouse_id` (int), `quantity Numeric(14,3)`, `as_of timestamptz`, `source ('esupl'|'manual')`; unique on `(organization_id, ingredient_id, warehouse_id, as_of)`.
- `POST /api/v1/stock/sync` — manual trigger that pulls `remains`, matches on `ingredients.esupl_item_id`, writes one snapshot per matched ingredient, and returns a summary with counts and unmatched-item warnings.
- `GET /api/v1/stock` — the latest snapshot per ingredient for the current subdivision, each with `as_of` and `is_low = quantity <= reorder_point` (false when the threshold is NULL — see [[LCOS-F35-reorder-point]]).
- Warehouse targeting reuses `Subdivision.esupl_warehouse_id`, the same warehouse reference used for invoice posting ([[LCOS-F12-warehouse-target]]) — one warehouse directory across the app.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Read stock and trigger a refresh within their own subdivision. |
| [[admin]] | Same as member within their subdivision. |
| [[superadmin]] | Access across all tenants. |
| [[sqladmin-operator]] | Not in the flow; manages the Esupl token/`ai_provider` in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

Stock endpoints are tenant-scoped: `organization_id` / `subdivision_id` come from the active JWT context (see [[auth]], [[multitenancy]]).

## Involved entities

- [[stock_levels]] — new snapshot/history table written by this feature; read by `GET /stock` (latest per ingredient) and consumed by [[LCOS-F36-stock-screen]].
- [[ingredients]] — match target for the sync via `esupl_item_id`; carries the `reorder_point` used to compute `is_low` (added by [[LCOS-F35-reorder-point]]).
- [[subdivisions]] — supplies `esupl_warehouse_id` (the warehouse to query) and scopes the snapshot.

## Dependencies / links

- **Requirements:** [[erp-esupl-integration]] (team-scoped read-only access to Esupl `remains`), [[provider-abstraction]] (`get_stock` lives behind the ERP `Protocol` + registry), [[fail-closed]] (no token → empty result + warning, never a silent direct call), [[multitenancy]] (snapshots and reads scoped by tenant).
- **Features:** feeds [[LCOS-F36-stock-screen]] (list + manual adjust) and depends on [[LCOS-F35-reorder-point]] for the `is_low` computation. Shares the warehouse directory with [[LCOS-F12-warehouse-target]]. The manual (`source='manual'`) path is the guaranteed fallback that the screen writes. Downstream consumer: [[LCOS-F40-ai-order-proposal]] in [[LCOS-E8-purchasing]].
- **ADR:** [[ADR-016]] (stock/consumption source — variant A + C strategy, kill-trigger on >50% divergence).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `ErpProvider.get_stock(team_id, warehouse_id, api_token) -> list[StockItemRef]` is added to the ERP `Protocol` (`providers/erp/base.py`) with a tolerant parser for the assumed `remains` shape; `StockItemRef` is defined in `domain/entities.py`.
- [ ] AC-BE-2. `stock_levels` migration creates the columns and the `(organization_id, ingredient_id, warehouse_id, as_of)` uniqueness; rows are snapshots (history), never updated in place.
- [ ] AC-BE-3. `POST /api/v1/stock/sync` resolves team/token like `POST /suppliers/sync`, uses `Subdivision.esupl_warehouse_id`, matches `remains` onto `ingredients.esupl_item_id`, writes a snapshot per matched item, and returns unmatched items as warnings.
- [ ] AC-BE-4. respx test: sync creates a snapshot; a repeat with the same `as_of` is idempotent (uniqueness holds); unmatched items appear in the warnings list.
- [ ] AC-BE-5. `GET /api/v1/stock` returns the latest snapshot per ingredient for the subdivision, each with `as_of` and correct `is_low` (`quantity <= reorder_point`; false when threshold is NULL).
- [ ] AC-BE-6. Tenant isolation of the stock endpoints is covered by a test (a tenant never sees another tenant's snapshots).
- [ ] AC-BE-7. Fail-closed: with no Esupl token configured, sync returns an empty/parked result plus a warning — no direct-egress attempt, no crash.
- [ ] AC-BE-8 (owner-accepted, deferred). Live sync: quantities and units for 5 sampled ingredients match the Esupl UI (variant A enablement gate).

### Frontend
- [ ] AC-FE-1. A `PosProvider.listStock()` seam method is added to `shared/pos/provider.ts` (alongside `listSuppliers`/`sendInvoice`), with `backend` and `mock` implementations wired via `shared/pos/factory.ts`.
- [ ] AC-FE-2. A `syncStock()` call maps to `POST /stock/sync`; the `mock` provider returns demo snapshots and a demo summary for dev without a live token.
- [ ] AC-FE-3. `listStock()` exposes per-ingredient `quantity`, `unit`, `as_of`, `reorder_point` and `is_low` to the UI layer ([[LCOS-F36-stock-screen]] renders them).

### Other
- [ ] AC-OTHER-1. Variant A vs C is a documented gate ([[ADR-016]]): C ships first; A is switched on only after the `remains` contract is confirmed in the browser. The Э0 contract note (`REMAINS_CONTRACT.md`) is a prerequisite — see [[LCOS-F28-esupl-contracts]].

## Open questions / gates

- **remains contract not live-verified** — field names and warehouse scoping are assumptions until confirmed in the browser; the parser must stay tolerant ([[ADR-016]], [[LCOS-F28-esupl-contracts]]).
- **Kill-criterion (07 Э3 / ADR-016):** if live stock diverges >50% from reality and inline fixes don't cure it, the epic stays on manual (C) and [[LCOS-E8-purchasing]] degrades to "reorder_point + manual quantity at order time".
- Consumption-as-proxy (variant B, приход − расход) is out of scope here — an optional add-on in [[LCOS-E8-purchasing]] (F44 path), not a blocker.

## Sources

- `07_PHASES.md Э3` (snapshots + shortage list, ~30 h; kill-criterion).
- `08_PHASE1_SPEC.md F3.1` (`get_stock` + `stock_levels` + sync — REQ-1..4, AC-1..3).
- `ADR-016` (stock/consumption source: A/B/C, fallback strategy).
- `mvp.be/app/providers/erp/base.py`, `app/domain/entities.py` (`IngredientRef` — DTO model).
- `mvp.be/app/api/v1/routes/suppliers.py:26` (sync route pattern).
- `mvp.be/app/db/models.py` — `Subdivision.esupl_warehouse_id`, `Ingredient.esupl_item_id`.
- `mvp.fe/src/shared/pos/provider.ts`, `shared/pos/providers/{backend,mock}.ts`, `shared/pos/factory.ts` (POS seam).
