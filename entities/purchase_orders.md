---
id: purchase_orders
type: entity
title: purchase_orders — purchase order drafts (planned)
status: planned
scope: subdivision
table: purchase_orders
pk: int
used_by: ["[[LCOS-F37-purchase-orders]]", "[[LCOS-F38-orders-ui]]", "[[LCOS-F39-order-message]]", "[[LCOS-F40-ai-order-proposal]]", "[[LCOS-F42-receipt-reconciliation]]"]
requirements: ["[[multitenancy]]", "[[invoice-status-machine]]"]
sources: ["08_PHASE1_SPEC.md F4.1 (archived)", "07_PHASES.md Э4a (archived)"]
updated: 2026-07-09
---
# purchase_orders — purchase order drafts (planned)

> **Status: planned** (epic [[LCOS-E8-purchasing]]). Specified by [[LCOS-F37-purchase-orders]].

## Purpose
A supplier order draft the operator builds (manually or AI-prefilled), confirms, and sends via the supplier's own channel. LCOS does **not** write orders to Esupl — human-in-the-loop only (see [[ADR-002]]).

## Scope
Subdivision-scoped (see [[multitenancy]]).

## Key fields (planned)
| Field | Notes |
|---|---|
| organization_id / subdivision_id | tenant scope |
| supplier_id | → [[suppliers]] |
| status | `draft` → `confirmed` → `sent_manually` → `received` / `cancelled` (409 on invalid transition) |
| total_amount | computed |
| confirmed_by | → [[users]] |

Reconciled against the received invoice via `invoices.purchase_order_id` (see [[LCOS-F42-receipt-reconciliation]], [[invoices]]).

## Used by
[[LCOS-F37-purchase-orders]], [[LCOS-F38-orders-ui]], [[LCOS-F39-order-message]], [[LCOS-F40-ai-order-proposal]], [[LCOS-F41-ai-order-ui]], [[LCOS-F42-receipt-reconciliation]].

## Sources
`08_PHASE1_SPEC.md` F4.1/F5.1 (archived), `07_PHASES.md` Э4a/Э5 (archived).
