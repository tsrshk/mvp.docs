---
id: LCOS-F48
type: feature
title: Weekly digest
epic: "[[LCOS-E9-sales-analytics]]"
status: future
phase: "Phase 2"
roles: [member, admin, superadmin]
entities: ["[[subdivisions]]", "[[system_settings]]"]
requirements: ["[[multitenancy]]", "[[provider-abstraction]]", "[[fail-closed]]"]
adrs: []
legacy_refs: [plan F5-B4, plan F5-F1, 07 Э6]
sources: ["plan/PHASE_F5_SALES_ANALYTICS.md §1 F5-B4", "plan/PHASE_F5_SALES_ANALYTICS.md §2 F5-F1", "06_STRATEGY.md"]
updated: 2026-07-09
---
# LCOS-F48 · Weekly digest
**Epic:** [[LCOS-E9-sales-analytics]] · **Status:** future · **Phase:** Phase 2

## Description

The owner-facing product of the epic: a weekly digest built on schedule from stored sales, so the owner gets the picture of the week without opening Esupl. It is deliberately not a dashboard — it arrives on its own and ends in a reading, in the AI-manager framing (see [[LCOS-E9-sales-analytics]], product strategy). A `digests` table (`SubdivisionScopedMixin`) stores `period_start`, `period_end`, `metrics JSONB` (this week's revenue vs last week and vs the same week 4 weeks ago; top-5 by revenue; items up/down >20% week-over-week; average check if available), `body_md`, `created_at`, `read_at?`, unique `(subdivision_id, period_start)`.

All arithmetic is deterministic (SQL/Python, Decimal) and unit-testable; the LLM (`ai_complete`, cheap model) only turns the finished `metrics` into readable prose in `body_md`. If AI is unavailable, the digest is still saved with templated text from the metrics and flagged `"ai_text": false` — an honest computed fallback, not silent degradation (metrics matter more than prose). The whole feature sits behind the `module_analytics_enabled` gate. Delivery channel is web only — a Digest page plus a PWA badge; the old-spec Telegram channel is out of scope (plan §6 Q1).

## Capabilities

- `digests` table + scheduled `DigestService.build()` producing deterministic `metrics` and LLM-rendered `body_md`.
- AI-unavailable fallback: digest saved with templated metric text and `ai_text=false` flag.
- Routes: `GET /api/v1/digests`, `GET /api/v1/digests/{id}`, `POST /api/v1/digests/{id}/read`, `POST /api/v1/digests/generate` (manual re-generate for a period; needs subdivision context).
- Frontend "Digest" nav item: list of weekly digests + metric cards rendered from `metrics` (not parsed from markdown), with `body_md` below; unread badge; a data-freshness banner ("Esupl data as of <last successful sync>", explicit warning when the sync is broken).
- Module gate `module_analytics_enabled`.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Read the digest for their subdivision on web/PWA; mark as read. |
| [[admin]] | Same, plus manual re-generate for a period; sees sync freshness. |
| [[superadmin]] | Cross-tenant read; toggles `module_analytics_enabled` and the AI provider via config-API. |
| [[sqladmin-operator]] | Switches the module gate / AI provider in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

## Involved entities

- [[subdivisions]] — digest scope (`SubdivisionScopedMixin`, unique `(subdivision_id, period_start)`).
- [[system_settings]] — `module_analytics_enabled` gate, digest schedule flags, `ai_provider` for prose rendering.
- New table `digests` is defined here (Phase 2 stub, no standalone entity doc yet); metrics are derived from `daily_aggregates` / `sales_records` ([[LCOS-F46-sales-storage]]).

## Dependencies / links

- **Requirements:** [[multitenancy]] (per-subdivision digests, isolation tested), [[provider-abstraction]] (LLM prose behind the AI seam, cheap model), [[fail-closed]] (broken sync shows a stale-data banner, not a fresh date; AI-down is an explicit flagged fallback).
- **Features:** consumes [[LCOS-F46-sales-storage]], generated on schedule by [[LCOS-F47-scheduler]]; the unread-badge mechanism reuses supplier/price alerts from [[LCOS-F21-price-change-signal]] if available.
- **Epics:** [[LCOS-E9-sales-analytics]]; free-form "how are we doing" questions are out of scope here → [[LCOS-E14-strategic-insights]]; weather explanations → [[LCOS-E10-local-context]].

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). Scheduled generation, metric contents, AI-fallback flag, mobile readability, stale-data banner, and tenant isolation are drafted on activation.

## Sources

- `plan/PHASE_F5_SALES_ANALYTICS.md §1 F5-B4` (digest table, deterministic metrics, AI fallback, routes).
- `plan/PHASE_F5_SALES_ANALYTICS.md §2 F5-F1` (Digest page, metric cards, freshness banner).
- `06_STRATEGY.md` (AI-manager framing: digest arrives and ends in an action, not a dashboard).
