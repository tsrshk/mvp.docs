---
id: LCOS-E5
type: epic
title: Stabilization and conformance
status: partial
phase: "Phase 1"
features: ["[[LCOS-F22-sku-stabilization]]", "[[LCOS-F23-failclosed-encryption]]", "[[LCOS-F24-merge-gate-tests]]", "[[LCOS-F25-deadcode-cleanup]]", "[[LCOS-F26-multipage-fix]]", "[[LCOS-F27-receipts-rename]]", "[[LCOS-F28-esupl-contracts]]"]
legacy_refs: [plan S1, 08 Э1/F1.x, Conformance Part 2]
sources: [APP_OVERVIEW.md §12 §13, TZ__STABILIZATION_2026-07-09__ALIGNED.md, VER-021_ESUPL_DURABILITY_TEST.md, 05_BACKLOG.md]
updated: 2026-07-09
---

# LCOS-E5 · Stabilization and conformance

**Status:** 🟡 partial · **Phase:** Phase 1

## Description

The technical debt and quality needed to move the invoice pipeline into production mode. This includes ratifying the two-context identity (DEC-0011/0013 variant A, DEC-0012 composite key), fail-closed encryption (ALIGN-01), the set of merge-blocking non-negotiable tests (VER-01), dead-code cleanup (including the unused `sku_embedding`), the interim fix for the silent loss of multi-page invoices, the FE rename `entities/order → receipts` (removing the collision before purchase orders appear), and documenting the Esupl contracts (Э0).

This is the "bridge" epic between the built wedge and its production use — most of it is already done and verified (209 BE / 43 FE tests green on real Postgres), but open gated items remain (VER-021, S1).

## Goal / value

Bring the system to a state where Customer Zero turns on `ERP_WRITE_ENABLED` and relies on the pipeline daily, without the risk of silent data loss, secret leakage, or invariant regression. Conformance R1–R9 → [[global-requirements]].

## Features

| ID | Name | Status | Link |
|---|---|---|---|
| LCOS-F22 | SKU identity stabilization (DEC-0011/0013/0012) | ✅ built | [[LCOS-F22-sku-stabilization]] |
| LCOS-F23 | Fail-closed encryption (ALIGN-01) | 📝 planned | [[LCOS-F23-failclosed-encryption]] |
| LCOS-F24 | Merge-blocking non-negotiable tests (VER-01) | 🟡 partial | [[LCOS-F24-merge-gate-tests]] |
| LCOS-F25 | Dead-code / seam cleanup | 📝 planned | [[LCOS-F25-deadcode-cleanup]] |
| LCOS-F26 | Interim fix for silent multi-page loss | 📝 planned | [[LCOS-F26-multipage-fix]] |
| LCOS-F27 | Rename entities/order → receipts | 📝 planned | [[LCOS-F27-receipts-rename]] |
| LCOS-F28 | Esupl API contracts (Э0) | 📝 planned | [[LCOS-F28-esupl-contracts]] |

## Key entities / requirements

- Entities: [[sku_mapping]], [[ingredient_cache]], [[integration_credentials]], [[invoice_lines]].
- Requirements: [[fail-closed]], [[secret-encryption]], [[sku-identity-resolver]], [[erp-esupl-integration]], [[global-requirements]].
- Roles: [[admin]], [[sqladmin-operator]].

## Gates

- **`VER-021` durability (OPEN, owner-run):** whether `pos_ingredient_id` is stable across edit / delete-recreate — NOT empirically confirmed; the probe requires a WRITE to the sandbox → owner-run, cannot be closed in read-only. **Merge remains gated.** See [[VER-021_ESUPL_DURABILITY_TEST]].
- **`S1` read-only (OPEN):** confirm that the `products?id=` / `product_name` filters are honored; the endpoint discrepancy `/products?id=` (code) vs `/ingredients/{id}` (probe) is documented.
- **DEC-0013 variant A** ratified, variant C rejected ([[ADR-018]]).
- **merge_gate marker:** 17 durable-id + DEC-0013 tests; currently 209 BE / 43 FE green.
- **backlog DEC-02:** drop `sku_embedding` (status: open).

## legacy_refs

plan S1 (stabilization); 08_PHASE1_SPEC Э1 / F1.x; LCOS_Conformance Part 2; backlog DEC-02/DEC-05/ALIGN-01/VER-01.

## Sources

- APP_OVERVIEW.md §12 (testing), §13 (state/open items)
- TZ__STABILIZATION_2026-07-09__ALIGNED.md (aligned merge-gate)
- VER-021_ESUPL_DURABILITY_TEST.md, 05_BACKLOG.md
- ADR: [[ADR-018]], [[ADR-019]], [[ADR-020]]
