---
id: LCOS-F44
type: feature
title: Live mode + close-out metrics
epic: "[[LCOS-E8-purchasing]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]", "[[invoice_lines]]", "[[purchase_order_lines]]", "[[system_settings]]"]
requirements: ["[[fail-closed]]", "[[erp-esupl-integration]]"]
adrs: ["[[ADR-003]]"]
legacy_refs: ["08 F5.3", "DEC-07", "07 Э5"]
sources: ["08_PHASE1_SPEC.md F5.3", "07_PHASES.md Э5", "mvp.fe src/pages/settings/ui/SettingsPage.tsx", "mvp.be app/domain/entities.py", "mvp.fe src/entities/invoice/model/sessionSlice.ts:22", "mvp.fe src/shared/ocr/providers/backend.ts:43", "mvp.fe src/widgets/prepare-step/ui/PrepareStep.tsx"]
updated: 2026-07-09
---
# LCOS-F44 · Live mode + close-out metrics
**Epic:** [[LCOS-E8-purchasing]] · **Status:** planned · **Phase:** Phase 1

## Description

The final step of Phase 1: switch on permanent live ERP writes and instrument the loop so its close can be judged honestly. Submit becomes measurable — a line-level `match_origin` (`'auto' | 'manual' | None`) is carried on the domain `InvoiceLineDraft` (the frontend sets it from the auto-map badges of [[LCOS-F9-line-matching]]), and on submit the backend stores counters on `invoices`: `auto_mapped_lines`, `total_lines`, `edited_ai_lines`, `processing_ms`. A single **Metrics** block on the Settings page reports the last 30 days — invoices processed, % auto-mapped lines, median "photo → send" time, and % of AI order lines kept untouched (from `purchase_order_lines.origin`). This is the *only* dashboard-style screen in Phase 1 — it exists to validate closing the phase, not as a product feature.

Live mode itself means `erp_write_enabled=true` permanently (safe only after the write gate work and server-side idempotency [[LCOS-F43-idempotency]] are in place; enablement checklist appended to `WRITE_TRIAL.md`). Per DEC-07 (variant B), the interim multi-page fix is folded in here: `MAX_INVOICE_PAGES` drops to `1` with an honest message, because the live recognizer only processes the first page (`shared/ocr/providers/backend.ts:43`, `const page = pages[0]`) — there must be **no silent page loss**. True multi-page recognition is out of Phase-1 scope and lives in [[LCOS-F26-multipage-fix]] / [[LCOS-F29-multipage-recognize]] ([[LCOS-E6-ocr-quality]]).

## Capabilities

- `match_origin` (`'auto'|'manual'|None`) added to domain `InvoiceLineDraft`; FE sets it from auto-map badges.
- On submit, counters stored on `invoices`: `auto_mapped_lines`, `total_lines`, `edited_ai_lines`, `processing_ms`.
- Metrics block on `SettingsPage` (30-day window): invoices, % auto-mapped lines, median photo→send, % AI order lines unedited (from `purchase_order_lines.origin`).
- `erp_write_enabled=true` permanently (after the write gate + [[LCOS-F43-idempotency]]); checklist appended to `WRITE_TRIAL.md`.
- Interim multi-page fix (DEC-07 variant B): `MAX_INVOICE_PAGES` → `1` + honest "single sheet" message in `PrepareStep`; no silent loss of later pages.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Runs the live loop (photo → written to Esupl); sees the Metrics block on Settings. |
| [[admin]] | Same, within their subdivision. |
| [[superadmin]] | Cross-tenant access; owns the `erp_write_enabled` decision via config. |
| [[sqladmin-operator]] | Toggles `erp_write_enabled` / modules in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

Scope from active JWT context; metrics are computed per tenant (see [[multitenancy]]).

## Involved entities

- [[invoices]] — carries the per-invoice counters (`auto_mapped_lines`, `total_lines`, `edited_ai_lines`, `processing_ms`) written on submit.
- [[invoice_lines]] — `match_origin` per line feeds the auto-mapped-% metric.
- [[purchase_order_lines]] — `origin` feeds the "% AI order lines unedited" metric.
- [[system_settings]] — `erp_write_enabled` (the live-write toggle) and related config.

## Dependencies / links

- **Requirements:** [[fail-closed]] (live ERP writes go through the fail-closed VPN egress — VPN down with the toggle on refuses rather than leaking direct egress), [[erp-esupl-integration]] (permanent live write to Esupl; the write gate + idempotency guard it).
- **ADR:** [[ADR-003]] (Pilot-Gate — daily live use of this loop by Customer Zero is the gate criterion).
- **Features:** requires [[LCOS-F43-idempotency]] before permanent writes; reads markings from [[LCOS-F9-line-matching]] (auto-map badges) and [[LCOS-F40-ai-order-proposal]] (`origin='ai'`); the multi-page interim fix coordinates with [[LCOS-F26-multipage-fix]] / [[LCOS-F29-multipage-recognize]]. Closes the loop opened by [[LCOS-F42-receipt-reconciliation]].

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `match_origin` is an optional field on `InvoiceLineDraft`; submit persists `auto_mapped_lines`, `total_lines`, `edited_ai_lines`, `processing_ms` on `invoices`.
- [ ] AC-BE-2. Metrics match a manual reconciliation of one day's invoices (AC-1 of spec).
- [ ] AC-BE-3. `erp_write_enabled=true` is safe permanently (guarded by the write gate + [[LCOS-F43-idempotency]]); 10 consecutive live invoices go photo → `written` with no manual duplication in Esupl.

### Frontend
- [ ] AC-FE-1. Metrics block on `SettingsPage` shows the 30-day figures (invoices, % auto lines, median photo→send, % AI lines unedited) — the only dashboard screen.
- [ ] AC-FE-2. No silent page loss: uploading 2 pages either processes both or shows an explicit message (`MAX_INVOICE_PAGES` → 1 + honest text in `PrepareStep`).

### Other (data/infra)
- [ ] AC-OTHER-1. `WRITE_TRIAL.md` gains the live-enablement checklist; `erp_write_enabled` flip is recorded there.

## Open questions / gates
- **Pilot-Gate ([[ADR-003]]) / phase-close (owner):** two weeks of the full cycle without a notebook — AI draft → send in supplier's channel → photo receipt with warehouse pick → discrepancies → `received` → invoice auto-written to Esupl. Targets: ≥95% lines without edits, ≤30 s per invoice, AI draft edited ≤30%. If met, **Phase 1 is closed**; if the built loop is not used by Customer Zero 4 weeks after rollout → revisit strategy (kill-criteria).
- True multi-page recognition stays deferred to [[LCOS-F29-multipage-recognize]]; this feature only guarantees no silent loss.

## Sources
- `08_PHASE1_SPEC.md F5.3` (`match_origin` on `InvoiceLineDraft`, submit counters, Metrics block, permanent `erp_write_enabled`, DEC-07 variant B multi-page fix, AC).
- `07_PHASES.md Э5` (`ERP_WRITE_ENABLED=ON` permanent, DEFER-04, S2 metric, phase-close criterion).
- `mvp.fe/src/pages/settings/ui/SettingsPage.tsx` — Metrics block location.
- `mvp.be/app/domain/entities.py` — `InvoiceLineDraft` (adds `match_origin`).
- `mvp.fe/src/entities/invoice/model/sessionSlice.ts:22` (`MAX_INVOICE_PAGES`), `src/shared/ocr/providers/backend.ts:43` (`const page = pages[0]` — where pages are dropped), `src/widgets/prepare-step/ui/PrepareStep.tsx` ("up to 3 sheets" texts to correct).
