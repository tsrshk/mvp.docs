---
id: LCOS-F64
type: feature
title: Weekly "3 questions" session
epic: "[[LCOS-E14-strategic-insights]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin]
entities: ["[[subdivisions]]", "[[system_settings]]", "[[integration_credentials]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[vpn-egress]]", "[[multitenancy]]", "[[config-secrets]]"]
adrs: ["[[ADR-003]]"]
legacy_refs: [plan F10, "plan F10-B2", "plan F10-B4", "plan F10-F1"]
sources: ["plan/PHASE_F10_STRATEGIC_INSIGHTS.md §1 F10-B2", "plan/PHASE_F10_STRATEGIC_INSIGHTS.md §1 F10-B4", "plan/PHASE_F10_STRATEGIC_INSIGHTS.md §2 F10-F1"]
updated: 2026-07-09
---
# LCOS-F64 · Weekly "3 questions" session
**Epic:** [[LCOS-E14-strategic-insights]] · **Status:** future · **Phase:** Phase 2

## Description

The flagship feature of the AI-manager: once a week the product opens a strategic conversation by asking the owner exactly **three questions** — not a report. A scheduler job (schedule in the config registry, by default aligned with the sales digest) takes the snapshot from [[LCOS-F63-insight-context]], calls `ai_complete` on the **primary** model, and enforces strict JSON: `questions[{question, why_now, data_refs[], suggested_angles[]}]`, exactly three items.

The prompt rule is firm: questions and their reasoning may cite **only** the passed-in data, and are framed as discussion prompts, never directives ("Should we raise the price?" — not "Raise the price"). Each question's `data_refs` must point at real elements of the snapshot, so answers stay grounded. The session is stored in a future `insight_sessions` table (subdivision-scoped, uuid pk) with `week_start`, `context_snapshot` (exactly what the LLM saw, for audit), `questions`, `created_at`, `read_at?`, and a unique `(subdivision_id, week_start)`.

The frontend renders a mobile-first "Conversation of the week" page: a weekly card with the three questions, each carrying its "why now" and its supporting data, plus an unread badge and a history list of past weeks. If the AI/VPN is unavailable when the job runs, the session is **not** created and the error surfaces in the sync run; manual generation via `POST /api/v1/insights/generate` is always available and fails loudly rather than silently.

## Capabilities

- Scheduled weekly job (registry schedule, default co-scheduled with the digest) → context → primary-model `ai_complete`.
- Strict JSON contract: exactly 3 `questions`, each with `why_now`, `data_refs[]`, `suggested_angles[]`.
- Grounding rule: cite only passed-in data; discussion-question framing, never a directive.
- Persistence in `insight_sessions` with `context_snapshot` for "what the model saw" audit; unique `(subdivision_id, week_start)`.
- Manual, always-available generation `POST /api/v1/insights/generate` (fail-closed on AI/VPN down).
- Session API: `GET /insights` (list), `GET /insights/{id}` (questions + messages), `POST /insights/{id}/read`.
- Mobile-first "Conversation of the week" page with unread badge and past-weeks history; mock provider serves a demo session.

## Access by role

| Role | What they can do |
|---|---|
| [[admin]] | Read the weekly session for their subdivision, mark it read, trigger manual generation. |
| [[superadmin]] | Same across all tenants; configures schedule, model, prompt, and the `module_insights_enabled` gate. |
| [[member]] | Not a target user of the strategic conversation in Phase 2. |
| [[sqladmin-operator]] | Sets schedule / model / limits / module gate in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

## Involved entities

- [[subdivisions]] — every session is scoped to one subdivision (the `SubdivisionScopedMixin` tenant boundary).
- [[system_settings]] — runtime AI provider/model selection and the insight prompt, edited without a redeploy.
- [[integration_credentials]] — Fernet-encrypted AI key read by the backend; egress via VPN, never exposed to the frontend.
- Future tables `insight_sessions` (this feature) and `insight_messages` (owned by [[LCOS-F65-freeform-dialog]]) are introduced in Phase 2; they are not part of the frozen entity set.

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (primary model behind the LLM seam), [[fail-closed]] + [[vpn-egress]] (AI/VPN down → explicit failure/503, session not created, no silent direct egress), [[multitenancy]] (tenant isolation of sessions), [[config-secrets]] (schedule, model, prompt, limits, gate via three-level config).
- **Features:** consumes [[LCOS-F63-insight-context]]; the same session is the anchor for [[LCOS-F65-freeform-dialog]]; gated by [[LCOS-F6-module-gates]] (`module_insights_enabled`).
- **Epics / gates:** part of [[LCOS-E14-strategic-insights]]; success feeds the Pilot-Gate check ([[ADR-003]]) — ≥1 strategic decision/month from the conversation.

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). Draft direction: the job produces exactly 3 questions with `data_refs` into a real `context_snapshot`; invalid LLM JSON → no session + logged error; `context_snapshot` persisted for audit; tenant isolation and the module gate hold; AI/VPN down → explicit 503 on generate.

## Sources

- `plan/PHASE_F10_STRATEGIC_INSIGHTS.md §1 F10-B2` (scheduler job, primary model, strict 3-question JSON, prompt grounding rule, `insight_sessions` schema, fail-closed generation).
- `plan/PHASE_F10_STRATEGIC_INSIGHTS.md §1 F10-B4` (insights API endpoints).
- `plan/PHASE_F10_STRATEGIC_INSIGHTS.md §2 F10-F1` (mobile-first "Conversation of the week" page, unread badge, history, mock demo session).
