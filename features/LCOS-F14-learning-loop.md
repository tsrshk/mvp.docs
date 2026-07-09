---
id: LCOS-F14
type: feature
title: Learning-loop mapping moat
epic: "[[LCOS-E3-sku-identity]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[sku_mapping]]", "[[invoice_lines]]", "[[suppliers]]", "[[subdivisions]]", "[[organizations]]"]
requirements: ["[[sku-identity-resolver]]", "[[fail-closed]]", "[[invoice-status-machine]]", "[[multitenancy]]"]
adrs: ["[[ADR-020]]", "[[ADR-018]]", "[[ADR-019]]"]
legacy_refs: [DEC-0011, DEC-0013, DEC-0012, "08 F1.1", "08 F1.2"]
sources: ["APP_OVERVIEW.md §8", "adr/ADR-020.md", "mvp.be app/api/v1/routes/ingredients.py:100", "mvp.be app/api/v1/routes/ingredients.py:168", "mvp.fe src/entities/invoice/lib/backendMappings.ts", "mvp.fe src/widgets/invoice-workbench/ui/InvoiceWorkbench.tsx:213"]
updated: 2026-07-09
---
# LCOS-F14 · Learning-loop mapping moat

**Epic:** [[LCOS-E3-sku-identity]] · **Status:** built · **Phase:** Phase 1

## Description

The learning loop is the runtime mechanism by which the moat (`sku_mapping`) actually **grows**. Where [[LCOS-F13-sku-identity-resolver]] only *reads* confirmed mappings on the fail-closed commit path, this feature is the *write* channel: every human-confirmed line→SKU identity is persisted so the next invoice from the same supplier resolves that line automatically. This is the defensible asset a competitor without the tenant's history cannot copy — not the OCR, but the accumulated, tenant-scoped, confirmed identity (see [[LCOS-E3-sku-identity]]).

The channel is deliberately **one and only one** (`[[ADR-020]]`): the frontend calls `POST /ingredients/mappings` in the `onSend` handler of `widgets/invoice-workbench` (via `entities/invoice/lib/backendMappings.persistLineMapping`) **before** the `sendInvoice` mutation. Sending an invoice with SKUs picked *is* the human confirmation, so the row is written with `method='manual'` and `confirmed_by` = the authenticated user, which makes it commit-eligible under `[[DEC-0013]]` variant A (`[[ADR-018]]`). The `submit` endpoint itself never writes `sku_mapping` — it only reads it on the commit-resolve; persist is a separate request in a separate transaction.

**Persist-then-commit** (`[[ADR-020]]`): because the commit resolver is fail-closed and resolves identity *only* from `sku_mapping`, the mapping must exist *before* `submit` runs. If persist ran only after a throwing send, the fail-closed reject of the very first invoice would block moat bootstrap forever. Persisting first, in its own transaction, is what lets a confirmed mapping **survive an invoice reject** by design.

**Apply:** on the next invoice from that supplier the FE fetches `GET /ingredients/mappings?supplier_external_id=` and auto-fills lines by `normalizeSourceKey(rawName)`, whose FE implementation mirrors the backend `normalize_source_key` SSOT (golden-vector parity test). The loop used to live in `localStorage`; it was migrated wholesale to the backend and the `localStorage` module was deleted.

## Capabilities

- Persist a confirmed line→SKU identity to `sku_mapping` via `POST /ingredients/mappings` — upsert on the composite key `(scope_type=subdivision, scope_id, supplier_external_id, normalized source_key)`.
- Server stamps `confirmed_by = ctx.user_id` and `confirmed_at = now()`; these are **never** accepted from the request body — otherwise the `[[DEC-0013]]` commit gate could be forged.
- Writes `method='manual'`, `confidence`, and learned `packing` (restored into the line on later auto-fill; multiplies into the quantity actually posted to POS).
- `source_key` is the **raw OCR line text**; the backend owns normalization, so the FE sends raw text and never a pre-normalized key (removes the dual-SSOT with the fuzzy matcher's `canonicalText`).
- `supplier_external_id` is part of the key (`[[ADR-019]]`, DEC-0012): the same line text from two suppliers maps to different POS SKUs without collision; `''` = supplier-agnostic/legacy.
- Apply/read: `GET /ingredients/mappings` returns only **commit-eligible** rows (`method=manual` OR `confirmed_by IS NOT NULL`) for a supplier, de-duplicated `subdivision → org` per `source_key` — exactly the identities that pass the commit gate.
- FE auto-fill: `loadSupplierMappings` builds a lookup keyed by the backend-normalized `source_key`; reducers apply it by `normalizeSourceKey(line.rawName)`.
- Persist is **best-effort**: a failed persist must not fail an already-succeeded send — the line simply re-persists on the next send, and an unconfirmed line correctly blocks at the next commit (fail-closed).

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Confirms a line→SKU identity by sending an invoice; the mapping is written under their tenant scope (subdivision). This is the human confirmation that grows the moat. |
| [[admin]] | Same, within their subdivision. |
| [[superadmin]] | Cross-tenant access. |
| [[sqladmin-operator]] | Not involved — the operator plane does not confirm SKU identities. |

The endpoint is tenant-scoped: `scope_id` is the active subdivision from the JWT context; a request without an active subdivision context is rejected (`400`). See [[auth]], [[multitenancy]].

## Involved entities

- [[sku_mapping]] — the moat itself; this feature is its sole runtime write path. Key `(scope_type, scope_id, supplier_external_id, source_key)`; fields `pos_ingredient_id`, `method`, `confidence`, `confirmed_by`, `confirmed_at`, `packing`.
- [[invoice_lines]] — the source of each confirmed identity (raw `description`/`rawName` → picked durable POS id); the line snapshots `pos_ingredient_id` only later, at commit.
- [[suppliers]] — `supplier_external_id` (durable Esupl id) is part of the mapping key.
- [[subdivisions]], [[organizations]] — the scope written into and read back with `subdivision → org` priority.

## Dependencies / links

- **Requirements:** [[sku-identity-resolver]] (the normative mechanic this feature feeds), [[fail-closed]] (persist-then-commit exists *because* commit is fail-closed), [[invoice-status-machine]] (persist is ordered before `submit`), [[multitenancy]] (mappings are tenant-scoped).
- **Features:** [[LCOS-F13-sku-identity-resolver]] (reads what this writes, on commit), [[LCOS-F15-sku-catalog]] (supplies the durable POS id picked into a line), [[LCOS-F9-line-matching]] (draft-phase suggestions the human confirms), [[LCOS-F10-invoice-status-machine]] (the `onSend`/`submit` sequence), [[LCOS-F17-supplier-cards]] (supplier identity in the key), [[LCOS-F22-sku-stabilization]] (merge-gate that guards this behaviour).
- **ADR:** [[ADR-020]] (single persist channel + persist-then-commit + FE `save()` removed), [[ADR-018]] (variant A — only commit-eligible mappings), [[ADR-019]] (composite key with supplier).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `POST /ingredients/mappings` upserts on `(scope_type='subdivision', scope_id, supplier_external_id, normalize_source_key(source_key))`.
- [ ] AC-BE-2. `source_key` is normalized via `normalize_source_key` (the SSOT) before lookup/insert.
- [ ] AC-BE-3. `confirmed_by = ctx.user_id` and `confirmed_at = now()` are set **server-side** and are not read from the body; combined with `method='manual'` the row is commit-eligible.
- [ ] AC-BE-4. `supplier_external_id` is part of the key (DEC-0012); the same `source_key` under two suppliers yields two distinct rows; `''` denotes supplier-agnostic.
- [ ] AC-BE-5. `packing` and `confidence` are persisted; a missing active subdivision context → `400`.
- [ ] AC-BE-6. `GET /ingredients/mappings?supplier_external_id=` returns only commit-eligible rows (`method=manual` OR `confirmed_by` set), de-duplicated `subdivision → org` per `source_key`.
- [ ] AC-BE-7. The `submit` endpoint does **not** write `sku_mapping` — it only reads it on the commit-resolve; persist is a separate request/transaction (`[[ADR-020]]`).
- [ ] AC-BE-8. Tenant isolation: a request cannot create, update, or list another organization's mappings (scope is required in the query/repository).

### Frontend
- [ ] AC-FE-1. `onSend` persists every SKU-picked line (`persistLineMapping`) and **awaits** it **before** the `sendInvoice` mutation runs (persist-then-commit) — covered by the `InvoiceWorkbench.onSend` test.
- [ ] AC-FE-2. Persist sends the raw line text (`rawName`) as `source_key` — never a FE-normalized key.
- [ ] AC-FE-3. Persist sends the selected supplier's durable id as `supplier_external_id` and the picked SKU's durable POS id as `pos_ingredient_id`.
- [ ] AC-FE-4. On supplier selection / invoice open, `loadSupplierMappings` fetches this supplier's moat and auto-fills lines by `normalizeSourceKey(rawName)`.
- [ ] AC-FE-5. Persist is best-effort: `Promise.allSettled` isolates failures; an otherwise-successful send still completes and surfaces a note about unsaved mappings, without crashing the flow.

### Other
- [ ] AC-OTHER-1. Persist-independence is pinned by tests — T1 (BE: submit → reject → the `sku_mapping` row is present) and T2 (FE: `onSend` awaits `persistLineMapping` before `sendInvoice`), both under `merge_gate`.
- [ ] AC-OTHER-2. The former `localStorage` learning loop is removed (no dual SSOT); the FE `IngredientSKUFactory.save()` no-op was deleted (`[[ADR-020]]`).

## Open questions / gates

- **VER-021** — durability of `pos_ingredient_id` across Esupl edit/delete-recreate is empirically unconfirmed; the probe requires a WRITE to sandbox → owner-run, merge stays gated. See [[LCOS-F13-sku-identity-resolver]].
- FE manual persist currently hardcodes `confidence = 1`; a graded confidence for confirmed suggestions is not modelled yet.
- Mapping revocation / correction UX (re-confirming a wrong identity) relies on upsert overwrite; there is no explicit "unlearn" flow.

## Sources

- `APP_OVERVIEW.md §8` (learning loop: persist / key / apply, persist-then-commit), `§7` (variant A), `§11` (data model).
- `adr/ADR-020.md` (single channel, persist-then-commit, `save()` removed), `adr/ADR-018.md` (variant A), `adr/ADR-019.md` (composite key).
- `mvp.be/app/api/v1/routes/ingredients.py:100` (`create_or_update_mapping`, server-stamped `confirmed_by`), `:168` (`list_mappings`, commit-eligible + subdivision→org dedup).
- `mvp.be/app/services/invoice_service.py:295` (`_resolve_commit_identities` reads mapping only — proof submit does not write it).
- `mvp.be/app/db/models.py:464` (`SkuMapping`), `:502` (`UNIQUE(scope_type,scope_id,supplier_external_id,source_key)`).
- `mvp.fe/src/entities/invoice/lib/backendMappings.ts:10` (`normalizeSourceKey`), `:25` (`loadSupplierMappings`), `:60` (`persistLineMapping`).
- `mvp.fe/src/widgets/invoice-workbench/ui/InvoiceWorkbench.tsx:213` (`onSend`), `:223` (persist awaited before `sendInvoice`).
</content>
</invoke>
