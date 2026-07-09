---
id: LCOS-F30
type: feature
title: Recognition context in the prompt (invoice type + supplier hint)
epic: "[[LCOS-E6-ocr-quality]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]", "[[invoice_lines]]", "[[suppliers]]", "[[system_settings]]"]
requirements: ["[[provider-abstraction]]", "[[vpn-egress]]", "[[fail-closed]]"]
adrs: ["[[ADR-009]]", "[[ADR-006]]", "[[ADR-012]]"]
legacy_refs: [plan S2 (S2-B2), "recognition-feature B4", "DEC-07"]
sources: ["plan/PHASE_S2_OCR_CAPTURE.md §1 (S2-B2), §4 AC-2", "mvp.fe src/shared/ocr/invoiceType.ts", "mvp.fe src/shared/ocr/rules.ts", "mvp.fe src/shared/ocr/provider.ts (OcrRequestContext)", "mvp.be app/providers/ocr/prompt.py", "mvp.be app/services/invoice_service.py:121"]
updated: 2026-07-09
---
# LCOS-F30 · Recognition context in the prompt (invoice type + supplier hint)
**Epic:** [[LCOS-E6-ocr-quality]] · **Status:** planned · **Phase:** Phase 1

## Description

The frontend already knows two things before it uploads a photo — the chosen **invoice type** (`paper | electronic`) and, often, the **supplier name** — but neither reaches the recognition prompt. Paper and electronic waybills differ in where their identity lives: a paper ТТН carries a pre-printed blank (2-letter series + 7-digit number near the barcode), while an electronic document has no blank and identifies itself by its own document number. Feeding the model the wrong expectation is a frequent source of misread header fields (blank serial landing in `invoiceNumber`, or vice versa).

This feature threads that context through to the backend and into the OCR prompt. The type-specific instructions and field formats already exist on the frontend as a single source of truth (`invoiceType.ts` `promptNote`, `rules.ts` field rules), and the request contract already carries `supplierName`/`invoiceType` (`OcrRequestContext`). What is missing is (a) sending them as multipart fields on `/recognize` and (b) the backend prompt builder slotting them in. The supplier name is passed as a soft hint ("expect a header from <name>"), never as a value to fabricate.

The non-negotiable anti-hallucination rule stands: the prompt must instruct "return null / empty if not sure — do not invent". Egress and provider rules are unchanged ([[provider-abstraction]], [[vpn-egress]], [[fail-closed]]).

## Capabilities

- Frontend passes `invoiceType` and `supplierName` from `OcrRequestContext` as multipart fields on `POST /invoices/recognize`.
- Backend prompt builder injects a type-specific fragment:
  - **paper** → look for the printed blank series (2 uppercase letters, may be Cyrillic) + 7-digit blank number near the barcode; keep these out of `invoiceNumber`.
  - **electronic** → no blank; read the document's own number into `invoiceNumber`.
- Supplier name is added as a soft header hint; date-format and default currency (BYN) hints included.
- Response schema stays aligned with `InvoiceDraft`; the mandatory anti-hallucination clause ("null if unsure, never invent") is always present.
- Prompt fragments remain the single source of truth on the frontend (`invoiceType.ts.promptNote`, `rules.ts.prompt`) and mirror the backend prompt stored in `system_settings` (editable without redeploy).

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Picks the document type (and confirms supplier) on the upload step; that context steers recognition of their invoice. |
| [[admin]] | Same as member, within their subdivision. |
| [[superadmin]] | Same across tenants; may edit the base OCR prompt / `ai_provider` via config API. |
| [[sqladmin-operator]] | Not in the flow; edits the OCR prompt / `ai_provider` in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

Tenant-scoped via the active JWT context ([[auth]], [[multitenancy]]).

## Involved entities

- [[system_settings]] — the DB-stored OCR prompt into which the type/supplier fragments are slotted (`resolve_invoice_prompt`), editable without redeploy.
- [[suppliers]] — source of the supplier-name hint (the selected/known supplier for this session).
- [[invoices]] / [[invoice_lines]] — the draft whose header fields (`waybill_series`, `waybill_number`, `number`) this feature makes more accurate; still not persisted on `/recognize`.

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (prompt lives behind the OCR seam; one implementation), [[vpn-egress]] + [[fail-closed]] (unchanged egress rules), [[invoice-status-machine]] (better header → cleaner `prepare`/`submit`).
- **Features:** builds on [[LCOS-F8-ocr-recognition]]; combines with [[LCOS-F29-multipage-recognize]] (context applies to the multi-page request) and feeds [[LCOS-F33-confidence-gate]] (the `rules.ts` formats it validates come from the same SSOT). Siblings [[LCOS-F31-auto-crop]], [[LCOS-F32-camera-capture]].
- **ADR:** [[ADR-009]] (provider seam), [[ADR-006]] (fail-closed egress), [[ADR-012]] (provider live-paths backend-only).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `/invoices/recognize` accepts optional multipart fields `invoice_type` (`paper|electronic`) and `supplier_name`; missing values fall back to the current generic prompt.
- [ ] AC-BE-2. The prompt builder injects the type-specific fragment: for `paper` it instructs reading blank series/number into the waybill fields (not `invoiceNumber`); for `electronic` it instructs the document number into `invoiceNumber` and empty waybill fields.
- [ ] AC-BE-3. Unit test asserts the built prompt contains the hint for the selected type (and the supplier-name hint when provided).
- [ ] AC-BE-4. The anti-hallucination clause ("return null/empty if not sure; do not invent") is present in every built prompt.
- [ ] AC-BE-5. Prompt still resolves from `system_settings` (editable without redeploy); egress/fail-closed behavior unchanged (merge-gated test intact).

### Frontend
- [ ] AC-FE-1. The upload step's chosen `invoiceType` and `supplierName` are put on `OcrRequestContext` and sent as multipart fields by `BackendOcrProvider`.
- [ ] AC-FE-2. Manual check on a real paper photo: the recognized blank series/number land in `waybillSeries`/`waybillNumber`; on a real electronic doc they stay empty and the number lands in `invoiceNumber`.
- [ ] AC-FE-3. `invoiceType.ts.promptNote` / `rules.ts.prompt` remain the single source for the type/field wording (no duplicated literals in the widget), so prompt and validation cannot drift.
- [ ] AC-FE-4. Supplier hint is passed as context only — the header value is never pre-filled from it before recognition.

## Open questions / gates

- **Anti-hallucination is a hard rule** — supplier/type hints must not become fabricated values; "null if unsure" wins.
- **Prompt SSOT** — the backend `system_settings` prompt and the frontend `rules.ts`/`invoiceType.ts` fragments must be kept in sync; decide the canonical direction to avoid two sources drifting.
- **Known-catalog hints (deferred consideration):** the epic envisions passing known SKU/supplier lists as hints; scope here is limited to type + single supplier name — broader catalog priming is a follow-up.

## Sources

- `plan/PHASE_S2_OCR_CAPTURE.md` §1 S2-B2 (invoiceType + supplierName into prompt, paper vs electronic identifier, date/currency hint, anti-hallucination), §4 AC-2.
- `mvp.fe/src/shared/ocr/invoiceType.ts` (`INVOICE_TYPES`, `promptNote`, `identifier`), `src/shared/ocr/rules.ts` (`waybillSeries`/`waybillNumber` prompt+format), `src/shared/ocr/provider.ts` (`OcrRequestContext.supplierName/invoiceType`).
- `mvp.be/app/providers/ocr/prompt.py` (prompt builder), `app/services/invoice_service.py:121` (`recognize`), `system_settings` OCR prompt (`resolve_invoice_prompt`, migration `1e12…`).
