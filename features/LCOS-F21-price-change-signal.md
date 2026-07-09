---
id: LCOS-F21
type: feature
title: Price-change signal in the invoice flow
epic: "[[LCOS-E4-suppliers]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[suppliers]]", "[[ingredients]]", "[[invoices]]", "[[invoice_lines]]", "[[system_settings]]"]
requirements: ["[[invoice-status-machine]]", "[[multitenancy]]"]
adrs: []
legacy_refs: ["plan F3-B3", "plan F3-F2", "07 Э2"]
sources: ["plan/PHASE_F3_SUPPLIERS.md F3-B3", "plan/PHASE_F3_SUPPLIERS.md F3-F2", "plan/PHASE_F3_SUPPLIERS.md AC-3", "mvp.be app/services/invoice_service.py"]
updated: 2026-07-09
---
# LCOS-F21 · Price-change signal in the invoice flow

**Epic:** [[LCOS-E4-suppliers]] · **Status:** planned · **Phase:** Phase 1

## Description

A price change should be visible **immediately**, right when the invoice is posted — not discovered later by scrolling the price book. When an invoice is submitted, each resolved-SKU line's per-base-unit price is compared to the previous observed price for the same `(supplier, ingredient)` pair. If the change exceeds a configurable threshold (`price_change_alert_pct`, default 5%), the submit response carries a warning and the corresponding price point is flagged (`is_change`, computed and exposed by the prices API). The frontend surfaces those warnings through the existing warning mechanism (toast / warnings panel) in the workbench, e.g. "Milk 3.2%: 2.80 → 3.10 BYN (+10.7%)".

This is the invoice-flow half of the F3 price work and the sibling of [[LCOS-F20-price-history]]: F20 records the price observations, F21 reads the previous point to decide whether a change is worth surfacing. It is **not built** — it depends on F20's price history existing first (there is no "previous price" to compare against until observations are recorded).

The threshold is a runtime setting (`REGISTRY` / `system_settings`), editable from SQLAdmin **without a redeploy**, so the owner can tune signal sensitivity for the pilot coffeeshop.

## Capabilities

- (Planned) On `InvoiceService.submit()`, compare each resolved-SKU line's per-base-unit price to the previous observed price for that `(supplier, ingredient)`.
- (Planned) If `|Δ%| > price_change_alert_pct` (default 5%): add a warning to the submit response and mark the price point (`is_change` computable, returned by the prices API).
- (Planned) `price_change_alert_pct` lives in the config registry (`system_settings`), editable from SQLAdmin without redeploy (resolver-backed).
- (Planned) Frontend shows returned warnings in the existing toast / warnings panel after send, formatted as "Name: old → new CUR (±%)".

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Sees the price-change warning when posting an invoice for their subdivision. |
| [[admin]] | Same, within the subdivision. |
| [[superadmin]] | Cross-tenant access. |
| [[sqladmin-operator]] | Not in the invoice flow; edits `price_change_alert_pct` in the SQLAdmin config plane (see [[LCOS-F3-sqladmin-operator]]). |

Tenant scope (`organization_id`) comes from the active JWT context (see [[multitenancy]]).

## Involved entities

- [[suppliers]] — the supplier side of the compared `(supplier, ingredient)` pair (resolved for the invoice at submit).
- [[ingredients]] — the SKU whose price is compared; needs a resolved SKU on the line.
- [[invoices]] — submit of a `prepared`/`written` invoice triggers the comparison; the warning rides the submit response.
- [[invoice_lines]] — the per-line prices being compared to their previous observation.
- [[system_settings]] — holds `price_change_alert_pct` (default 5%), read via the config resolver, editable in SQLAdmin without redeploy.

## Dependencies / links

- **Requirements:** [[invoice-status-machine]] (the signal is computed during `submit()` of `prepared`/`written` invoices; the warning is part of the submit response), [[multitenancy]] (comparison is within the tenant scope).
- **Features:** [[LCOS-F20-price-history]] (records the previous price this feature compares against — hard dependency), [[LCOS-F10-invoice-status-machine]] (the submit path), [[LCOS-F13-sku-identity-resolver]] (only resolved-SKU lines are compared), [[LCOS-F3-sqladmin-operator]] (edits the threshold without redeploy).
- **ADR:** none specific; the threshold follows the three-level config resolver pattern.

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. On submit of a `prepared`/`written` invoice, each resolved-SKU line's per-base-unit price is compared to the previous observed price for that `(supplier, ingredient)`.
- [ ] AC-BE-2. A change exceeding `price_change_alert_pct` (default 5%) returns a warning in the submit response and flags the price row (`is_change`). (plan F3 AC-3)
- [ ] AC-BE-3. `price_change_alert_pct` is read from `system_settings` via the config resolver and is editable from SQLAdmin without redeploy (resolver test + manual check). (plan F3 AC-3)
- [ ] AC-BE-4. `is_change` is computable and returned by the supplier prices API (so the price book highlights changed points, not only the submit response).
- [ ] AC-BE-5. The comparison is tenant-scoped (org-A history never compared against an org-B scope).

### Frontend
- [ ] AC-FE-1. In the workbench / after send, if the backend returned price-change warnings they are shown in the existing toast / warnings panel. (plan F3-F2)
- [ ] AC-FE-2. Each warning reads "Name: old → new CUR (±%)" (e.g. "Milk 3.2%: 2.80 → 3.10 BYN (+10.7%)").
- [ ] AC-FE-3. In the supplier price table, a changed price point is highlighted (arrow/% with warn styling on increases). (plan F3-F1)

### Other
- [ ] AC-OTHER-1. Depends on [[LCOS-F20-price-history]]: with no recorded observations there is no previous price, so this feature cannot be verified before F20's `supplier_prices` + auto-collect exist.

## Open questions / gates

- **Hard dependency on F20:** the "previous price" comes from `supplier_prices`; F21 is blocked until [[LCOS-F20-price-history]] auto-collect is built.
- **Not built yet:** F3-B3 comparison + warning and F3-F2 the invoice-flow signal are open (plan F3 status 2026-07-08).
- **Threshold semantics:** default 5%; whether the alert is symmetric (increase and decrease) or increase-only is an open product decision — the plan example highlights increases.

## Sources

- `plan/PHASE_F3_SUPPLIERS.md F3-B3` (compare to previous price; `price_change_alert_pct` default 5%; warning in submit response + `is_change`), `F3-F2` (surface warnings in the existing toast/warnings mechanism), `§5 AC-3`.
- `plan/PHASE_F3_SUPPLIERS.md` "Статус реализации (2026-07-08)" (F3-B3 / F3-F2 NOT built).
- `mvp.be/app/services/invoice_service.py` (`submit()` — where the comparison hooks in).
