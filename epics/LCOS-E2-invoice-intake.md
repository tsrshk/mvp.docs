---
id: LCOS-E2
type: epic
title: Invoice intake (the wedge)
status: built
phase: "Phase 1"
features: ["[[LCOS-F8-ocr-recognition]]", "[[LCOS-F9-line-matching]]", "[[LCOS-F10-invoice-status-machine]]", "[[LCOS-F11-esupl-read]]", "[[LCOS-F12-warehouse-target]]"]
legacy_refs: [07 Э0/Э1, plan F1, 08 F0.x]
sources: [APP_OVERVIEW.md §6 §9, 08_PHASE1_SPEC.md §Э0, 07_PHASES.md Э0/Э1]
updated: 2026-07-09
---

# LCOS-E2 · Invoice intake (the wedge)

**Status:** built · **Phase:** Phase 1 · **Type:** product wedge

## Description

The first and primary product wedge: turn a photo of a paper invoice into a goods receipt recorded in the ERP, removing manual entry. Flow: **Photo → recognize (OCR, vision-LLM) → InvoiceDraft → prepare() → submit() → write_invoice()**. `prepare()` runs in a tolerant draft context (builds the payload from the local catalog; hints live only here); `submit()` runs in a fail-closed commit context (arithmetic → identity → live POS validation → status). A real write to Esupl happens only when `ERP_WRITE_ENABLED` (OFF by default → a `prepared` id is returned without a write).

LCOS is the **invoice write-point** and read-only with respect to the rest of the Esupl data. Line identity (durable `pos_ingredient_id`) is the subject of a separate epic [[LCOS-E3-sku-identity]]; this epic covers the pipeline itself and its status machine.

## Goal / value

Close the coffee-shop owner's pain #1 — manual entry of invoices and their posting. The value is measurable: an invoice from a known supplier goes from photo to `prepared`/`written` in minutes, with a human-in-the-loop only at confirmation. This is step 1 of the routine ladder and the entry into the Pilot-Gate ([[ADR-003]]).

## Features

| ID | Name | Status | Link |
|---|---|---|---|
| LCOS-F8 | OCR recognition (photo → InvoiceDraft) | ✅ built | [[LCOS-F8-ocr-recognition]] |
| LCOS-F9 | Line-to-catalog matching (draft-resolve) | ✅ built | [[LCOS-F9-line-matching]] |
| LCOS-F10 | Invoice status machine + Esupl payload + gated write | ✅ built | [[LCOS-F10-invoice-status-machine]] |
| LCOS-F11 | Esupl read integration | ✅ built | [[LCOS-F11-esupl-read]] |
| LCOS-F12 | Warehouse-target selection | 📝 planned | [[LCOS-F12-warehouse-target]] |

## Key entities / requirements

- Entities: [[invoices]], [[invoice_lines]], [[ingredients]], [[packings]], [[sku_mapping]], [[suppliers]].
- Requirements: [[invoice-status-machine]], [[sku-identity-resolver]], [[erp-esupl-integration]], [[fail-closed]], [[provider-abstraction]].
- Roles: [[member]] (receives the invoice), [[admin]] (subdivision settings).

## Gates

- **`ERP_WRITE_ENABLED` = OFF by default:** the pipeline lives in `prepared`; enabling the real write is a deliberate step by Customer Zero (07_PHASES §Э0 kill-criteria: "the write fails → the pipeline stays in prepared, escalate to Esupl").
- **`VER-021` durability (open, owner-run):** the stability of `pos_ingredient_id` is not empirically confirmed; merge remains gated — details in [[LCOS-E5-stabilization]].
- **`S1` read-only (open):** confirm in the browser that the `products?id=` / `product_name` filters are honored; the `/products` vs `/ingredients` discrepancy is documented.
- **Statuses:** `rejected` / `validated` / `prepared` / `written` / `failed` — the normative machine is in [[invoice-status-machine]].

## legacy_refs

07 Э0 (API contract + reconnaissance) / Э1; plan F1; 08_PHASE1_SPEC F0.x (F0.6 = warehouse selection → [[LCOS-F12-warehouse-target]]).

## Sources

- APP_OVERVIEW.md §6 (key flow), §9 (Esupl integration)
- 08_PHASE1_SPEC.md §Э0 (contracts, F0.6), 07_PHASES.md Э0/Э1
- ADR: [[ADR-006]], [[ADR-009]], [[ADR-016]]
