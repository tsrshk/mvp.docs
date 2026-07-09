---
id: LCOS-F40
type: feature
title: AI order proposal (order_planning_service)
epic: "[[LCOS-E8-purchasing]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[purchase_orders]]", "[[purchase_order_lines]]", "[[stock_levels]]", "[[ingredients]]", "[[packings]]", "[[suppliers]]", "[[invoice_lines]]"]
requirements: ["[[multitenancy]]", "[[erp-esupl-integration]]"]
adrs: ["[[ADR-016]]"]
legacy_refs: ["08 F4.4", "07 Э4b"]
sources: ["08_PHASE1_SPEC.md F4.4", "07_PHASES.md Э4b", "mvp.be app/services/order_planning_service.py", "mvp.be app/services/invoice_service.py", "mvp.be app/db/models.py (packings.factor/is_default, uq_packings_default_per_ingredient)"]
updated: 2026-07-09
---
# LCOS-F40 · AI order proposal (order_planning_service)
**Epic:** [[LCOS-E8-purchasing]] · **Status:** planned · **Phase:** Phase 1

## Description

`order_planning_service` turns stock knowledge and supplier terms into a proposed draft order for one supplier. Despite the "AI" label in the ladder, the calculation is **deterministic and rule-based — not an LLM**. Given a `supplier_id`, it reads the latest `stock_levels` snapshots, `ingredients.reorder_point` ([[LCOS-F35-reorder-point]]), the supplier's delivery terms (`delivery_days` → days until next delivery, `lead_time_days`), and last prices/volumes from that supplier's `invoice_lines`.

The **primary path (mandatory, covered by AC-1)**: propose positions whose stock is `≤ reorder_point`; quantity is rounded **up to whole default packs** (`packings.is_default`, `factor`); price is the last known one. Each proposed line carries a `reason` ("stock 1.2 kg below threshold 2 kg"). An **optional consumption path (may be skipped in Phase 1, no AC)** — "stock won't last until the next delivery" — uses average daily consumption as a **proxy from receipts** (Phase 1 has no sales): sum of `quantity` from the supplier's `invoice_lines` over a fixed window (e.g. 30 days) ÷ window days; with `<2` receipts in the window this path is unavailable and it falls back to `≤ reorder_point`. Direct consumption arrives in Э6 (sales history, [[LCOS-E9-sales-analytics]]).

The result is exposed as a proposal endpoint that creates a `draft` order with `origin='ai'` lines + reasons — an ordinary draft the human then edits and confirms through the existing flow ([[LCOS-F41-ai-order-ui]], [[LCOS-F38-orders-ui]], [[LCOS-F39-order-message]]).

## Capabilities

- `app/services/order_planning_service.py` — deterministic planner keyed by `supplier_id`.
- Primary rule: stock `≤ reorder_point` → propose; quantity rounded up to whole default packs (`packings.factor`, `is_default`); price = last known.
- Per-line `reason` string explaining why the position was proposed.
- Optional consumption proxy (from receipts) with a fixed window and a `<2`-receipts fallback to the threshold rule.
- `POST /purchase-orders/propose?supplier_id=` → `draft` with `origin='ai'` lines + reasons.
- Empty proposal is a valid response; no snapshot fresher than 7 days → `409` "refresh stock".
- Scoped to the supplier's positions within the caller's org.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Request a proposal for a supplier; the returned draft is theirs to edit/confirm. |
| [[admin]] | Same, within their subdivision. |
| [[superadmin]] | Cross-tenant access. |
| [[sqladmin-operator]] | Not involved. |

Scope (`organization_id` / `subdivision_id`) from active JWT context; proposals only ever cover the caller's org and the chosen supplier (see [[multitenancy]]).

## Involved entities

- [[stock_levels]] — latest snapshots per ingredient are the planner's primary input (see [[LCOS-F34-stock-levels]]).
- [[ingredients]] — `reorder_point` is the threshold that triggers a proposed line ([[LCOS-F35-reorder-point]]).
- [[packings]] — `is_default` + `factor` drive rounding up to whole packs (`uq_packings_default_per_ingredient` guarantees one default per SKU).
- [[suppliers]] — delivery terms (`delivery_days`, `lead_time_days`) frame the "next delivery" horizon.
- [[invoice_lines]] — last prices/volumes, and the receipts proxy for the optional consumption path.
- [[purchase_orders]] / [[purchase_order_lines]] — the produced draft and its `origin='ai'` lines with reasons.

## Dependencies / links

- **Requirements:** [[multitenancy]] (org/supplier scope), [[erp-esupl-integration]] (planner reads local data only; proposing an order never touches Esupl).
- **ADR:** [[ADR-016]] (stock source with manual-entry fallback C — the planner tolerates the absence of a live ERP feed by relying on the latest snapshot).
- **Features:** depends on stock ([[LCOS-F34-stock-levels]]) and thresholds ([[LCOS-F35-reorder-point]]) from [[LCOS-E7-stock]], and supplier terms from [[LCOS-F17-supplier-cards]]. Writes drafts through [[LCOS-F37-purchase-orders]]; surfaced by [[LCOS-F41-ai-order-ui]]; the `origin` marking feeds the close-out metric [[LCOS-F44-live-closeout]].

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. Unit tests: stock below threshold → proposed; above → not; pack rounding (`1.2 → 2` default packs); `NULL` reorder_point → never proposed; no snapshot fresher than 7 days → `409`.
- [ ] AC-BE-2. Only the chosen supplier's positions, only within the caller's org (test).
- [ ] AC-BE-3. Calculation is deterministic (rules, not LLM); every line carries a human-readable `reason`.
- [ ] AC-BE-4. `POST /purchase-orders/propose?supplier_id=` returns a `draft` with `origin='ai'` lines; an empty proposal is a valid `200` response.

## Open questions / gates
- Consumption path is **optional** in Phase 1 (proxy by receipts); direct consumption depends on [[LCOS-E9-sales-analytics]].
- **Kill-check (owner, whole Э4b):** if the human edits >70% of proposed lines for three cycles → revert to a plain "what's running out" checklist and revisit the consumption model.

## Sources
- `08_PHASE1_SPEC.md F4.4` (inputs, primary + optional-proxy rules, propose endpoint, `409` on stale stock, AC).
- `07_PHASES.md Э4b` (planner inputs; no demand forecast — manual thresholds; AI-line marking).
- `mvp.be/app/db/models.py` — `packings.factor`, `is_default`, `uq_packings_default_per_ingredient` (one default pack per SKU already enforced).
- `mvp.be/app/services/invoice_service.py` — reference service composing several repositories (pattern for `order_planning_service.py`).
