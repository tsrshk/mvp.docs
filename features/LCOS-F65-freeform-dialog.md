---
id: LCOS-F65
type: feature
title: Free-form strategic dialog
epic: "[[LCOS-E14-strategic-insights]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin]
entities: ["[[subdivisions]]", "[[system_settings]]", "[[integration_credentials]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[vpn-egress]]", "[[multitenancy]]", "[[config-secrets]]"]
adrs: ["[[ADR-003]]"]
legacy_refs: [plan F10, "plan F10-B3", "plan F10-B4", "plan F10-F1"]
sources: ["plan/PHASE_F10_STRATEGIC_INSIGHTS.md §1 F10-B3", "plan/PHASE_F10_STRATEGIC_INSIGHTS.md §1 F10-B4", "plan/PHASE_F10_STRATEGIC_INSIGHTS.md §2 F10-F1"]
updated: 2026-07-09
---
# LCOS-F65 · Free-form strategic dialog
**Epic:** [[LCOS-E14-strategic-insights]] · **Status:** future · **Phase:** Phase 2

## Description

The continuation of the weekly session into an open conversation: after the three questions ([[LCOS-F64-weekly-questions]]) the owner can chat freely about the business. This is the first genuinely chat-like surface in the product — deliberately gated behind this rung of the routine ladder by the strategy dev stop-list (no chat UI before this step).

Each turn is stored in a future `insight_messages` table (uuid pk, FK → `insight_sessions` CASCADE) with `role` (`user|assistant`), `content`, `created_at`. `POST /api/v1/insights/{session_id}/messages` takes the user's message, calls the LLM with `(context_snapshot + session history + new message)`, then persists and returns the assistant reply. The frozen `context_snapshot` keeps the whole thread grounded on the same audited data the questions were drawn from.

Guardrails: session history is trimmed to a token budget (older turns summarized or dropped with a marker), a per-day cap `insight_dialog_daily_limit` (registry, default 50) applies (a G11-style cost/abuse guard), and "what-if" modeling is allowed **only** on numbers present in the context, with the prompt required to show its arithmetic. AI argues and models; the human decides (G7). The chat UI sits under the weekly questions as ordinary request/response with a "thinking" indicator — no streaming required in Phase 2. Explicitly out of scope: auto-actions from the conversation (never), voice, push beyond PWA, and cross-organization benchmarks (privacy).

## Capabilities

- Turn-based dialog persisted in `insight_messages` (FK → `insight_sessions`, CASCADE); history restored on reload.
- `POST /insights/{id}/messages`: user message → LLM with `context_snapshot` + session history + new message → saved assistant reply.
- Token-budget history trimming (older turns summarized/dropped with a marker).
- Per-day message cap `insight_dialog_daily_limit` (registry, default 50) — cost/abuse guard (G11).
- "What-if" modeling constrained to context numbers; prompt must show the calculation. AI models, human decides (G7).
- Request/response chat under the weekly card with a "thinking" indicator; streaming deferred; mock provider for demo.

## Access by role

| Role | What they can do |
|---|---|
| [[admin]] | Hold the dialog for their subdivision within the daily message cap; read prior threads. |
| [[superadmin]] | Same across all tenants; sets `insight_dialog_daily_limit`, model/prompt, and the module gate. |
| [[member]] | Not a target user of the strategic dialog in Phase 2. |
| [[sqladmin-operator]] | Sets the daily limit / model / module gate in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

## Involved entities

- [[subdivisions]] — tenant scope; the dialog inherits the session's subdivision boundary.
- [[system_settings]] — AI model/prompt and `insight_dialog_daily_limit`, edited without a redeploy.
- [[integration_credentials]] — Fernet-encrypted AI key read by the backend; VPN egress, never exposed to the frontend.
- Future table `insight_messages` (this feature) hangs off `insight_sessions` from [[LCOS-F64-weekly-questions]]; neither is in the frozen entity set.

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (LLM behind the seam), [[fail-closed]] + [[vpn-egress]] (AI/VPN down → explicit 503 on messages; past sessions remain readable), [[multitenancy]] (tenant isolation of messages), [[config-secrets]] (daily limit, model, prompt, gate via three-level config).
- **Features:** extends the session created by [[LCOS-F64-weekly-questions]]; both consume [[LCOS-F63-insight-context]]; gated by [[LCOS-F6-module-gates]] (`module_insights_enabled`).
- **Epics / gates:** part of [[LCOS-E14-strategic-insights]]; the Pilot-Gate check ([[ADR-003]]) expects ≥1 dialog carried through to a decision.

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). Draft direction: a message produces a context-aware reply (context present in the LLM request); history persists and restores; daily cap and history trimming enforced; AI/VPN down → explicit 503 while past sessions stay readable; tenant isolation and module gate hold.

## Sources

- `plan/PHASE_F10_STRATEGIC_INSIGHTS.md §1 F10-B3` (`insight_messages` schema, `POST .../messages` with context+history, token-budget trimming, `insight_dialog_daily_limit` default 50, what-if-on-context-numbers rule, `module_insights_enabled` gate).
- `plan/PHASE_F10_STRATEGIC_INSIGHTS.md §1 F10-B4` (messages endpoint).
- `plan/PHASE_F10_STRATEGIC_INSIGHTS.md §2 F10-F1` + §3 (chat under questions, no streaming, out-of-scope list).
