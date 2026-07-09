---
id: LCOS-E7
type: epic
title: Stock levels and shortage list
status: planned
phase: "Phase 1"
features: ["[[LCOS-F34-stock-levels]]", "[[LCOS-F35-reorder-point]]", "[[LCOS-F36-stock-screen]]"]
legacy_refs: [07 Э3, 08 F3.x, ADR-016]
sources: [07_PHASES.md Э3, 08_PHASE1_SPEC.md F3.x, ADR-016]
updated: 2026-07-09
---

# LCOS-E7 · Stock levels and shortage list

**Status:** 📝 planned · **Phase:** Phase 1

## Description

Visibility of ingredient stock levels and a list of what is about to run out — the entry into order planning. Three stock sources are fixed in [[ADR-016]]: **A** — `remains` from Esupl; **B** — receipts − consumption; **C** — manual entry (the guaranteed fallback at the start). Strategy: start on C (works without contract confirmation), enable A after the `remains` contract has been empirically confirmed in the browser.

Stock snapshots are stored in `stock_levels` (with `organization_id` + `subdivision_id` + `source` + `external_id` from day one — a placeholder for portability). A `reorder_point` appears on ingredients. The `/stock` screen shows the low-stock list and allows manual adjustment (which feeds source C).

## Goal / value

Without stock levels, "propose an order" is guesswork. This is step 3 of the routine ladder: the system knows what is running low and prepares the input for step 4 (orders, [[LCOS-E8-purchasing]]).

## Features

| ID | Name | Status | Link |
|---|---|---|---|
| LCOS-F34 | `get_stock` + `stock_levels` snapshots + sync | 📝 planned | [[LCOS-F34-stock-levels]] |
| LCOS-F35 | `reorder_point` on ingredients | 📝 planned | [[LCOS-F35-reorder-point]] |
| LCOS-F36 | `/stock` screen (low list + manual adjustment) | 📝 planned | [[LCOS-F36-stock-screen]] |

## Key entities / requirements

- Entities: [[stock_levels]], [[ingredients]] (`reorder_point`), [[subdivisions]].
- Requirements: [[erp-esupl-integration]], [[provider-abstraction]], [[multitenancy]].
- Roles: [[member]] (views/adjusts), [[admin]] (sets `reorder_point`).

## Gates

- **[[ADR-016]] stock source:** start on C (manual), A is enabled only after the `remains` contract is confirmed in the browser.
- **Kill-criteria (07 Э0):** `remains` returns no data → the epic stays on C.
- **Placeholder convention:** every new table carries `organization_id` + `source` + `external_id` from day one.

## legacy_refs

07 Э3 (stock); 08_PHASE1_SPEC F3.x; ADR-016 (stock source).

## Sources

- 07_PHASES.md Э3, 08_PHASE1_SPEC.md F3.x
- ADR: [[ADR-016]]
