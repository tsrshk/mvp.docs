---
id: LCOS-E4
type: epic
title: Supplier directory and terms
status: partial
phase: "Phase 1"
features: ["[[LCOS-F17-supplier-cards]]", "[[LCOS-F18-supplier-criteria]]", "[[LCOS-F19-supplier-self-service]]", "[[LCOS-F20-price-history]]", "[[LCOS-F21-price-change-signal]]"]
legacy_refs: [07 Э2, plan F3, 08 F2.x, APP §10]
sources: [APP_OVERVIEW.md §10, 07_PHASES.md Э2, 08_PHASE1_SPEC.md F2.x]
updated: 2026-07-09
---

# LCOS-E4 · Supplier directory and terms

**Status:** 🟡 partial · **Phase:** Phase 1

## Description

A supplier in LCOS is a mirror of the Esupl entity (`following`, `is_virtual=1`) plus its own LCOS card: contacts, notes, and **flexible criteria** (volume, delivery time, delivery days, payment mode, deferral). Criteria are stored in `Supplier.criteria` (JSONB), and their definitions live in the registry `app/domain/supplier_criteria.py` (`CriterionDef`). Validation runs against the registry at the API level: invalid values → 422, unknown keys are silently dropped. New criteria are added by **editing the registry, without migrations**.

This is an as-built design that **supersedes** the early plan (07 Э2 proposed a separate `supplier_settings` table with columns) — the decision moved to criteria-registry + JSONB (collision-resolution #4 in the restructure plan). The FE page `/suppliers`, `supplier-selector`, breadcrumbs, and footer exist (doc↔code correction from the inventory).

## Goal / value

Give the AI manager knowledge of each supplier's terms — the foundation for order planning ([[LCOS-E8-purchasing]]): when it is possible to order, the minimum amount, the delivery time. Without structured terms, an order proposal would be guesswork. Consumer analytics over the criteria (REQ 1b) — the model exists (a seam), the consumer is deferred by a checkpoint decision.

## Features

| ID | Name | Status | Link |
|---|---|---|---|
| LCOS-F17 | Supplier cards CRUD + delivery terms | ✅ built | [[LCOS-F17-supplier-cards]] |
| LCOS-F18 | Supplier flexible criteria registry | ✅ built | [[LCOS-F18-supplier-criteria]] |
| LCOS-F19 | Supplier self-service seam | 📝 planned | [[LCOS-F19-supplier-self-service]] |
| LCOS-F20 | Price history + auto-collect | 📝 planned | [[LCOS-F20-price-history]] |
| LCOS-F21 | Price-change signal in the invoice flow | 📝 planned | [[LCOS-F21-price-change-signal]] |

## Key entities / requirements

- Entities: [[suppliers]], [[users]] (nullable `portal_user_id` — self-service placeholder), [[memberships]].
- Requirements: [[supplier-criteria-registry]], [[erp-esupl-integration]], [[multitenancy]].
- Roles: [[admin]] (fills in cards/criteria), [[member]] (reads), [[supplier-future]] (placeholder, nothing built in UI/auth).

## Gates

- **Self-service — placeholder only ([[ADR-017]]):** the `supplier` role is in the enum, nullable `suppliers.portal_user_id → users.id`; "the door is open, a global supplier user + invite tokens come later." Nothing is built in auth/UI (Phase 1 non-goal).
- **DEC-4/checkpoint:** the consumer of supplier analytics (REQ 1b) is deferred.
- **NOT built in Phase 1:** `default_order_volume`, `supplier_prices`/price alerts (07 Э2) — moved to F20/F21 as planned.

## legacy_refs

07 Э2 (supplier settings + self-service placeholder; the `supplier_settings` table is superseded by criteria-JSONB); plan F3 (price history → F20); 08_PHASE1_SPEC F2.x; APP_OVERVIEW §10.

## Sources

- APP_OVERVIEW.md §10 (flexible criteria), §11 (`suppliers`)
- 07_PHASES.md Э2, 08_PHASE1_SPEC.md F2.x
- ADR: [[ADR-017]]
