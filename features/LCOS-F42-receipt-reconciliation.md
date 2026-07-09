---
id: LCOS-F42
type: feature
title: Receipt ↔ order reconciliation
epic: "[[LCOS-E8-purchasing]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]", "[[invoice_lines]]", "[[purchase_orders]]", "[[purchase_order_lines]]"]
requirements: ["[[invoice-status-machine]]", "[[multitenancy]]"]
adrs: []
legacy_refs: ["08 F5.1", "07 Э5"]
sources: ["08_PHASE1_SPEC.md F5.1", "07_PHASES.md Э5", "mvp.be app/services/invoice_service.py:177-238", "mvp.fe src/widgets/invoice-workbench/ui/InvoiceWorkbench.tsx"]
updated: 2026-07-09
---
# LCOS-F42 · Receipt ↔ order reconciliation
**Epic:** [[LCOS-E8-purchasing]] · **Status:** planned · **Phase:** Phase 1

## Description

Closes the purchasing loop: when a receipt (invoice, [[LCOS-E2-invoice-intake]]) arrives, LCOS matches it to the open purchase order it fulfils and shows the discrepancies. A new `invoices.purchase_order_id` (FK uuid, nullable, `SET NULL`) links the two. On submit the backend **auto-matches**: the open PO (`confirmed` / `sent_manually`) of the same supplier closest in date. Zero candidates → the invoice has no PO; exactly one → linked; more than one → the UI asks the human to choose (never guesses). The integration point is `InvoiceService.submit`.

Before sending, a **discrepancy section** inside the invoice workbench compares "ordered N — received M", price differences, positions outside the order, and short deliveries. It is **informational, not blocking** — it never prevents a receipt from being submitted. Confirming with a link transitions the PO to `received`, and any shortfall is written as auto-text into the PO's `notes`. This is the step that turns a set of features into a closed "order → arrival → discrepancies → received" loop and gives an honest Phase-1 close criterion.

## Capabilities

- `invoices.purchase_order_id` (FK uuid, nullable, `SET NULL`) links a receipt to its order.
- Auto-match on submit: open PO (`confirmed`/`sent_manually`) of the same supplier, closest by date — inside `InvoiceService.submit`.
- Multiple candidates → UI selection (no guessing); zero → no PO link; one → auto-linked.
- Discrepancy section in `InvoiceWorkbench` (embedded before send): "ordered N — received M", price differences, off-order positions, short deliveries — informational, non-blocking.
- Confirm-with-link → PO `received`; shortfall auto-written to PO `notes`.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Review the discrepancy section on receipt, pick the PO when ambiguous, confirm the link (PO → `received`). |
| [[admin]] | Same, within their subdivision. |
| [[superadmin]] | Cross-tenant access. |
| [[sqladmin-operator]] | Not involved. |

Scope from active JWT context; only the caller's own invoices and POs participate (see [[multitenancy]]).

## Involved entities

- [[invoices]] — gains `purchase_order_id` (nullable FK, `SET NULL`); the link is set at submit.
- [[invoice_lines]] — the received quantities/prices compared against the order.
- [[purchase_orders]] — the matched order; transitions to `received`; shortfall recorded in `notes`.
- [[purchase_order_lines]] — the ordered quantities/prices the receipt is compared against.

## Dependencies / links

- **Requirements:** [[invoice-status-machine]] (matching hooks into `InvoiceService.submit`, the same submit path that drives invoice status; PO transition `→ received` obeys the [[LCOS-F37-purchase-orders]] status machine), [[multitenancy]] (same-org supplier matching only).
- **Features:** hooks into submit from [[LCOS-F10-invoice-status-machine]] ([[LCOS-E2-invoice-intake]]); matches POs from [[LCOS-F37-purchase-orders]] that were sent via [[LCOS-F39-order-message]]; the discrepancy UI extends `InvoiceWorkbench`, the same widget used by [[LCOS-F9-line-matching]]; results feed the close-out cycle [[LCOS-F44-live-closeout]].

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `invoices.purchase_order_id` migration (nullable FK, `SET NULL`) applies/rolls back cleanly.
- [ ] AC-BE-2. Matcher on submit: one candidate → linked; zero → invoice without PO; two+ → requires UI selection (tested for each case).
- [ ] AC-BE-3. Auto-match considers only open (`confirmed`/`sent_manually`) POs of the same supplier within the org, closest by date.
- [ ] AC-BE-4. Confirm-with-link transitions the PO to `received`; short delivery is auto-written into PO `notes`.

### Frontend
- [ ] AC-FE-1. Scenario "10 ordered → 8 received, 1 price higher": the section shows 2 short deliveries + 1 price discrepancy; the PO ends `received` with notes.
- [ ] AC-FE-2. Discrepancy section is informational (never blocks submit) and embedded before send in `InvoiceWorkbench`.
- [ ] AC-FE-3. When more than one PO matches, the UI asks the user to choose (no silent guess).

## Open questions / gates
- Owner acceptance (whole Э5): full cycle order → send → photo receipt with warehouse pick → discrepancies → `received` → invoice auto-written to Esupl, run for two weeks without a notebook.

## Sources
- `08_PHASE1_SPEC.md F5.1` (FK, auto-match rules, discrepancy screen, `received` + notes, AC).
- `07_PHASES.md Э5` ("Связь `invoices.purchase_order_id`; авто-матч; экран расхождений; PO → received").
- `mvp.be/app/services/invoice_service.py:177-238` — `submit` (the integration point for auto-match).
- `mvp.fe/src/widgets/invoice-workbench/ui/InvoiceWorkbench.tsx` — single-file widget; discrepancy section embedded before send.
