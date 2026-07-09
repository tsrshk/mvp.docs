---
id: LCOS-F10
type: feature
title: Invoice status machine + Esupl payload + gated write
epic: "[[LCOS-E2-invoice-intake]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]", "[[invoice_lines]]", "[[sku_mapping]]", "[[integration_credentials]]", "[[suppliers]]"]
requirements: ["[[invoice-status-machine]]", "[[fail-closed]]", "[[erp-esupl-integration]]", "[[sku-identity-resolver]]"]
adrs: ["[[ADR-006]]", "[[ADR-012]]", "[[DEC-0011]]", "[[DEC-0013]]", "[[ADR-020]]"]
legacy_refs: [07 Э1, plan F1, "08 F0.4"]
sources: ["APP_OVERVIEW.md §6", "mvp.be app/services/invoice_service.py:54", "mvp.be app/services/invoice_service.py:130", "mvp.be app/services/invoice_service.py:215", "mvp.be app/providers/erp/esupl.py:245", "mvp.be app/api/v1/routes/invoices.py:55"]
updated: 2026-07-09
---
# LCOS-F10 · Invoice status machine + Esupl payload + gated write
**Epic:** [[LCOS-E2-invoice-intake]] · **Status:** built · **Phase:** Phase 1

## Description

F10 is the commit spine of the invoice wedge: it turns an edited `InvoiceDraft` into a persisted `Invoice` with a definite terminal status, builds the Esupl `outgoing-invoice` payload, and — only behind a runtime toggle — writes the receipt into the ERP. It is the **fail-closed commit context** counterpart to the tolerant draft-resolve of [[LCOS-F9-line-matching]] (APP_OVERVIEW §6).

`submit()` runs a fixed pipeline: `validate_draft` (arithmetic — number present, positive total, non-empty lines, and line-sum vs declared total within a `Decimal("0.05")` tolerance) → `prepare()` (resolve supplier, lines, team and warehouse into a payload) → durable-identity resolution and Phase-2 live POS validation → status assignment. The five terminal statuses are: **rejected** (arithmetic or identity/validation failure), **validated** (recognized and stored but not POS-ready — mapping/edits needed), **prepared** (payload built, write disabled), **written** (actually posted to Esupl), **failed** (the write attempt raised). Every path persists the invoice and its lines so nothing recognized is lost.

The real ERP write is gated by `ERP_WRITE_ENABLED`, resolved at runtime from `system_settings` with a registry default of **False** — a read-only project by default. When off, `write_invoice` short-circuits and returns a synthetic `esupl-prepared-<number>` id without contacting Esupl; the invoice stays `prepared`. When on, the payload is POSTed to `POST /teams/{id}/outgoing-invoices` with the tenant's Bearer token (no env fallback — a missing token yields a 401, [[fail-closed]]). Any write exception is captured as `failed` and logged, never crashing the request. Provider live-paths run only on the backend ([[ADR-012]]).

## Capabilities

- Arithmetic validation (`validate_draft`): missing number, missing/non-positive total, no lines, or line-sum ≠ declared total beyond `±0.05` → collected error strings.
- Payload assembly (`prepare` → `EsuplOutgoingInvoice`): resolved `team_id` (from `Organization.esupl_team_id`), `warehouse_id` (from `Subdivision.esupl_warehouse_id`), numeric `supplier_id`, invoice number/date and resolved `EsuplLineItem`s; readiness requires all of team, warehouse, supplier-num and every line ready.
- Terminal status machine: `rejected` / `validated` / `prepared` / `written` / `failed`, each persisted with `validation_errors` context where relevant.
- Commit-time durable identity + live POS validation gate the `prepared` transition (fail-closed): unresolved SKU, missing team, POS unavailable, or unit mismatch → `rejected` (details in [[LCOS-F13-sku-identity-resolver]]).
- Provenance persisted: `ocr_provider` / `ocr_raw` from the draft; per-line durable `pos_ingredient_id` snapshot stamped on `prepared`.
- Gated write: `ERP_WRITE_ENABLED` (runtime, default False) — off → `prepared` + synthetic id, on → real POST, exception → `failed`.
- `esupl_payload` stored on the invoice (as JSON) once `prepared`.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Submit an edited draft; sees the resulting status and any validation errors within their subdivision. |
| [[admin]] | Same as member within their subdivision. |
| [[superadmin]] | All tenants; via config API can flip `ERP_WRITE_ENABLED` and inspect any invoice. |
| [[sqladmin-operator]] | Not in the flow; flips `ERP_WRITE_ENABLED` in the SQLAdmin plane for the owner-run write trial ([[LCOS-F3-sqladmin-operator]]). |

`POST /invoices` is tenant-scoped via the active JWT context (see [[auth]], [[multitenancy]]).

## Involved entities

- [[invoices]] — the persisted target; holds `status`, `validation_errors`, `external_id`, `esupl_payload`, `ocr_provider`/`ocr_raw`.
- [[invoice_lines]] — persisted draft lines; each carries the durable `pos_ingredient_id` snapshot once prepared.
- [[sku_mapping]] — read (not written) on the commit path for durable identity; only confirmed rows count (`method=manual` OR `confirmed_by` set).
- [[integration_credentials]] — per-org Esupl Bearer token (Fernet), resolved via `get_esupl_access`; no env fallback.
- [[suppliers]] — resolved supplier supplies the numeric `supplier_id` for the payload.

## Dependencies / links

- **Requirements:** [[invoice-status-machine]] (normative SSOT for the five statuses and transitions), [[fail-closed]] (`ERP_WRITE_ENABLED` default OFF, no-token → 401, POS-unavailable → block), [[erp-esupl-integration]] (write path + payload shape), [[sku-identity-resolver]] (commit identity gate).
- **Features:** consumes resolved lines from [[LCOS-F9-line-matching]]; commit identity from [[LCOS-F13-sku-identity-resolver]]; the persist-then-commit ordering of the moat is [[LCOS-F14-learning-loop]]; destination-warehouse selection that will feed the payload is [[LCOS-F12-warehouse-target]]; read-side (`GET /invoices`) is [[LCOS-F11-esupl-read]].
- **ADR / decisions:** [[ADR-006]] (fail-closed egress + write toggle), [[ADR-012]] (provider live-paths backend-only), [[DEC-0011]]/[[DEC-0013]] (commit identity is confirmed-only, no cache/fuzzy/AI), [[ADR-020]] (moat persisted before send, survives reject).

## Acceptance criteria (AC)

### Backend
- [ ] AC-BE-1. `validate_draft` flags missing number, missing/non-positive total, no lines, and line-sum vs total drift beyond `Decimal("0.05")`.
- [ ] AC-BE-2. `submit()` assigns exactly one terminal status — `rejected` / `validated` / `prepared` / `written` / `failed` — and persists the invoice + lines on every path.
- [ ] AC-BE-3. Arithmetic errors → `rejected` with joined `validation_errors`, no payload built.
- [ ] AC-BE-4. Recognized but not POS-ready (unresolved supplier/lines/team/warehouse) → `validated` with warnings, no write.
- [ ] AC-BE-5. Fully resolved and validated → `prepared`; `esupl_payload` stored and per-line `pos_ingredient_id` snapshot stamped.
- [ ] AC-BE-6. `ERP_WRITE_ENABLED` is read at runtime from `system_settings` (registry default False); when off, `write_invoice` returns `esupl-prepared-<number>` and does NOT contact Esupl.
- [ ] AC-BE-7. When on, a successful `POST /teams/{id}/outgoing-invoices` sets `status=written` and `external_id` from the response; a raised write → `status=failed` with the error captured, request does not crash.
- [ ] AC-BE-8. The write uses the per-org token from `integration_credentials` (via `get_esupl_access`); a missing token means Esupl 401 (no env fallback), and tokens are never logged.

### Frontend
- [ ] AC-FE-1. `POST /invoices` is called with the edited draft; the returned status is surfaced to the user.
- [ ] AC-FE-2. `rejected` / `validated` show the specific `validation_errors` / warnings inline (per line where applicable) so the user knows what to fix.
- [ ] AC-FE-3. `prepared` vs `written` are visually distinct (write-disabled vs actually posted), matching the read-only default.
- [ ] AC-FE-4. A client-side send guard blocks accidental re-submission of the same invoice from the same device (server-side idempotency deferred — see [[LCOS-F43-idempotency]]).

## Open questions / gates

- **`ERP_WRITE_ENABLED` = OFF by default:** turning on real writes is a deliberate Customer-Zero step (owner-run write trial, 08 F0.4); return to OFF after the trial.
- **`VER-021` durability (open, owner-run):** stability of `pos_ingredient_id` across edit/delete-recreate is not empirically confirmed; merge remains gated — see [[LCOS-E5-stabilization]].
- **Server-side idempotency:** none before F5.2 — `submit` always creates a new row, so the same invoice must not be re-posted via API while the write gate is on ([[LCOS-F43-idempotency]]).

## Sources

- `APP_OVERVIEW.md §6` (pipeline recognize → prepare → submit → write; status list).
- `mvp.be/app/services/invoice_service.py:54` (`validate_draft` + tolerance), `:130` (`prepare` → payload + readiness), `:215` (`submit` status machine + gated write).
- `mvp.be/app/providers/erp/esupl.py:245` (`write_invoice` — toggle short-circuit, POST, token, doc-id parse).
- `mvp.be/app/api/v1/routes/invoices.py:55` (`POST /invoices` = submit), `:48` (`POST /prepare` preview).
