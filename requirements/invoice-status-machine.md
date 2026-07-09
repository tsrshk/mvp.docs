---
id: REQ-INVOICE-STATUS
type: requirement
title: Invoice status machine (draft→validated→rejected→prepared→written→failed)
status: built
scope: cross-cutting
roles: [member, admin]
entities: ["[[invoices]]", "[[invoice_lines]]"]
adrs: ["[[ADR-001]]", "[[ADR-002]]", "[[ADR-006]]"]
requirements: ["[[erp-esupl-integration]]", "[[sku-identity-resolver]]", "[[fail-closed]]", "[[global-requirements]]"]
legacy_refs: [07 Э1, plan F1, 08 F0.x]
sources: [01_ARCHITECTURE.md "prepare()→payload", "Enums (InvoiceStatus)", APP_OVERVIEW.md §6]
updated: 2026-07-09
---

# REQ-INVOICE-STATUS · Invoice status machine

**Type:** cross-cutting SSOT · **Status:** built. The `Invoice` lifecycle from recognition to the (gated) write into the POS.

## Normative statement

- **N1. Enum `InvoiceStatus` (native PG enum):** `draft → validated → rejected → prepared → written → failed`. Default `draft`, indexed. Semantics:
  - `validated` — OCR ok, arithmetic passed, but **not yet** resolved into a POS payload.
  - `rejected` — a failure of arithmetic/required fields **or** of the identity commit-resolve (fail-closed).
  - `prepared` — fully resolved into an `EsuplOutgoingInvoice`, ready to send; **the payload is saved into `invoices.esupl_payload`**.
  - `written` — actually written to Esupl (only when `ERP_WRITE_ENABLED`).
  - `failed` — the write to the ERP failed.
- **N2. Two-step API:** `recognize` (OCR only, no persist) → the client edits → `submit`. `prepare` — a pure resolve step (also `POST /invoices/prepare` for a preview), does not persist.
- **N3. `submit(draft)` = `validate_draft` + `prepare` + persist:** `validate_draft` checks the number, a positive total, the sum of lines vs the total within `_TOTAL_TOLERANCE = Decimal("0.05")`; then `prepare` (draft-resolve, [[sku-identity-resolver]] N1) and the identity commit-resolve; persists the local [[invoices]], sets the status.
- **N4. `esupl_payload` is frozen at `prepared`** — so the later gated send reproduces the **exact** validated body without re-resolving.
- **N5. The write is gated twice:** `submit` calls `erp.write_invoice` **only** when `resolve_bool(ERP_WRITE_ENABLED)` (default False); `EsuplErpProvider.write_invoice` itself **re-gates** on the same flag (returns `esupl-prepared-<number>` without egress when OFF). See [[erp-esupl-integration]] N4.
- **N6. Write exceptions do not bring down the request:** `submit` catches them and writes `status=failed` + `validation_errors`, not a 500.
- **N7. Write idempotency:** `UNIQUE(organization_id, external_id)` on [[invoices]] (PG treats NULLs as distinct → drafts without an `external_id` do not conflict); `get_by_external_id` for a re-write. FE dedup — `sentInvoiceKey(scopeId, identity)` (per-browser, to be replaced by a server-side key — DEFER-04).

## Rationale

Separating the statuses makes "recognized", "valid but not POS-ready", "ready", "written" and "write error" distinguishable — critical for human-in-the-loop ([[ADR-002]]): the human sees exactly what is ready to send. Saving `esupl_payload` at `prepared` freezes the validated body, so the double write (local DB + ERP) does not re-resolve on send. The double write gate is part of the fail-closed read-only mode.

## Failure modes

- **A failure of arithmetic/required fields** → `rejected` (not a silent send of a wrong total).
- **A failure of the identity commit-resolve** → `rejected` + review (see [[sku-identity-resolver]] N3).
- **ERP write failed** → `failed` + `validation_errors`, the request does not fall over with a 500.
- **`ERP_WRITE_ENABLED=OFF`** → `prepared` (not `written`); FE toast "Prepared… POS write disabled".
- **Lines without a SKU** are dropped on send (new ingredients are never created) — intentional, not an error.

## Relations

- ADR: [[ADR-001]] (write point), [[ADR-002]] (human-in-the-loop), [[ADR-006]] (fail-closed).
- Entities: [[invoices]] (`status`, `esupl_payload`, `external_id`), [[invoice_lines]] (`pos_ingredient_id` snapshot).
- Requirements: [[erp-esupl-integration]] (write/gate), [[sku-identity-resolver]] (commit-resolve → rejected), [[fail-closed]], [[global-requirements]] R8.3.

## Referenced by

`LCOS-F10` (Invoice status machine + Esupl payload + gated write), `LCOS-F8`/`F9` (recognize/prepare), `LCOS-F13`/`F14` (commit-resolve → status), `LCOS-F43` (server-side idempotency — DEFER-04).

## Sources

- 01_ARCHITECTURE.md → "Enums (InvoiceStatus)", "How a request flows", "prepare() flow", Data model (`invoices`).
- APP_OVERVIEW.md §6.
- Code: `app/services/invoice_service.py` (`submit`/`prepare`/`validate_draft`), `app/db/models.py` (`InvoiceStatus`).
