---
id: REQ-SKU-IDENTITY
type: requirement
title: Two-context SKU identity resolver (draft tolerant / commit fail-closed)
status: built
scope: cross-cutting
roles: [member, admin]
entities: ["[[sku_mapping]]", "[[ingredient_cache]]", "[[ingredients]]", "[[invoice_lines]]", "[[packings]]"]
adrs: ["[[ADR-018]]", "[[ADR-019]]", "[[ADR-020]]", "[[ADR-013]]"]
requirements: ["[[fail-closed]]", "[[invoice-status-machine]]", "[[supplier-criteria-registry]]", "[[erp-esupl-integration]]", "[[global-requirements]]"]
legacy_refs: [DEC-0011, DEC-0012, DEC-0013, 08 F1.1/F1.2]
sources: [01_ARCHITECTURE.md "SKU identity & two-context resolver", APP_OVERVIEW.md §7/§8, 04_DECISIONS ADR-018..020]
updated: 2026-07-09
---

# REQ-SKU-IDENTITY · Two-context SKU identity resolver

**Type:** cross-cutting SSOT · **Status:** built. The heart of the learning-loop moat. Codifies **DEC-0011 + DEC-0013 variant A + DEC-0012** ([[ADR-018]]/[[ADR-019]]/[[ADR-020]]).

## Normative statement

- **N1. Two separate contexts (do not mix):**
  - **Draft-resolve (`prepare()`, tolerant, cheap):** builds the Esupl payload from the **local catalog** [[ingredients]] — numeric FKs (`esupl_item_id`, `esupl_unit_id`, the default [[packings]]), tax_rate. Readiness = "payload buildable". Hints (fuzzy layer 1 client-side, LLM `suggest-matches`, exact hits from [[ingredient_cache]]) live **only here** as hints. `prepare()` does **not** touch `pos_ingredient_id`.
  - **Commit-resolve (`submit()` → `_resolve_commit_identities` → Phase 2, fail-closed):** the durable `pos_ingredient_id` is resolved by `normalize_source_key(line.description)` (the same normalization as on write — `sku_service.normalize_source_key`, the SSOT) against [[sku_mapping]], priority **subdivision → org**.
- **N2. Commit-eligible = only a confirmed identity:** `method='manual'` **OR** `confirmed_by IS NOT NULL`. Cache / fuzzy / AI are **never** consulted on the commit path.
- **N3. Live validation on commit** (`validate_ingredient_on_commit`): the resolved id is checked in the POS (`GET /teams/{id}/products?id=`); any exception, a missing id, a unit mismatch → **block + review** (`rejected`, nothing is written). An unresolved one (no confirmed mapping) also blocks — **never a silent skip**. On success the durable id is snapshotted into `invoice_lines.pos_ingredient_id`.
- **N4. DEC-0013 variant A (block until confirmation):** an exact `ingredient_cache` match **without** a confirmed `sku_mapping` does **not** auto-commit and does **not** auto-create a mapping — the line is held for manual confirmation. Variant C (auto-creation `cache_exact`/`confirmed_by='system'`) is **rejected** ([[ADR-018]] veto 2026-07-09) — it ranks below DEC-0013 in authority and breaks the merge-gate test `test_exact_cache_match_does_not_commit_and_creates_no_mapping`.
- **N5. Composite key (DEC-0012, [[ADR-019]]):** `sku_mapping` is keyed by `UNIQUE(scope_type, scope_id, supplier_external_id, source_key)`. `supplier_external_id` = the durable Esupl id of the supplier (`''` = supplier-agnostic/legacy). The reason — the same raw text from **different suppliers** may point to different POS SKUs; without the supplier in the key — collision/overwrite.
- **N6. The moat accumulation channel ([[ADR-020]]):** the only runtime channel is the client-side `POST /ingredients/mappings`, which the FE calls in `onSend` (`method='manual'`, `confirmed_by`=the authenticated user) **BEFORE** the `sendInvoice` mutation, in a **separate transaction**. The BE submit endpoint does **not write** `sku_mapping` — it only reads on the commit-resolve. Persist-then-commit → a confirmed mapping **survives a reject** of the invoice by design.
- **N7. `source_key` = the raw line text** (not the SKU name from the catalog). The normalization is owned by the backend (`normalize_source_key`); the FE sends `rawName` and reads mappings from the backend. FE normalization mirrors the backend (a golden-vector parity test).
- **N8. `esupl_item_id` (int) vs `pos_ingredient_id` (str)** — one Esupl entity in two representations: an int copy of the catalog for the payload (draft-resolve, disposable/re-syncable) and a str anchor of identity in `sku_mapping`/on the line (commit-resolve, moat). `pos_ingredient_id == str(esupl id)`.
- **N9. Unit-authority (D2):** the unit in the payload is **from the POS** (`esupl_unit_id`), not OCR. The OCR unit is a tolerant cross-check: it blocks commit only when **both** are set and differ (case/space-normalized).

## Rationale

The POS is the only SoT of ingredient identity/attributes; LCOS is never authoritative over master data. LCOS's value is the **mapping** (raw line text → durable POS id), an accumulating moat. Anchoring to the durable id (rather than to the cache surrogate PK) lets it survive a drop+rebuild of the cache. Fail-closed commit ("an invoice is a responsible step") requires an explicit human confirmation for every new item — this is the "review". The composite key and persist-then-commit are targeted fixes for real collisions/bootstrap bugs found by verification.

## Failure modes

- **No confirmed mapping** → block + review (not a silent skip and not auto-creation).
- **POS unavailable / id gone / unit mismatch on commit** → block + review.
- **VER-021 (durability of `pos_ingredient_id`) — OPEN GATE:** the stability of the id on edit/delete-recreate is NOT confirmed; owner-run (a WRITE to the Esupl sandbox), merge gated. If the id is not durable → STOP and reopen DEC-0011 for an alternative anchor. See [[erp-esupl-integration]].
- **VER-022 (cache scope asymmetry) — CLOSED:** under variant A the cache is off the commit path, there is no cache-vs-mapping priority conflict.
- **`invoice_lines.sku_embedding Vector(1536)` — UNUSED dead code:** not read/written, no ANN index, no embedding provider; flagged for cleanup (backlog DEC-02). The current matching is fuzzy + LLM, not this column.

## Relations

- ADR: [[ADR-018]] (commit-gate variant A + veto of C), [[ADR-019]] (composite key DEC-0012), [[ADR-020]] (moat channel = `onSend`/persist-then-commit), [[ADR-013]] (photo-first — supplier from the photo).
- Entities: [[sku_mapping]] (the moat), [[ingredient_cache]] (draft-only, non-authoritative), [[ingredients]] (+ [[packings]], the catalog), [[invoice_lines]] (the durable id on the line).
- Requirements: [[fail-closed]], [[invoice-status-machine]], [[erp-esupl-integration]], [[global-requirements]].

## Referenced by

`LCOS-F13` (Two-context SKU identity resolver), `LCOS-F14` (Learning-loop moat), `LCOS-F15` (catalog & packings), `LCOS-F16` (ingredient cache), `LCOS-F22` (SKU-identity stabilization), `LCOS-F9` (line↔catalog matching, draft-hints).

## Sources

- 01_ARCHITECTURE.md → "SKU identity & the two-context resolver (DEC-0011/0013 variant A)", T1/T2/T5/D2.
- APP_OVERVIEW.md §7, §8; 04_DECISIONS.md ADR-018/019/020; `__DEC-0011.md`, `__DEC-0013.md`.
- Code: `app/services/sku_service.py`, `invoice_service.py::_resolve_commit_identities`; FE `entities/invoice/lib/backendMappings.persistLineMapping`.
