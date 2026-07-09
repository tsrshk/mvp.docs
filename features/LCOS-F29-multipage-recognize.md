---
id: LCOS-F29
type: feature
title: Multi-page recognize (photo pages → one InvoiceDraft)
epic: "[[LCOS-E6-ocr-quality]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]", "[[invoice_lines]]", "[[system_settings]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[vpn-egress]]"]
adrs: ["[[ADR-006]]", "[[ADR-009]]", "[[ADR-012]]"]
legacy_refs: [plan S2 (S2-B1, S2-B3, S2-F1), "DEC-07 variant A"]
sources: ["plan/PHASE_S2_OCR_CAPTURE.md §1 (S2-B1/B3), §2 (S2-F1), §4 AC-1", "mvp.be app/providers/ocr/base.py", "mvp.be app/api/v1/routes/invoices.py:33", "mvp.be app/services/invoice_service.py:121", "mvp.fe src/shared/ocr/providers/backend.ts:42", "mvp.fe src/entities/invoice/model/sessionSlice.ts:22"]
updated: 2026-07-09
---
# LCOS-F29 · Multi-page recognize (photo pages → one InvoiceDraft)
**Epic:** [[LCOS-E6-ocr-quality]] · **Status:** planned · **Phase:** Phase 1

## Description

Real waybills routinely run to two or three pages. Today the recognize path processes exactly one page: the backend `POST /invoices/recognize` accepts a single `file`, and the frontend `BackendOcrProvider` sends only `pages[0]` — extra held pages are silently dropped (see [[LCOS-F8-ocr-recognition]]). The interim safeguard that at least warns the user about lost pages lives in [[LCOS-F26-multipage-fix]] (epic [[LCOS-E5-stabilization]]); this feature is the full fix.

The goal is that a multi-page invoice is recognized as **one** `InvoiceDraft`: all product lines from every page are merged in page order, and the totals come from the last page. DEC-07 variant A was chosen: extend the recognize contract to accept up to 3 pages and send them to the vision model in a **single multimodal request**, rather than making N independent calls and stitching results (which would double-count total rows and lose cross-page context).

The endpoint keeps its existing invariants — it neither writes to the ERP nor persists anything; egress to the LLM still runs through the VPN sidecar when the runtime toggle is on ([[vpn-egress]], [[fail-closed]]). This is a one-time, deliberate change to the `OcrProvider` seam signature ([[provider-abstraction]], [[ADR-009]]).

## Capabilities

- `POST /invoices/recognize` accepts **up to 3 files** (multipart repeated `file`, or a `files[]` field) instead of a single image; each part is MIME-validated against `_ALLOWED_MIME` (`image/jpeg|png|webp`).
- The `OcrProvider.extract_invoice` seam is widened to take an ordered list of pages: `extract_invoice(pages: list[OcrImage], ...) -> InvoiceDraft`.
- The Claude provider sends all pages, in order, in one multimodal request and returns a single `InvoiceDraft` — lines concatenated across pages with contiguous `line_no`, header/total taken from the last page.
- Request-size guardrails: pages are already client-normalized to ≤1568px long edge; a request that still exceeds the cap is rejected with `413` in the error envelope.
- Optional `pages_processed` count in the response so the frontend can confirm "recognized N pages" (S2-B3).
- Frontend sends **all** held pages (up to `MAX_INVOICE_PAGES = 3`), removing the single-page limitation and the S1 lost-pages warning.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Attach up to 3 pages of one invoice and receive a single merged draft within their subdivision. |
| [[admin]] | Same as member, within their subdivision. |
| [[superadmin]] | Same across all tenants; may also edit the OCR prompt / `ai_provider` via config API. |
| [[sqladmin-operator]] | Not in the flow; switches `ai_provider` / OCR prompt in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

The endpoint is tenant-scoped: `organization_id` / `subdivision_id` come from the active JWT context ([[auth]], [[multitenancy]]).

## Involved entities

- [[invoices]] — the flow target; still **not** created on `/recognize`, but `ocr_provider`/`ocr_raw` provenance persists later on submit.
- [[invoice_lines]] — draft lines (`InvoiceLineDraft`) now aggregated across pages into one line set.
- [[system_settings]] — `ai_provider` (runtime OCR implementation choice) and the DB-stored OCR prompt.

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (single deliberate change to the `OcrProvider` Protocol), [[fail-closed]] + [[vpn-egress]] (LLM egress via VPN sidecar when `ai_vpn_enabled`; VPN down → refuse, no direct egress), [[invoice-status-machine]] (draft feeds `prepare`/`submit`).
- **Features:** upstream [[LCOS-F8-ocr-recognition]] (single-page recognize this extends), interim safeguard [[LCOS-F26-multipage-fix]] (superseded once this ships), downstream [[LCOS-F9-line-matching]] (matches the merged lines). Sibling capture-quality features: [[LCOS-F30-recognition-context]], [[LCOS-F31-auto-crop]], [[LCOS-F32-camera-capture]], [[LCOS-F33-confidence-gate]].
- **ADR:** [[ADR-009]] (provider seam, one implementation), [[ADR-006]] (fail-closed egress), [[ADR-012]] (provider live-paths backend-only).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `POST /invoices/recognize` accepts up to 3 image parts (repeated `file` or `files[]`); a 2- and a 3-page invoice each recognize into ONE `InvoiceDraft` whose `lines` contain rows from all pages.
- [ ] AC-BE-2. Each part is MIME-validated against `{image/jpeg,image/png,image/webp}` → offending part yields `415`; an empty part → `400`; more than 3 parts → rejected with a clear error.
- [ ] AC-BE-3. `OcrProvider.extract_invoice` signature is changed once to accept an ordered `list[OcrImage]`; the Claude provider issues a single multimodal request with pages in order; total/header taken from the last page (unit test with a respx/mock provider and 2 fabricated pages).
- [ ] AC-BE-4. The endpoint still neither persists (`invoices`/`invoice_lines`) nor writes to the ERP; `ocr_provider` provenance is still stamped on the draft.
- [ ] AC-BE-5. Oversized combined request (beyond the size cap) → `413` in the error envelope, not a 500/timeout.
- [ ] AC-BE-6. Fail-closed egress preserved: with `ai_vpn_enabled=ON` and VPN unreachable, the multi-page call is refused with a clear error and no direct egress (non-negotiable, merge-gated test).
- [ ] AC-BE-7. (Optional S2-B3) Response carries `pages_processed = N`.

### Frontend
- [ ] AC-FE-1. `BackendOcrProvider.extractInvoice` sends ALL held pages (up to `MAX_INVOICE_PAGES = 3`), not `pages[0]`; the multipart body carries one `file` part per page in capture order.
- [ ] AC-FE-2. The S1 "extra pages ignored" warning is removed; the returned merged draft shows lines from every page in the workbench.
- [ ] AC-FE-3. If the backend returns `pages_processed`, the UI confirms "recognized N pages"; a mismatch with the number sent surfaces a non-blocking notice.
- [ ] AC-FE-4. `415`/`400`/`413`/recognition failure render a clear message without crashing the form; the abort signal cancels an in-flight multi-page request on navigation.

### Other (data/QA)
- [ ] AC-OTHER-1. Manual check on a real multi-page waybill: no page's lines are lost; DoD G10 (pytest + ruff + build green, tenant/fail-closed tests intact, architecture doc bumped for the `OcrProvider` signature change).

## Open questions / gates

- **Seam change is deliberate and one-time** — widening `extract_invoice` to a page list must not fork the Protocol; the mock/demo provider must implement the new signature too.
- **Line ordering across pages** — `line_no` must stay contiguous and page-ordered so downstream matching ([[LCOS-F9-line-matching]]) is stable.
- **Total-row de-dup** — only the last page's totals count; per-page "Итого" rows must be dropped (shared with [[LCOS-F33-confidence-gate]] / `totalRow` rule).
- Supersedes the interim [[LCOS-F26-multipage-fix]] safeguard once merged.

## Sources

- `plan/PHASE_S2_OCR_CAPTURE.md` §1 S2-B1 (multipart up to 3, seam change, single multimodal request, 413), S2-B3 (`pages_processed`), §2 S2-F1 (send all pages, drop S1 warning), §4 AC-1.
- `mvp.be/app/api/v1/routes/invoices.py:33` (`recognize_invoice`, `_ALLOWED_MIME`), `app/services/invoice_service.py:121` (`recognize`).
- `mvp.be/app/providers/ocr/base.py` (`OcrProvider` Protocol, `extract_invoice`).
- `mvp.fe/src/shared/ocr/providers/backend.ts:42` (`pages[0]` single-page limit), `src/shared/ocr/types.ts` (`OcrPage`), `src/entities/invoice/model/sessionSlice.ts:22` (`MAX_INVOICE_PAGES = 3`).
