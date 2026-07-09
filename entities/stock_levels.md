---
id: stock_levels
type: entity
title: stock_levels — stock snapshots (planned)
status: planned
scope: subdivision
table: stock_levels
pk: uuid
used_by: ["[[LCOS-F34-stock-levels]]", "[[LCOS-F36-stock-screen]]", "[[LCOS-F40-ai-order-proposal]]", "[[LCOS-F49-reorder-suggestion]]"]
requirements: ["[[multitenancy]]", "[[erp-esupl-integration]]"]
sources: ["work/plan/PHASE_S1... n/a", "08_PHASE1_SPEC.md F3.1 (archived)", "ADR-016"]
updated: 2026-07-09
---
# stock_levels — stock snapshots (planned)

> **Status: planned** (epic [[LCOS-E7-stock]]). Not yet in the schema; specified by [[LCOS-F34-stock-levels]].

## Purpose
Point-in-time snapshots of ingredient stock, sourced from Esupl remains or manual entry (source-of-stock decision — see [[ADR-016]]). Feeds the shortage list ([[LCOS-F36-stock-screen]]) and the order planner ([[LCOS-F40-ai-order-proposal]]).

## Scope
Subdivision-scoped (`organization_id` + `subdivision_id` denormalized — see [[multitenancy]]).

## Key fields (planned)
| Field | Notes |
|---|---|
| organization_id / subdivision_id | tenant scope |
| ingredient_id | → [[ingredients]] |
| warehouse_id | Esupl warehouse |
| quantity | current level (base unit) |
| as_of | snapshot timestamp; `max(as_of)` wins |
| source | `esupl` \| `manual` (per [[ADR-016]]) |

## Used by
[[LCOS-F34-stock-levels]] (sync), [[LCOS-F35-reorder-point]] (`is_low`), [[LCOS-F36-stock-screen]], [[LCOS-F40-ai-order-proposal]], [[LCOS-F49-reorder-suggestion]].

## Sources
`08_PHASE1_SPEC.md` F3.1 (archived), `07_PHASES.md` Э3 (archived), [[ADR-016]].
