---
id: LCOS-F8
type: feature
title: Invoice OCR recognition (photo → InvoiceDraft)
epic: "[[LCOS-E2-invoice-intake]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]", "[[invoice_lines]]", "[[system_settings]]", "[[integration_credentials]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[erp-esupl-integration]]"]
adrs: ["[[ADR-006]]", "[[ADR-009]]", "[[ADR-012]]"]
legacy_refs: [07 Э0/Э1, plan F1, "08 F0.1", "08 F0.2"]
sources: ["APP_OVERVIEW.md §6", "plan/00_IMPLEMENTATION_PLAN.md §1", "mvp.be app/api/v1/routes/invoices.py:33", "mvp.be app/services/invoice_service.py:121", "mvp.be app/providers/ocr/claude.py", "mvp.fe src/shared/ocr"]
updated: 2026-07-09
---
# LCOS-F8 · Invoice OCR recognition (photo → InvoiceDraft)
**Epic:** [[LCOS-E2-invoice-intake]] · **Status:** built · **Phase:** Phase 1

## Description

The first step of the "invoice intake" wedge: the user photographs a paper invoice, the image is sent to the backend, where a vision-LLM (Claude Vision) recognizes it into a structured `InvoiceDraft` — number, date, total, currency, raw lines (description, quantity, unit, price, amount), and the supplier name/tax ID from the header. This is the "entry point" of the entire invoice flow (see [[invoice-status-machine]]).

The `POST /invoices/recognize` endpoint **does not write to the ERP and does not persist** anything to the database — it merely returns a draft that a human edits on the frontend before `prepare`/`submit`. The OCR provider is resolved **lazily** (only on `/recognize`), so that write paths do not pay for a DB read of the AI provider selection from `system_settings.ai_provider` (`InvoiceService._get_ocr`). The model key and egress routing (VPN) live only on the backend — the frontend stores no secrets (`[[ADR-012]]`).

Current limitation: **one page per request** is recognized (one file, one LLM call). Multi-page invoices and the "silent loss" of second pages are a known gap, tracked in [[LCOS-F29-multipage-recognize]] (epic [[LCOS-E6-ocr-quality]]).

## Capabilities

- Image upload (`multipart/form-data`, field `file`); allowed MIME types — `image/jpeg`, `image/png`, `image/webp` (otherwise `415`); empty file → `400`.
- Vision-LLM recognition into `InvoiceDraft`: `number`, `issued_at`, `total_amount`, `currency`, `lines[]` (`line_no`, `description`, `quantity`, `unit`, `unit_price`, `line_total`), `supplier_name`, `supplier_tax_id`.
- Provenance: `ocr_provider` (the provider name) is stamped on the draft so that `submit` (a separate instance where OCR is no longer resolved) persists the origin into `invoices.ocr_provider` / `ocr_raw`.
- The recognition prompt is stored in the DB (`system_settings`, migration `1e12…`) and edited **without a redeploy** (`resolve_invoice_prompt`).
- FE image preprocessing before upload (EXIF normalization, resize, JPEG) in `shared/ocr/preprocess` — reduces weight and stabilizes recognition.
- Frontend provider pattern `backend | mock`: `mock` returns a demo draft for development without a real LLM.

## Role-based access

| Role | What they can do |
|---|---|
| [[member]] | Upload a photo and receive a draft within their own subdivision; edit and submit the invoice. |
| [[admin]] | Same as member, within their subdivision. |
| [[superadmin]] | Access across all tenants; plus editing of the OCR prompt and `ai_provider` via the config API. |
| [[sqladmin-operator]] | Not involved in the flow; switches `ai_provider` / OCR prompt in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

The endpoint is tenant-scoped: the scope (`organization_id` / `subdivision_id`) is taken from the active JWT context (see [[auth]], [[multitenancy]]).

## Entities involved

- [[invoices]] — the target entity of the flow; **not created** on `/recognize`, but the draft's `ocr_provider`/`ocr_raw` are later persisted at `submit`.
- [[invoice_lines]] — the draft's raw lines (domain `InvoiceLineDraft`); at this step they are not yet linked to the catalog/SKU.
- [[system_settings]] — `ai_provider` (runtime selection of the OCR implementation) and the OCR prompt (edited without a redeploy).
- [[integration_credentials]] — the Fernet-encrypted AI key (read by the backend, egress via VPN; the frontend never sees the key).

## Dependencies / relations

- **Requirements:** [[provider-abstraction]] (OCR behind a `Protocol` + registry, one `claude` implementation, `[[ADR-009]]`), [[fail-closed]] (VPN down while the toggle is on → refusal, no silent direct egress; `[[ADR-006]]`), [[erp-esupl-integration]] (LCOS read-only against third-party data).
- **Features:** the result is passed downstream to [[LCOS-F9-line-matching]] (matching lines against the catalog) and [[LCOS-F10-invoice-status-machine]] (`prepare`/`submit`). Multi-page — [[LCOS-F29-multipage-recognize]]; quality/context/auto-crop — [[LCOS-F30-recognition-context]], [[LCOS-F31-auto-crop]], [[LCOS-F33-confidence-gate]].
- **ADR:** [[ADR-009]] (provider seam, one implementation at a time), [[ADR-006]] (fail-closed egress), [[ADR-012]] (live provider paths only on the backend).

## Acceptance criteria (AC)

### Backend
- [ ] AC-BE-1. `POST /invoices/recognize` accepts `multipart/form-data` with a `file` field; returns an `InvoiceDraft` (`200`).
- [ ] AC-BE-2. MIME outside `{image/jpeg,image/png,image/webp}` → `415`; empty file body → `400`.
- [ ] AC-BE-3. The endpoint does NOT write to the ERP and does NOT persist the invoice/lines (no records in `invoices`/`invoice_lines`).
- [ ] AC-BE-4. The OCR provider is resolved lazily: `prepare`/`submit`/`list` do not read `system_settings.ai_provider` (verified by the write path working without a configured OCR).
- [ ] AC-BE-5. The draft has `ocr_provider = <implementation name>` stamped (provenance survives the round-trip to `submit`).
- [ ] AC-BE-6. The recognition prompt is read from the DB (`system_settings`); editing the prompt changes behavior without a redeploy.
- [ ] AC-BE-7. Fail-closed egress: with `ai_vpn_enabled=ON` and the VPN unavailable, the LLM request is rejected with a clear error, without direct egress (non-negotiable, covered by a test, blocks merge).
- [ ] AC-BE-8. The AI key is read from `integration_credentials` (Fernet), with no env fallback; keys/tokens are not logged.

### Frontend
- [ ] AC-FE-1. The user uploads/takes a photo; the image passes through preprocessing (`shared/ocr/preprocess`: EXIF, resize, JPEG) before upload.
- [ ] AC-FE-2. The FE calls `POST /invoices/recognize` (server-side LLM), no API key in the browser.
- [ ] AC-FE-3. The recognized draft is displayed as an editable line form; a human edits it before `prepare`/`submit`.
- [ ] AC-FE-4. The `mock` provider returns a demo draft in dev mode (`shared/ocr/providers/mock`).
- [ ] AC-FE-5. Errors `415`/`400`/recognition failure are shown with a clear message, without crashing the form.

### Other (limitation)
- [ ] AC-OTHER-1. A multi-page invoice in a single request is NOT supported — documented as a gap → [[LCOS-F29-multipage-recognize]] (interim fix for silent loss — [[LCOS-F26-multipage-fix]]).

## Open questions / gates

- **Multi-page** — the second+ pages are lost silently; interim fix (an explicit warning) — [[LCOS-F26-multipage-fix]], full solution — [[LCOS-F29-multipage-recognize]].
- **OCR-accuracy eval** — a separate run (`scripts/ocr_eval.py`), not part of the regular pytest.
- The post-recognition confidence gate is not yet built in ([[LCOS-F33-confidence-gate]]).

## Sources

- `APP_OVERVIEW.md §6` (key flow: recognize → InvoiceDraft), `§2/§3` (stack, lazy OCR resolver).
- `plan/00_IMPLEMENTATION_PLAN.md §1`.
- `mvp.be/app/api/v1/routes/invoices.py:33` (`recognize_invoice`, MIME gate).
- `mvp.be/app/services/invoice_service.py:114` (`_get_ocr` lazy resolver), `:121` (`recognize`).
- `mvp.be/app/providers/ocr/claude.py`, `app/providers/ocr/base.py` (seam), `app/providers/ocr/prompt.py`.
- `mvp.fe/src/shared/ocr/providers/backend.ts:49` (`/invoices/recognize`), `src/shared/ocr/preprocess/*`.
