---
id: LCOS-E8
type: epic
title: Purchasing — order drafts and loop closure
status: planned
phase: "Phase 1"
features: ["[[LCOS-F37-purchase-orders]]", "[[LCOS-F38-orders-ui]]", "[[LCOS-F39-order-message]]", "[[LCOS-F40-ai-order-proposal]]", "[[LCOS-F41-ai-order-ui]]", "[[LCOS-F42-receipt-reconciliation]]", "[[LCOS-F43-idempotency]]", "[[LCOS-F44-live-closeout]]"]
legacy_refs: [07 Э4a/Э4b/Э5, 08 F4.x/F5.x]
sources: [07_PHASES.md Э4/Э5, 08_PHASE1_SPEC.md F4.x/F5.x]
updated: 2026-07-09
---

# LCOS-E8 · Purchasing — order drafts and loop closure

**Status:** 📝 planned · **Phase:** Phase 1

## Description

The final step of Phase 1: turn knowledge of stock levels and supplier terms into ready-to-send orders. Entities `purchase_orders` + lines with their own status machine and prefill from supplier terms ([[LCOS-E4-suppliers]]) and stock levels ([[LCOS-E7-stock]]). A manual draft at `/orders` with a minimum-amount indicator; confirmation turns the order into a **copyable supplier message**. Then — an AI order proposal (`order_planning_service`) with AI lines flagged, receipt ↔ order reconciliation, server-side idempotency (DEFER-04), and a live mode with close-out metrics.

Loop closure: ordered → arrived → received as an invoice ([[LCOS-E2-invoice-intake]]) → reconciled against the order → stock updated. This is the full "AI manager" circuit on a single routine.

## Goal / value

Step 4 of the routine ladder and the target point of the Pilot-Gate: the owner does not count orders by hand — the AI proposes, the human confirms, the message goes to the supplier. Customer Zero's daily production use of this circuit is precisely the criterion for passing the Pilot-Gate ([[ADR-003]]).

## Features

| ID | Name | Status | Link |
|---|---|---|---|
| LCOS-F37 | `purchase_orders` + lines + status machine + prefill | 📝 planned | [[LCOS-F37-purchase-orders]] |
| LCOS-F38 | `/orders` manual draft + minimum-amount indicator | 📝 planned | [[LCOS-F38-orders-ui]] |
| LCOS-F39 | Confirmation → copyable supplier message | 📝 planned | [[LCOS-F39-order-message]] |
| LCOS-F40 | AI order proposal (`order_planning_service`) | 📝 planned | [[LCOS-F40-ai-order-proposal]] |
| LCOS-F41 | "Propose order" UI + AI line flagging | 📝 planned | [[LCOS-F41-ai-order-ui]] |
| LCOS-F42 | Receipt ↔ order reconciliation | 📝 planned | [[LCOS-F42-receipt-reconciliation]] |
| LCOS-F43 | Server-side idempotency (DEFER-04) | 📝 planned | [[LCOS-F43-idempotency]] |
| LCOS-F44 | Live mode + close-out metrics | 📝 planned | [[LCOS-F44-live-closeout]] |

## Key entities / requirements

- Entities: [[purchase_orders]], [[purchase_order_lines]], [[stock_levels]], [[suppliers]], [[ingredients]], [[invoices]].
- Requirements: [[supplier-criteria-registry]], [[erp-esupl-integration]], [[provider-abstraction]], [[fail-closed]].
- Roles: [[member]] (creates/confirms the order), [[admin]].

## Gates

- **The human confirms:** the AI prepares the proposal, the human decides on sending (a cross-cutting principle).
- **Idempotency (DEFER-04):** server-side protection against duplicate orders.
- **Pilot-Gate ([[ADR-003]]) / kill-criteria:** if the built step is not used by Customer Zero 4 weeks after rollout — strategy review (06_STRATEGY §review).
- Order lines carry durable references to the POS identity via [[sku_mapping]] (reuse of the moat from [[LCOS-E3-sku-identity]]).

## legacy_refs

07 Э4a/Э4b/Э5 (orders + closure); 08_PHASE1_SPEC F4.x/F5.x.

## Sources

- 07_PHASES.md Э4/Э5, 08_PHASE1_SPEC.md F4.x/F5.x
- ADR: [[ADR-003]], [[ADR-016]]
