---
id: LCOS-F13
type: feature
title: Two-context SKU identity resolver
epic: "[[LCOS-E3-sku-identity]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[sku_mapping]]", "[[ingredients]]", "[[ingredient_cache]]", "[[invoice_lines]]", "[[subdivisions]]", "[[organizations]]"]
requirements: ["[[sku-identity-resolver]]", "[[fail-closed]]", "[[erp-esupl-integration]]", "[[invoice-status-machine]]"]
adrs: ["[[ADR-018]]", "[[ADR-019]]", "[[ADR-020]]"]
legacy_refs: [DEC-0011, DEC-0013, DEC-0012, "08 F1.1", "08 F1.2"]
sources: ["APP_OVERVIEW.md §7", "04_DECISIONS__DEC-0011.md", "04_DECISIONS__DEC-0013.md", "mvp.be app/services/invoice_service.py:295", "mvp.be app/services/sku_service.py"]
updated: 2026-07-09
---
# LCOS-F13 · Two-context SKU identity resolver
**Epic:** [[LCOS-E3-sku-identity]] · **Status:** built · **Phase:** Phase 1

## Description

The core of the LCOS moat: how an invoice line turns into a **durable** POS-SKU identity. The model separates two entities (`DEC-0011`):

- **Ingredient master data** (`name`, `unit`, `category`) — a third-party asset owned by the POS (Esupl). LCOS is never authoritative.
- **Mapping** (`source_key` → identity) — an LCOS asset, the accumulating moat.

Identity resolution is deliberately split into **two contexts** with different strictness:

- **Draft resolve** (`prepare`, tolerant): builds the POS payload from the **local catalog** — the numeric Esupl FKs (`esupl_item_id`, `esupl_unit_id`, `packing`), `tax_rate`. Hints (fuzzy / LLM / exact-cache) live **only here**. The durable `pos_ingredient_id` is **not touched** here (`_resolve_line`).
- **Commit resolve** (`submit` → `_resolve_commit_identities` → Phase-2 live validation, **fail-closed**): the durable `pos_ingredient_id` is taken **only from `sku_mapping`**, priority `subdivision → org`, and **only a confirmed identity** (`method=manual` OR `confirmed_by IS NOT NULL`). Cache / fuzzy / AI do **not** participate in the commit.

After resolving from the mapping, a **live request to the POS** is made (`GET /teams/{id}/products?id=`); on the absence of an exact match — `None`, **with no `items[0]` fallback**. `None` / mismatch / POS unavailability → **block + review** (the line is not committed). This is **variant A** (`DEC-0013`, `[[ADR-018]]`): an exact-cache-match without a confirmed mapping does NOT auto-commit and does NOT auto-create a mapping. Variant C (auto-creation) was proposed in the TZ and **rejected**.

## Capabilities

- Separation of the draft context (tolerant, payload) and the commit context (fail-closed, durable identity).
- Commit resolve in **a single query** for all lines: an `IN` over `(scope_type, scope_id)` ∈ {`subdivision`, `org`} + equality on `supplier_external_id` + `source_key IN keys` + a `commit_eligible` filter; the `subdivision → org` priority is resolved in memory.
- **The mapping key is composite** (`DEC-0012`, `[[ADR-019]]`): `(scope_type, scope_id, supplier_external_id, source_key)`; the same line text from **different suppliers** may point to different POS-SKUs — without the supplier in the key this is a collision.
- `source_key` — the **normalized raw line text** (not the catalog's SKU name); normalization is the backend SSOT `normalize_source_key`; FE normalization mirrors it (golden-vector parity test).
- Two representations of the same Esupl entity: `esupl_item_id` (int, a catalog copy for the payload) vs `pos_ingredient_id` (str, the identity anchor; `pos_ingredient_id == str(esupl id)`).
- **Unit authority (D2):** the payload unit comes from the POS (`esupl_unit_id`); the OCR unit is a tolerant cross-check (block only if both are set and differ).
- Per-line live checks at commit run **in parallel** (`asyncio.gather`) — ~1×RTT instead of N×RTT.
- Fail-closed on all uncertainties: no confirmed mapping / POS unavailable / mismatch → block, never fail-open.

## Role-based access

| Role | What they can do |
|---|---|
| [[member]] | Confirms the line → SKU match when submitting the invoice (this is the human identity confirmation); the resolver works within their tenant scope. |
| [[admin]] | Same within the subdivision. |
| [[superadmin]] | Cross-tenant access. |

The resolver has no UI endpoint of its own — it is invoked inside `submit` (see [[LCOS-F10-invoice-status-machine]]); writing the confirmed mapping is a separate call (see [[LCOS-F14-learning-loop]]).

## Entities involved

- [[sku_mapping]] — the **only** source of durable identity at commit; key `(scope_type, scope_id, supplier_external_id, source_key)`; fields `pos_ingredient_id`, `method`, `confidence`, `confirmed_by`, `packing`.
- [[ingredients]] — the local catalog (a POS mirror); the source of the numeric Esupl FKs and `tax_rate` on the draft resolve.
- [[ingredient_cache]] — a non-authoritative draft-only cache; it does **not** participate on the commit path (VER-022 closed).
- [[invoice_lines]] — the line holds the durable `pos_ingredient_id` (a snapshot of the committed id at `prepared`).
- [[subdivisions]], [[organizations]] — define the scope priority of the resolve (`subdivision → org`).

## Dependencies / relations

- **Requirements:** [[sku-identity-resolver]] (the normative SSOT of this mechanic), [[fail-closed]] (block + review on uncertainties), [[erp-esupl-integration]] (live `products?id=`, read-only), [[invoice-status-machine]] (where the commit resolve is invoked).
- **Features:** [[LCOS-F14-learning-loop]] (writing the confirmed mapping, persist-then-commit), [[LCOS-F15-sku-catalog]] (catalog + packings), [[LCOS-F16-ingredient-cache]] (draft-only cache), [[LCOS-F9-line-matching]] (draft resolve of lines), [[LCOS-F22-sku-stabilization]] (the stabilization merge-gate).
- **ADR:** [[ADR-018]] (variant A — commit requires a confirmed identity; variant C rejected), [[ADR-019]] (composite key, DEC-0012), [[ADR-020]] (persist-then-commit — why the mapping survives a reject).

## Acceptance criteria (AC)

### Backend
- [ ] AC-BE-1. `_resolve_commit_identities` resolves the durable `pos_ingredient_id` **only from `sku_mapping`** — cache/fuzzy/AI are not read at commit.
- [ ] AC-BE-2. Only a **confirmed** identity is considered: `method=MappingMethod.manual` OR `confirmed_by IS NOT NULL` (`commit_eligible`).
- [ ] AC-BE-3. Scope priority `subdivision → org`: when both mappings exist, the subdivision one wins (resolved in memory via `by_key`).
- [ ] AC-BE-4. The key includes `supplier_external_id`: the same `source_key` from different suppliers resolves to different `pos_ingredient_id` (DEC-0012); relies on `UNIQUE(scope_type,scope_id,supplier_external_id,source_key)`.
- [ ] AC-BE-5. `source_key` = `normalize_source_key(line.description)` (the raw line text), not the catalog name; the same normalization as when writing the mapping.
- [ ] AC-BE-6. A line without a confirmed mapping → `pos_ingredient_id = None` → an `unresolved_sku` error and block (fail-closed, NOT skip).
- [ ] AC-BE-7. Live validation: `GET products?id=`; no exact match → `None` **with no `items[0]` fallback**; a unit mismatch (both set) → block; a provider exception (POS unavailable) → block (fail-closed).
- [ ] AC-BE-8. An exact-cache-match without a confirmed mapping does NOT auto-commit and does NOT create a mapping (variant A, `[[ADR-018]]`) — covered by the merge-gate test.
- [ ] AC-BE-9. The commit resolve is a single SQL query over all lines; the live checks are parallel (`asyncio.gather`).
- [ ] AC-BE-10. Tenant isolation: the resolve does not see another organization's mappings (scope in the repository/query signature).

### Frontend
- [ ] AC-FE-1. `normalizeSourceKey(rawName)` mirrors the backend normalization — the golden-vector parity test is green.
- [ ] AC-FE-2. A line without a confirmed identity is shown as "requires SKU confirmation" (a block state), rather than being silently submitted.

### Other (data)
- [ ] AC-OTHER-1. The `merge_gate` marker (17 durable-id + DEC-0013 tests) is green and blocks merge.
- [ ] AC-OTHER-2. `ingredient_cache` is confirmed absent on the commit path (VER-022 regression test).

## Open questions / gates

- **VER-021** — the durability of `pos_ingredient_id` on edit/delete-recreate in Esupl is NOT empirically confirmed; the probe requires a WRITE to the sandbox → **owner-run**, merge stays gated. See [[VER-021_ESUPL_DURABILITY_TEST]].
- **S1 read-only** — confirm that the `products?id=` / `product_name` filters are honored; the endpoint discrepancy `/products?id=` (code) vs `/ingredients/{id}` (probe) is documented.
- Semantic matching (`invoice_lines.sku_embedding`) — an unused column, slated for dead-code cleanup (`DEC-0011`, backlog `DEC-02`, `status: open`).

## Sources

- `APP_OVERVIEW.md §7` (the two-context model, variant A, DEC-0012, unit authority), `§8` (learning loop), `§11`.
- `04_DECISIONS__DEC-0011.md`, `04_DECISIONS__DEC-0013.md` (variant A vs C).
- `mvp.be/app/services/invoice_service.py:295` (`_resolve_commit_identities`), `:343` (`_validate_ingredients_on_commit`), `:422` (`_resolve_line`, draft context).
- `mvp.be/app/services/sku_service.py` (`normalize_source_key`).
