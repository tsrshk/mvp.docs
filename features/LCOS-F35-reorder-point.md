---
id: LCOS-F35
type: feature
title: reorder_point on ingredients
epic: "[[LCOS-E7-stock]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[ingredients]]", "[[stock_levels]]"]
requirements: ["[[multitenancy]]", "[[provider-abstraction]]"]
adrs: ["[[ADR-016]]"]
legacy_refs: [07 Э3, "08 F3.2"]
sources: ["07_PHASES.md Э3", "08_PHASE1_SPEC.md F3.2", "mvp.be app/api/v1/routes/ingredients.py", "mvp.be app/services/catalog.py"]
updated: 2026-07-09
---
# LCOS-F35 · reorder_point on ingredients

**Epic:** [[LCOS-E7-stock]] · **Status:** planned · **Phase:** Phase 1

## Description

A per-ingredient reorder threshold — the single number that turns a raw stock snapshot into a decision. `reorder_point` is a nullable `Numeric(14,3)` column on `ingredients`; when a snapshot's `quantity` falls at or below it, that ingredient is flagged `is_low` in `GET /stock` and surfaces in the "Low" shopping-list block on [[LCOS-F36-stock-screen]]. A NULL threshold means "not tracked" and never flags as low.

The value is entered by hand for now (Phase 1). A later feature — "suggest `reorder_point` from actual consumption" ([[LCOS-F49-reorder-suggestion]], Phase 2) — will propose thresholds from sales/consumption history, but that is explicitly out of scope here.

Mechanically this feature is small: add the column, expose it on the catalog read by extending the existing `IngredientRef` shape (rather than introducing a parallel Out-schema), and add a `PATCH /api/v1/ingredients/{id}` endpoint to `routes/ingredients.py` (which today only serves `GET` via `services/catalog.py::list_catalog`). The `is_low` computation itself lives in [[LCOS-F34-stock-levels]] `GET /stock`; this feature owns the threshold value it reads.

## Capabilities

- `ingredients.reorder_point` — nullable `Numeric(14,3)` threshold per ingredient, scoped by the ingredient's own tenant scope.
- `PATCH /api/v1/ingredients/{id}` — set or clear an ingredient's `reorder_point`.
- `reorder_point` added to the catalog read output (`IngredientRef` extended), so both the catalog and the stock screen can display and edit it.
- Threshold semantics: `is_low = quantity <= reorder_point`; NULL threshold → never low.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | View the threshold; may adjust it inline from the stock screen. |
| [[admin]] | Sets/curates `reorder_point` values for the subdivision's ingredients. |
| [[superadmin]] | Same across all tenants. |
| [[sqladmin-operator]] | Not involved. |

The endpoint is tenant-scoped via the active JWT context (see [[auth]], [[multitenancy]]); an ingredient can only be patched within its own tenant scope.

## Involved entities

- [[ingredients]] — gains the `reorder_point` column; the PATCH target and the value carried into the catalog read.
- [[stock_levels]] — consumes `reorder_point` indirectly: `GET /stock` joins the latest snapshot's `quantity` against the ingredient threshold to compute `is_low` (owned by [[LCOS-F34-stock-levels]]).

## Dependencies / links

- **Requirements:** [[multitenancy]] (threshold and PATCH scoped by tenant), [[provider-abstraction]] (catalog read path unchanged — same `IngredientRef` seam the ERP catalog sync populates).
- **Features:** consumed by [[LCOS-F34-stock-levels]] (`is_low` in `GET /stock`) and edited from [[LCOS-F36-stock-screen]] (inline threshold set). Superseded-forward by [[LCOS-F49-reorder-suggestion]] (consumption-derived suggestion, Phase 2). Feeds order sizing in [[LCOS-F40-ai-order-proposal]].
- **ADR:** [[ADR-016]] (the shortage signal is defined against this threshold; manual entry is the guaranteed path).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. Migration adds `ingredients.reorder_point Numeric(14,3)` nullable (default NULL = untracked).
- [ ] AC-BE-2. `PATCH /api/v1/ingredients/{id}` sets and clears `reorder_point`; the value round-trips (stored, then returned on read).
- [ ] AC-BE-3. The catalog read (`services/catalog.py::list_catalog` via `GET /api/v1/ingredients`) includes `reorder_point` by extending `IngredientRef` (no parallel Out-schema).
- [ ] AC-BE-4. `is_low` in `GET /stock` is correct across all four cases: below, above, equal, and NULL threshold (test with fixed quantities).
- [ ] AC-BE-5. Tenant isolation: an ingredient can only be patched/read within its own tenant scope.

### Frontend
- [ ] AC-FE-1. The stock table renders each ingredient's `reorder_point` (blank/dash when NULL).
- [ ] AC-FE-2. The threshold is settable inline from the ingredient's row (calls `PATCH /ingredients/{id}`); the "Low" block re-derives immediately after a change.
- [ ] AC-FE-3. Setting a threshold on a below-quantity ingredient moves it into the "Low" block; clearing it (NULL) removes it — verified against [[LCOS-F36-stock-screen]] AC.

## Open questions / gates

- **Manual now, derived later** — automatic threshold suggestion from consumption is deferred to [[LCOS-F49-reorder-suggestion]] (Phase 2); Phase 1 is manual entry only.
- Whether `reorder_point` should be per-warehouse (vs per-ingredient) is not needed in Phase 1 — one subdivision = one primary warehouse (`Subdivision.esupl_warehouse_id`).

## Sources

- `07_PHASES.md Э3` (`ingredients.reorder_point` manual entry).
- `08_PHASE1_SPEC.md F3.2` (column + `PATCH /ingredients/{id}` + `IngredientRef` extension — REQ-1, AC-1).
- `mvp.be/app/api/v1/routes/ingredients.py` (currently GET-only, 22 lines).
- `mvp.be/app/services/catalog.py` (`list_catalog`).
