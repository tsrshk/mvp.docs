---
id: LCOS-F9
type: feature
title: Line↔catalog matching (draft-resolve)
epic: "[[LCOS-E2-invoice-intake]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoice_lines]]", "[[ingredients]]", "[[packings]]", "[[sku_mapping]]", "[[ingredient_cache]]"]
requirements: ["[[sku-identity-resolver]]", "[[provider-abstraction]]", "[[fail-closed]]"]
adrs: ["[[ADR-009]]", "[[ADR-011]]", "[[DEC-0011]]", "[[DEC-0013]]"]
legacy_refs: ["08 F1.1", "08 F1.2", plan F1]
sources: ["APP_OVERVIEW.md §6", "APP_OVERVIEW.md §7", "mvp.be app/services/invoice_service.py:130", "mvp.be app/services/invoice_service.py:422", "mvp.be app/services/match_service.py", "mvp.be app/api/v1/routes/invoices.py:48", "mvp.be app/api/v1/routes/invoices.py:62"]
updated: 2026-07-09
---
# LCOS-F9 · Line↔catalog matching (draft-resolve)
**Epic:** [[LCOS-E2-invoice-intake]] · **Status:** built · **Phase:** Phase 1

## Description

After [[LCOS-F8-ocr-recognition]] produces an `InvoiceDraft` of raw lines, each line has to be tied to a real position in the tenant's local catalog so a POS payload can be built. F9 is the **draft-context** side of that job: the tolerant, suggestion-friendly resolution that happens inside `InvoiceService.prepare()` and the AI escalation behind `POST /invoices/suggest-matches`. It answers "which catalog SKU is this line?" — not the durable-identity question, which is deliberately kept separate on the commit path ([[LCOS-F13-sku-identity-resolver]], DEC-0011).

`prepare()` iterates lines through `_resolve_line`: it looks the line's `sku` up in the local catalog (by Esupl `external_id`, then by ingredient UUID), and on a hit copies the numeric Esupl foreign keys needed for the payload — `esupl_item_id`, `esupl_unit_id`, a default packing (`esupl_packing_id`, name, factor) and `tax_rate` from the catalog default. A line is "POS-ready" only when every required field is resolved; otherwise a per-line `resolution_note` and a warning are attached and the line blocks payload readiness. Crucially, `prepare()` does **not** persist anything and does **not** touch the durable `pos_ingredient_id` — all fuzzy / LLM / exact-cache hints live only here (APP_OVERVIEW §6, §7).

Matching help comes in three tiers, cheapest first: client-side fuzzy match against the catalog, then AI escalation via `POST /invoices/suggest-matches` (server-side LLM over the org's local catalog — the model may only return SKUs that exist in the catalog, never invent them), and separately the learning-loop auto-fill of previously confirmed mappings ([[LCOS-F14-learning-loop]]). The human confirms the final line→SKU choice before send.

## Capabilities

- `prepare()` resolves each draft line against the local catalog and stamps payload foreign keys: `esupl_item_id`, `esupl_unit_id`, default `packing` (`esupl_packing_id` / name / factor), and `tax_rate` (from `Ingredient.default_tax_rate` when OCR left it empty).
- Catalog lookup is dual-keyed: by Esupl `external_id` first, then by ingredient UUID (`by_external` / `by_uuid` maps built once per `prepare`).
- Per-line readiness: a line is ready only when `esupl_item_id`, `esupl_unit_id`, packing, `quantity`, `unit_price` and `tax_rate` are all present; missing fields produce a human-readable `resolution_note` ("missing for POS: …") and a warning, and hold back `all_lines_ready`.
- Default-packing selection: the packing flagged `is_default`, else the first packing on the ingredient.
- `POST /invoices/suggest-matches` — server-side LLM returns up to 3 scored candidates (0..1) per line, drawn strictly from the tenant's local catalog; candidates whose SKU is not in the catalog are dropped, unparseable model output degrades to empty candidates.
- Empty catalog degrades softly to empty suggestions rather than erroring.
- `POST /invoices/prepare` exposes the resolved preview (payload + warnings) to the client without persisting.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Match lines to catalog within their subdivision; accept/override AI or fuzzy suggestions before send. |
| [[admin]] | Same as member within their subdivision; maintains the local catalog that matching resolves against. |
| [[superadmin]] | All tenants; plus controls the AI provider used by `suggest-matches`. |
| [[sqladmin-operator]] | Not in the flow; toggles `ai_provider` in the SQLAdmin plane ([[LCOS-F3-sqladmin-operator]]). |

Both endpoints are tenant-scoped: `organization_id` / `subdivision_id` come from the active JWT context (see [[auth]], [[multitenancy]]).

## Involved entities

- [[ingredients]] — the local catalog matched against; supplies `esupl_item_id`, `esupl_unit_id`, `default_tax_rate` and its [[packings]].
- [[packings]] — default packing supplies `esupl_packing_id`, name and factor for the payload line.
- [[invoice_lines]] — the draft line (`InvoiceLineDraft`) carries `sku`, resolved FKs, `resolution_note`; persisted later at submit.
- [[sku_mapping]] — read (not written) by the learning-loop auto-fill that seeds line matches; the durable moat itself is [[LCOS-F14-learning-loop]].
- [[ingredient_cache]] — non-authoritative draft-only cache; may hint matches in draft context but is barred from the commit path (VER-022 closed).

## Dependencies / links

- **Requirements:** [[sku-identity-resolver]] (two-context split: draft-resolve here is tolerant; durable identity is commit-only), [[provider-abstraction]] (AI behind a seam, one implementation — [[ADR-009]]), [[fail-closed]] (server-side LLM only; no keys in the browser).
- **Features:** consumes the draft from [[LCOS-F8-ocr-recognition]]; feeds the payload/status machine in [[LCOS-F10-invoice-status-machine]]; the durable-identity counterpart is [[LCOS-F13-sku-identity-resolver]]; auto-fill of confirmed matches is [[LCOS-F14-learning-loop]]; catalog/packings are [[LCOS-F15-sku-catalog]].
- **ADR / decisions:** [[DEC-0011]] and [[DEC-0013]] (two-context model; suggestions never auto-commit identity), [[ADR-011]] (cache is non-authoritative, no-cache reads on commit), [[ADR-009]] (single AI implementation).

## Acceptance criteria (AC)

### Backend
- [ ] AC-BE-1. `prepare()` resolves each line via `_resolve_line`, looking up the catalog by `external_id` then ingredient UUID, and stamps `esupl_item_id`, `esupl_unit_id`, packing FKs and `tax_rate` on a hit.
- [ ] AC-BE-2. A line is reported ready only when all of `esupl_item_id`, `esupl_unit_id`, packing, `quantity`, `unit_price`, `tax_rate` are present; otherwise `resolution_note` and a warning are set and readiness is withheld.
- [ ] AC-BE-3. `prepare()` persists nothing and never sets `pos_ingredient_id` (draft context only; durable identity is resolved on the commit path).
- [ ] AC-BE-4. Default packing = the `is_default` packing, else the first packing; `packing_factor` and `packing_name` are copied onto the line.
- [ ] AC-BE-5. `POST /invoices/suggest-matches` returns ≤3 scored candidates per line, all present in the tenant's local catalog; SKUs absent from the catalog are dropped.
- [ ] AC-BE-6. Empty catalog → empty candidates (no error); unparseable LLM output → empty candidates with a warning log.
- [ ] AC-BE-7. `suggest-matches` runs server-side (no LLM credentials in the client) and is tenant-scoped to the caller's org/subdivision catalog.

### Frontend
- [ ] AC-FE-1. Each recognized line shows a catalog-match control with client-side fuzzy suggestions.
- [ ] AC-FE-2. "Suggest with AI" calls `POST /invoices/suggest-matches` and renders scored candidates the user can accept per line.
- [ ] AC-FE-3. Unresolved lines are visually flagged from `resolution_note` / warnings; the user can override any suggested match before send.
- [ ] AC-FE-4. Previously confirmed matches for the same supplier are auto-filled (learning-loop apply, [[LCOS-F14-learning-loop]]); the user can still change them.

## Open questions / gates

- Durable identity is intentionally out of scope here and resolved fail-closed on commit — see [[LCOS-F13-sku-identity-resolver]] and gate `VER-021` in [[LCOS-E5-stabilization]].
- `ingredient_cache` may seed draft suggestions but must never leak onto the commit path (VER-022 closed; enforced by [[LCOS-F10-invoice-status-machine]]).

## Sources

- `APP_OVERVIEW.md §6` (prepare = tolerant draft-resolve; hints live only here), `§7` (two-context model, draft vs commit).
- `mvp.be/app/services/invoice_service.py:130` (`prepare`), `:422` (`_resolve_line` catalog + FK + packing + tax_rate), `:151-175` (per-line readiness → `EsuplLineItem`).
- `mvp.be/app/services/match_service.py` (`suggest`, prompt build, candidate parse — catalog-only, ≤3, soft-degrade).
- `mvp.be/app/api/v1/routes/invoices.py:48` (`POST /prepare`), `:62` (`POST /suggest-matches`).
