---
id: LCOS-F33
type: feature
title: Post-recognition confidence gate (verify-these-fields)
epic: "[[LCOS-E6-ocr-quality]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]", "[[invoice_lines]]"]
requirements: ["[[invoice-status-machine]]", "[[provider-abstraction]]"]
adrs: ["[[ADR-009]]"]
legacy_refs: [plan S2 (S2-F4), "scan-preprocessing-plan Phase 4", "08_PHASE1_SPEC sanity-check"]
sources: ["plan/PHASE_S2_OCR_CAPTURE.md §2 (S2-F4), §4 AC-5", "mvp.fe src/shared/ocr/rules.ts", "mvp.fe src/shared/ocr/confidence.ts", "mvp.fe src/shared/ocr/invoiceType.ts"]
updated: 2026-07-09
---
# LCOS-F33 · Post-recognition confidence gate (verify-these-fields)
**Epic:** [[LCOS-E6-ocr-quality]] · **Status:** planned · **Phase:** Phase 1

## Description

Recognition is never perfect, and the epic's kill-criterion is explicit: bad lines must not slip silently into the draft. After a draft comes back from `/recognize`, this feature runs the existing recognition-rule validators and surfaces anything shaky **at the top of the workbench** as a focused "verify these fields" section — not a separate full-screen form. Clean drafts show the normal green workbench with no interruption.

All the checks already exist as single-source-of-truth modules on the frontend: `rules.ts` (`waybillSeries`, `waybillNumber`, `totalRow`) defines the field formats and which totals/tax rows must not appear as products; `confidence.ts` defines the `LOW_CONFIDENCE = 0.9` cutoff for shakily-read lines; `invoiceType.ts` decides which identifier is mandatory for the chosen type. This feature wires those into a post-recognition pass plus per-line arithmetic verification (`qty × unitPrice` vs `sum`, the "lineSumMismatch" check), and reuses the existing validation-panel mechanism with click-to-focus jumps to the offending field.

The gate distinguishes severities from `rules.ts`: `block` fields forbid sending, `warn` fields let the invoice through flagged (e.g. the waybill series/number are `warn` because vision models miss them often and a hard block would trap the user). The old spec's sanity check — a line whose value deviates >3× from typical — must land in the warn section rather than pass unnoticed. This keeps the human "only confirms" while guaranteeing no silent data loss ([[invoice-status-machine]]).

## Capabilities

- Post-recognition validation pass over the draft using `rules.ts` field rules (`waybillSeries`/`waybillNumber` format), `totalRow` (drop/flag summary rows misread as products), and per-line arithmetic (`qty × unitPrice ≈ sum`).
- Low-confidence line flagging via the shared `LOW_CONFIDENCE = 0.9` cutoff (`isLowConfidence`) — same threshold used by the lines table highlight and photo overlay, so they cannot drift.
- Type-aware required identifier: for `paper`, a missing/invalid waybill blank is surfaced; for `electronic`, a missing document number is surfaced (`invoiceType.ts.identifier`).
- Severity handling from `rules.ts`: `block` forbids send; `warn` allows send with a flag (waybill series/number are `warn`).
- A "verify these fields" section pinned to the top of the workbench (reusing the validation-panel mechanism) with click-to-focus jumps; fully valid drafts show the normal green panel and no section.
- The old >3×-of-typical line-value sanity check routed into the warn section rather than passing silently.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Sees flagged fields after recognition, jumps to each, corrects them before `prepare`/`submit`; blocked from sending only on `block`-severity issues. |
| [[admin]] | Same as member, within their subdivision. |
| [[superadmin]] | Same across tenants. |
| [[sqladmin-operator]] | Not in the flow. |

Client-side gate over the recognized draft; tenant scope inherited from the invoice flow ([[auth]], [[multitenancy]]).

## Involved entities

- [[invoices]] — header fields validated (waybill series/number vs document number per type, total).
- [[invoice_lines]] — per-line arithmetic and low-confidence checks; flagged lines are highlighted for review, not dropped.

## Dependencies / links

- **Requirements:** [[invoice-status-machine]] (the gate sits between `recognize` and `prepare`/`submit`; no silent data loss), [[provider-abstraction]] (validators consume the canonical `OcrResult`, provider-agnostic).
- **Features:** consumes output of [[LCOS-F8-ocr-recognition]] and [[LCOS-F29-multipage-recognize]]; shares the `rules.ts`/`invoiceType.ts` SSOT with [[LCOS-F30-recognition-context]] (what the prompt asks for is what the gate verifies); precedes [[LCOS-F9-line-matching]]. Enforces the epic kill-criterion from [[LCOS-E5-stabilization]].
- **ADR:** [[ADR-009]] (provider seam; validators are provider-agnostic).

## Acceptance Criteria (AC)

### Frontend
- [ ] AC-FE-1. After `/recognize`, the draft is run through `rules.ts` (`waybillSeries`/`waybillNumber`/`totalRow`) + per-line `qty × unitPrice ≈ sum` + low-confidence (`isLowConfidence`, cutoff `0.9`) checks.
- [ ] AC-FE-2. An invoice with an invalid blank number or a line-sum mismatch shows a "verify these fields" section atop the workbench with click-to-focus jumps to each offending field; a fully valid draft shows no section (green panel).
- [ ] AC-FE-3. Type-aware requirement: `paper` surfaces a missing/invalid waybill blank; `electronic` surfaces a missing document number (from `invoiceType.ts.identifier`).
- [ ] AC-FE-4. Severity respected: `block`-severity issues disable send; `warn`-severity issues (e.g. waybill series/number) allow send while flagged.
- [ ] AC-FE-5. The >3×-of-typical line-value sanity check is routed into the warn section (never silently accepted).
- [ ] AC-FE-6. The low-confidence cutoff is read from the shared `confidence.ts` (`LOW_CONFIDENCE`) so the panel, lines table and photo overlay agree.

### Backend
- [ ] AC-BE-1. No new backend endpoint: the gate runs on the client over the returned draft; `submit` remains the authoritative server-side validator (a `block` issue passed client-side is still caught server-side, not silently persisted).

### Other (QA)
- [ ] AC-OTHER-1. Unit tests cover each rule branch (valid vs invalid series/number, totals-row drop, line-sum mismatch, low-confidence) and that a clean draft yields an empty issue set.

## Open questions / gates

- **Kill-criterion (no silent loss):** lines below confidence / failing arithmetic must be flagged or block — never pass unseen; this is the epic gate inherited from [[LCOS-E5-stabilization]].
- **block vs warn calibration:** waybill series/number are `warn` today (models miss them); revisit if capture-quality features (F31/F32) raise reliability enough to promote to `block`.
- **Not a full-screen form:** must reuse the existing validation-panel mechanism (focus transitions), keeping the workbench in view.

## Sources

- `plan/PHASE_S2_OCR_CAPTURE.md` §2 S2-F4 (run `rules.ts` validators + `lineSumMismatch`, "verify these fields" section with focus transitions, not full-screen; >3× sanity check into warn), §4 AC-5.
- `mvp.fe/src/shared/ocr/rules.ts` (`waybillSeries`/`waybillNumber` format + `severity`, `totalRow`), `src/shared/ocr/confidence.ts` (`LOW_CONFIDENCE = 0.9`, `isLowConfidence`), `src/shared/ocr/invoiceType.ts` (`identifier` → required field per type).
