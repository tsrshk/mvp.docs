---
id: LCOS-F26
type: feature
title: Multi-page silent-loss interim fix (DEC-07)
epic: "[[LCOS-E5-stabilization]]"
status: planned
phase: "Phase 1"
roles: [member, admin]
entities: ["[[invoices]]", "[[invoice_lines]]"]
requirements: ["[[global-requirements]]", "[[provider-abstraction]]"]
adrs: []
legacy_refs: [plan S1-F3, backlog DEC-07, Conformance D-g]
sources: ["plan/PHASE_S1_STABILIZATION.md §S1-F3 §AC-8", "LCOS_Conformance_Alignment_GlobalRequirements.md D-g", "APP_OVERVIEW.md §6", "mvp.fe src/entities/invoice/model/sessionSlice.ts:22", "mvp.fe src/shared/ocr/providers/backend.ts:43"]
updated: 2026-07-09
---
# LCOS-F26 · Multi-page silent-loss interim fix (DEC-07)

**Epic:** [[LCOS-E5-stabilization]] · **Status:** planned · **Phase:** Phase 1

## Description

The frontend lets a user attach up to `MAX_INVOICE_PAGES = 3` pages, but the backend OCR path is single-page: `BackendOcrProvider` sends only `pages[0]`, so pages 2–3 are **silently discarded**. Silent data loss on the core wedge is unacceptable, and full multi-page recognition is a larger capability deferred to the OCR-quality epic ([[LCOS-F29-multipage-recognize]] in [[LCOS-E6-ocr-quality]]). This feature is the *interim* fix that removes the silent loss until then.

Per DEC-07 = B, the fix is deliberately small and frontend-only: either cap `MAX_INVOICE_PAGES` at `1`, **or** keep multi-attach but show an explicit UI warning ("only the first page is recognized") whenever more than one file is attached. Either way, the user is never left believing a second page was processed when it was not. No backend change is made here; the durable multi-page pipeline is out of scope.

## Capabilities

- No silent page loss: attaching more than one page either is prevented (limit 1) or triggers a clear, visible warning that only the first page is recognized.
- The interim behaviour is scoped to the FE upload/prepare surface (`prepare-step` / `invoice-workbench`); the backend `/invoices/recognize` contract is unchanged.
- Documented handoff: the limitation and the eventual fix are cross-linked to the durable multi-page feature so the interim state is intentional, not forgotten.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | On attaching more than one page, is prevented or clearly warned that only the first page is recognized; never silently loses page 2+. |
| [[admin]] | Same as member within their subdivision. |
| [[superadmin]] | Same; no additional multi-page capability at this stage. |

Tenant scope is unchanged (from the active JWT); this feature does not alter access rules.

## Involved entities

- [[invoices]] — the recognized draft still yields a single-page invoice; no second-page lines are fabricated or lost without notice.
- [[invoice_lines]] — only lines from the first recognized page are produced; the user is aware of that.

## Dependencies / links

- **Requirements:** [[global-requirements]] (`R9`: no silent data loss / behaviour matching the UI), [[provider-abstraction]] (the FE OCR provider seam `backend`/`mock` is where the single-page send lives).
- **Features:** interim fix for the OCR entry point [[LCOS-F8-ocr-recognition]]; superseded by the durable [[LCOS-F29-multipage-recognize]] in [[LCOS-E6-ocr-quality]].
- **Decisions:** DEC-07 = B (interim, FE-only) now, with (A) full multi-page as a later feature task.

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. No backend change: `/invoices/recognize` remains single-page; this feature does not modify the OCR provider or service contract.

### Frontend
- [ ] AC-FE-1. Attaching more than one page either is disallowed (`MAX_INVOICE_PAGES=1`) or shows an explicit warning ("only the first page is recognized") — there is no path where page 2+ is dropped without user-visible notice.
- [ ] AC-FE-2. If the warning approach is chosen, `MAX_INVOICE_PAGES` and the `pages[0]` send in `shared/ocr/providers/backend.ts` are made consistent with the warning (the user is told exactly what is processed).
- [ ] AC-FE-3. `npm run build` green; the existing single-page happy path is unchanged.

### Other
- [ ] AC-OTHER-1. The limitation is documented and cross-linked to [[LCOS-F29-multipage-recognize]] so the interim state is explicit.

## Open questions / gates

- **Limit-1 vs warning:** owner choice; the plan accepts either as long as the silent loss is gone (`AC-8`).
- **Durable multi-page** (backend recognition of all pages) is explicitly out of scope here and lives in [[LCOS-F29-multipage-recognize]] (epic [[LCOS-E6-ocr-quality]]).

## Sources

- `plan/PHASE_S1_STABILIZATION.md §2 S1-F3` (DEC-07 = B interim), `§5 AC-8`.
- `LCOS_Conformance_Alignment_GlobalRequirements.md §2.2 D-g` (FE `MAX_INVOICE_PAGES=3` but backend sends `pages[0]`; pages 2–3 silently lost; recommendation B now, A later).
- `APP_OVERVIEW.md §6` (single-page recognition; multi-page is a known gap).
- Current state: `mvp.fe/src/entities/invoice/model/sessionSlice.ts:22` (`MAX_INVOICE_PAGES = 3`), `:122` (slice cap); `mvp.fe/src/shared/ocr/providers/backend.ts:43` (`const page = pages[0]`).
