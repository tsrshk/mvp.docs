---
id: LCOS-E3
type: epic
title: SKU identity and learning-loop moat
status: built
phase: "Phase 1"
features: ["[[LCOS-F13-sku-identity-resolver]]", "[[LCOS-F14-learning-loop]]", "[[LCOS-F15-sku-catalog]]", "[[LCOS-F16-ingredient-cache]]"]
legacy_refs: [DEC-0011, DEC-0013, DEC-0012, 08 F1.1/F1.2]
sources: [APP_OVERVIEW.md §7 §8 §11, 04_DECISIONS__DEC-0011.md, 04_DECISIONS__DEC-0013.md, 01_ARCHITECTURE.md]
updated: 2026-07-09
---

# LCOS-E3 · SKU identity and learning-loop moat

**Status:** built · **Phase:** Phase 1 · **Type:** architectural moat

## Description

The two-context SKU identity model is the heart of the product's defensive moat. Two entities are separated: the **ingredient master data** (`name`, `unit`, `category` — a foreign asset, owned by the POS; LCOS is never authoritative) and the **mapping** (`source_key` → identity — an LCOS asset, the accumulating moat).

Two resolution contexts:
- **Draft-resolve** (`prepare`, tolerant): payload from the local catalog; hints (fuzzy / LLM / exact-cache) live ONLY here, `pos_ingredient_id` is not touched.
- **Commit-resolve** (`submit` → `_resolve_commit_identities` → Phase 2, **fail-closed**): the durable `pos_ingredient_id` is taken **only from `sku_mapping`**, with priority `subdivision → org`, and **only a confirmed identity** (`method=manual` OR `confirmed_by IS NOT NULL`). Cache / fuzzy / AI do not participate at commit. Then a live query to the POS; None / mismatch / unavailability → block + review.

Keyed by the composite key `(scope_type, scope_id, supplier_external_id, source_key)` — the same line text from different suppliers may point to different POS SKUs ([[ADR-019]], DEC-0012).

## Goal / value

Every human-confirmed line makes the next invoice from the same supplier more accurate — a learning loop that a competitor without the client's history cannot reproduce. This is the real moat: not OCR (which will be copied), but the accumulated, tenant-bound, confirmed identity.

## Features

| ID | Name | Status | Link |
|---|---|---|---|
| LCOS-F13 | Two-context SKU identity resolver | ✅ built | [[LCOS-F13-sku-identity-resolver]] |
| LCOS-F14 | Learning-loop mapping moat | ✅ built | [[LCOS-F14-learning-loop]] |
| LCOS-F15 | SKU catalog and packings | ✅ built | [[LCOS-F15-sku-catalog]] |
| LCOS-F16 | Ingredient cache (draft-only) | ✅ built | [[LCOS-F16-ingredient-cache]] |

## Key entities / requirements

- Entities: [[sku_mapping]], [[ingredients]], [[packings]], [[ingredient_cache]], [[invoice_lines]].
- Requirements: [[sku-identity-resolver]], [[fail-closed]], [[erp-esupl-integration]].
- Roles: [[member]] (confirms identity by sending), [[admin]].

## Gates

- **DEC-0013 variant A (ratified):** an exact-cache-match WITHOUT a confirmed mapping does NOT auto-commit and does NOT auto-create a mapping. Variant C (auto-creation) was proposed in the TZ and **rejected** ([[ADR-018]]).
- **DEC-0012 / [[ADR-019]]:** composite key with `supplier_external_id` — otherwise identical texts from different suppliers collide.
- **[[ADR-020]] persist-then-commit:** a confirmed mapping is written by a separate call `POST /ingredients/mappings` **before** submission, so it survives the rejection of the first invoice (otherwise the moat is never initialized).
- **VER-022 (closed):** the cache scope asymmetry has been eliminated — there is no cache on the commit path.
- **`sku_embedding` — dead code:** the [[invoice_lines]].`sku_embedding` column is NOT used (no ANN index, no embedding provider, no read/write); a placeholder for future semantic matching, flagged for cleanup (backlog DEC-02, status: open) — see [[LCOS-F25-deadcode-cleanup]].

## legacy_refs

DEC-0011 / DEC-0013 (variant A) / DEC-0012 (composite key); 08_PHASE1_SPEC F1.1/F1.2 (superseded by the as-built moat design).

## Sources

- APP_OVERVIEW.md §7 (two-context identity), §8 (learning loop), §11 (data model)
- 04_DECISIONS__DEC-0011.md, 04_DECISIONS__DEC-0013.md, 01_ARCHITECTURE.md
- ADR: [[ADR-018]], [[ADR-019]], [[ADR-020]]
