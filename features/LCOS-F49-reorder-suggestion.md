---
id: LCOS-F49
type: feature
title: reorder_point suggestion from consumption
epic: "[[LCOS-E9-sales-analytics]]"
status: future
phase: "Phase 2"
roles: [member, admin]
entities: ["[[ingredients]]", "[[subdivisions]]"]
requirements: ["[[erp-esupl-integration]]", "[[multitenancy]]"]
adrs: []
legacy_refs: [plan F5, 07 Э6]
sources: ["07_PHASES.md Э6", "plan/PHASE_F5_SALES_ANALYTICS.md §1", "08_PHASE1_SPEC.md F3.x"]
updated: 2026-07-09
---
# LCOS-F49 · reorder_point suggestion from consumption
**Epic:** [[LCOS-E9-sales-analytics]] · **Status:** future · **Phase:** Phase 2

## Description

The give-back from analytics to Phase 1: use the imported sales history to suggest each ingredient's `reorder_point` from actual consumption, instead of the manual thresholds set in [[LCOS-E7-stock]]. Phase 1 keeps thresholds manual on purpose ("one routine at a time", 07 §7 Q7); this feature closes the consumption↔purchasing loop by proposing better numbers once real depletion rates are known.

It is explicitly a suggestion, not a forecast — the system does not build demand prediction (07 Э6, 07 §7 Q7). Suggested values surface on the `/stock` screen ([[LCOS-F36-stock-screen]]) next to the current `reorder_point` on the ingredient, and the owner accepts or ignores each one. The stated done-when for the parent stage is that at least 10 thresholds are accepted from suggestions.

## Capabilities

- Derive per-ingredient consumption rate from stored sales (`sales_records` mapped to `ingredient_id`, see [[LCOS-F46-sales-storage]]).
- Compute a suggested `reorder_point` per ingredient (deterministic, Decimal) — no demand forecasting.
- Surface suggestions on `/stock` beside the current threshold, with accept/ignore per ingredient.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | See suggested reorder points on `/stock` within their subdivision. |
| [[admin]] | Accept a suggestion (writes `reorder_point` on the ingredient) or ignore it. |
| [[superadmin]] | Same across tenants. |
| [[sqladmin-operator]] | Not involved in this flow. |

## Involved entities

- [[ingredients]] — carries the `reorder_point` field (from [[LCOS-F35-reorder-point]]) that a suggestion writes when accepted.
- [[subdivisions]] — scope; consumption is computed per subdivision.
- Consumption is read from the `sales_records` / `daily_aggregates` tables introduced in [[LCOS-F46-sales-storage]].

## Dependencies / links

- **Requirements:** [[erp-esupl-integration]] (consumption derives from read-only Esupl sales), [[multitenancy]] (per-subdivision suggestions).
- **Features:** consumes [[LCOS-F46-sales-storage]] (needs backfilled history from [[LCOS-F45-sales-read]]); writes onto [[LCOS-F35-reorder-point]] and renders in [[LCOS-F36-stock-screen]]; feeds better drafts into [[LCOS-E8-purchasing]] ([[LCOS-F40-ai-order-proposal]]).
- **Epics:** [[LCOS-E9-sales-analytics]] → gives back to [[LCOS-E7-stock]] and [[LCOS-E8-purchasing]].

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). Suggestion math, accept/ignore UX, and the "≥10 thresholds accepted" done-when are drafted on activation.

## Sources

- `07_PHASES.md Э6` ("suggest `reorder_point` from actual consumption" on `/stock`; ≥10 thresholds accepted; suggestion not forecast).
- `plan/PHASE_F5_SALES_ANALYTICS.md §1` (sales history feeding thresholds).
- `08_PHASE1_SPEC.md F3.x` (`reorder_point` on ingredients, `/stock` screen it hooks into).
