---
id: LCOS-F22
type: feature
title: SKU-identity stabilization (DEC-0011/0013/0012)
epic: "[[LCOS-E5-stabilization]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[sku_mapping]]", "[[ingredient_cache]]", "[[invoice_lines]]", "[[ingredients]]", "[[packings]]"]
requirements: ["[[sku-identity-resolver]]", "[[fail-closed]]", "[[erp-esupl-integration]]"]
adrs: ["[[DEC-0011]]", "[[DEC-0013]]", "[[ADR-018]]", "[[ADR-019]]", "[[ADR-020]]"]
legacy_refs: [08 F1.1, 08 F1.2, DEC-0012, TZ__STABILIZATION S6/S8/S9]
sources: ["TZ__STABILIZATION_2026-07-09__ALIGNED.md", "APP_OVERVIEW.md §7 §8 §13", "mvp.be app/services/invoice_service.py:295", "mvp.be alembic/versions/0008_*, 0009_sku_mapping_packing", "mvp.be pyproject.toml:65"]
updated: 2026-07-09
---
# LCOS-F22 · SKU-identity stabilization (DEC-0011/0013/0012)

**Epic:** [[LCOS-E5-stabilization]] · **Status:** built · **Phase:** Phase 1

## Description

This feature ratifies and hardens the two-context SKU identity model that the whole invoice wedge depends on. It is the point at which the moat design (`[[LCOS-F13-sku-identity-resolver]]`, `[[LCOS-F14-learning-loop]]`) stopped being aspirational and was made verifiable, adversarially reviewed, and merge-gated. It closes out the alignment tasks S5–S9 of the aligned stabilization TZ against the real code and the ratified decisions `[[DEC-0011]]`/`[[DEC-0013]]`.

The **confirmed data flow is SSOT and must not change without a new DEC** (`TZ__STABILIZATION_2026-07-09__ALIGNED.md`):
- **Draft (`prepare()`, tolerant):** the Esupl payload is built from the *local* catalog — `esupl_item_id` (int) and `esupl_unit_id` (POS mirror), plus packing. Fuzzy / AI / exact-cache hints live **only here**. `pos_ingredient_id` is never touched.
- **Commit (`submit()` → `_resolve_commit_identities`, fail-closed):** `pos_ingredient_id` is resolved **only** from `[[sku_mapping]]` (`method='manual'` OR `confirmed_by` set), priority subdivision → org. It is then live-validated against POS (`GET /teams/{id}/products?id=`); no exact match → `None`, fail-closed, never `items[0]`. Unit: POS is authoritative, OCR is a tolerant cross-check (block only when both are present and differ). Cache/fuzzy/AI do **not** participate at commit.

The decisive stabilization outcome was to **reject variant C** (auto-creating `sku_mapping` rows with `cache_exact` / `confirmed_by='system'` on an exact cache hit) and uphold **variant A**: a mapping becomes commit-eligible only through an explicit human action. Variant C would have reverted correct code and broken the green `merge_gate` tests, so it was vetoed (`[[ADR-018]]`). The learning-loop was also fully migrated out of browser `localStorage` into the backend `[[sku_mapping]]` table using the DEC-0012 composite key plus packing (migrations `0008`/`0009`), with persist happening *before* send so a confirmed mapping survives an invoice reject (`[[ADR-020]]`).

## Capabilities

- Durable commit-time identity: line → `pos_ingredient_id` resolved solely from `[[sku_mapping]]`, subdivision-first then org, with POS live-validation and fail-closed `None` on no exact match.
- Draft/commit separation enforced in code: tolerant hints (fuzzy/AI/exact-cache) confined to `prepare()`; commit reads only human-confirmed mappings.
- Learning-loop persisted server-side under the DEC-0012 composite key (`scope`, `supplier_external_id`, `source_key`) + packing; `localStorage` module deleted.
- Persist-then-commit ordering: the confirmed mapping is written in its own transaction on send, before the submit mutation, so it survives a fail-closed reject of the first invoice.
- Unit authority (D2): payload takes the POS unit; the comparator is empty-tolerant and normalized; a mismatch blocks only when both OCR and POS units are present and differ.
- Merge-gated invariants: `pytest -m merge_gate` covers durable-id and DEC-0013 commit-gate behaviour (durable `pos_ingredient_id`, never a surrogate).
- Dead-column recognition: `invoice_lines.sku_embedding` is confirmed unused and flagged for removal (see `[[LCOS-F25-deadcode-cleanup]]`).

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Confirm a line↔SKU mapping while editing an invoice in their subdivision; the confirmation is persisted as a `method='manual'` mapping and becomes commit-eligible. |
| [[admin]] | Same as member within their subdivision. |
| [[superadmin]] | Same across all tenants; can inspect/repair mappings via the operator plane. |
| [[sqladmin-operator]] | Does not participate in the flow; may inspect `[[sku_mapping]]` rows in SQLAdmin. |

Every read/write is tenant-scoped: `organization_id` / `subdivision_id` come from the active JWT context (see [[auth]], [[multitenancy]]).

## Involved entities

- [[sku_mapping]] — the moat and the *only* commit-time source of `pos_ingredient_id`. Composite key `(scope, supplier_external_id, source_key)` + `packing`; carries `method`, `confidence`, `confirmed_by`.
- [[ingredient_cache]] — non-authoritative, scope-aware draft cache; participates in `prepare()` hints only, never at commit (VER-022, closed by `[[DEC-0013]]`).
- [[invoice_lines]] — each saved line holds the durable `pos_ingredient_id`; the unused `sku_embedding` column is flagged dead.
- [[ingredients]] + [[packings]] — the local catalog mirror from which the draft payload (`esupl_item_id`, `esupl_unit_id`, packing) is built.

## Dependencies / links

- **Requirements:** [[sku-identity-resolver]] (the two-context resolver contract this stabilizes), [[fail-closed]] (commit resolves to `None` rather than guessing; no `items[0]`), [[erp-esupl-integration]] (POS is authoritative at commit; read-only).
- **Features:** implements the resolver in [[LCOS-F13-sku-identity-resolver]] and the moat in [[LCOS-F14-learning-loop]]; commit is invoked by [[LCOS-F10-invoice-status-machine]]; draft hints consume [[LCOS-F16-ingredient-cache]] and [[LCOS-F15-sku-catalog]]. The read validation path is [[LCOS-F11-esupl-read]].
- **Decisions:** [[DEC-0011]] (two-context identity, T2/T5), [[DEC-0013]] (variant A upheld; VER-022 closed), [[ADR-018]] (variant C vetoed), [[ADR-019]]/[[ADR-020]] (composite-key moat + persist-then-commit).

## Acceptance Criteria (AC)

### Backend
- [x] AC-BE-1. `submit()` resolves `pos_ingredient_id` **only** via `_resolve_commit_identities` reading `[[sku_mapping]]` where `method='manual'` OR `confirmed_by` is set, priority subdivision → org.
- [x] AC-BE-2. Commit live-validates against `GET /teams/{id}/products?id=`; no exact match → `pos_ingredient_id=None` (fail-closed), never `items[0]`.
- [x] AC-BE-3. No cache/fuzzy/AI is consulted at commit; those hints exist only in `prepare()`. Draft never mutates `pos_ingredient_id`.
- [x] AC-BE-4. Unit authority (D2): payload uses the POS unit; comparator is empty-tolerant/normalized; block only when both OCR and POS units are present and differ. Covered by `test_esupl_commit_validation_flags_real_unit_mismatch`, `test_esupl_commit_validation_tolerates_missing_ocr_unit`, and the added `test_unit_present_equal_passes`.
- [x] AC-BE-5. Learning-loop persisted server-side under the DEC-0012 composite key + packing (migrations `0008`/`0009`, downgrade works); no `cache_exact` / `confirmed_by='system'` auto-create exists (variant C absent).
- [x] AC-BE-6. Persist-then-commit: the confirmed mapping is written in a separate transaction before the send mutation and survives an invoice reject (`[[ADR-020]]`).
- [x] AC-BE-7. `pytest -m merge_gate` is green and covers durable-id + DEC-0013 commit-gate; `TrackerErpProvider` asserts a durable `pos_ingredient_id`, not a surrogate.

### Frontend
- [x] AC-FE-1. On send, confirmed line mappings are persisted to the backend (`POST /ingredients/mappings`, `method='manual'`, `confirmed_by=` authenticated user) in the `onSend` handler, before `sendInvoice`.
- [x] AC-FE-2. On a later invoice for the same supplier, the FE fetches `GET /ingredients/mappings?supplier_external_id=` and auto-fills lines by `normalizeSourceKey(rawName)`.
- [x] AC-FE-3. FE `source_key` normalization mirrors the backend `normalize_source_key` (verified by a golden-vector parity test).
- [x] AC-FE-4. The `localStorage` learning-loop module is deleted; no browser-persisted mappings remain.

### Other (verification)
- [x] AC-OTHER-1. Verified 2026-07-09 on real Postgres+pgvector: BE 209 / merge_gate 17 / FE 43 green (`APP_OVERVIEW.md §12/§13`).
- [x] AC-OTHER-2. Adversarial review (22 findings) resolved, including the critical bootstrap persist-order bug.

## Open questions / gates

- **VER-021 durability (OPEN, owner-run):** whether `pos_ingredient_id` is stable under edit / delete-recreate is *not* empirically confirmed; the probe requires writes to the sandbox and cannot close in a read-only session. Merge stays gated. See [[VER-021_ESUPL_DURABILITY_TEST]] and [[LCOS-F28-esupl-contracts]].
- **`sku_embedding` drop (backlog DEC-02, open):** the unused column is flagged; removal lands in [[LCOS-F25-deadcode-cleanup]].
- **S6 factory `save()` (P1):** `IngredientSKUFactory.save()` is orphaned; either wire it into an explicit "create mapping from picker" (`method='manual'`) flow or delete it — see [[LCOS-F25-deadcode-cleanup]]. Must **not** implement `cache_exact`/`confirmed_by='system'` auto-create (that is the vetoed variant C).

## Sources

- `TZ__STABILIZATION_2026-07-09__ALIGNED.md` — confirmed data flow (SSOT), tasks S5/S6/S8/S9, "Removed vs original TZ" table (variant C vetoed).
- `APP_OVERVIEW.md §7` (two-context identity), `§8` (learning loop, persist-then-commit), `§11` (`sku_mapping`, `sku_embedding` dead column), `§12/§13` (test counts, done/open).
- `mvp.be/app/services/invoice_service.py:295-336` (`_resolve_commit_identities`), `:141-143, :218-226` (per-org team/token resolve pattern).
- `mvp.be/alembic/versions/0008_*`, `0009_sku_mapping_packing` (composite key + packing migration).
- `mvp.be/pyproject.toml:65-67` (`merge_gate` marker); `tests/features/invoice/recognition/test_merge_gate_durable_id.py`, `test_dec0013_commit_gate.py`, `test_persist_survives_reject.py`.
