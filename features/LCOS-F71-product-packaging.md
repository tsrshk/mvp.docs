---
id: LCOS-F71
type: feature
title: Product packaging
epic: "[[LCOS-E15-saas]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin]
entities: ["[[organizations]]", "[[subdivisions]]", "[[system_settings]]"]
requirements: ["[[multitenancy]]", "[[global-requirements]]"]
adrs: []
legacy_refs: [plan P2-F]
sources: ["plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-F", "plan/PHASE_P2_SAAS_OUTLINE.md §3", "Local_OS_About.md Phase 2"]
updated: 2026-07-09
---
# LCOS-F71 · Product packaging

**Epic:** [[LCOS-E15-saas]] · **Status:** future · **Phase:** Phase 2

## Description

The go-to-market wrapper around the working product: a landing page, owner-facing documentation for a coffee-shop owner (not developer docs), a support channel, and per-tenant usage analytics (retention and time-saved / economy metrics). The usage analytics are not just vanity numbers — they are the raw material for case studies and for evaluating the Phase-2 exit gate (10 paying customers, MRR $1K+, retention ≥80%; if not reached by month 12, the project closes without regret).

This is the lowest-urgency Phase-2 block, built on demand once the product itself and billing are proven; it introduces no new domain logic, only presentation, support and measurement around the existing platform.

## Capabilities

- Marketing landing page.
- Owner-oriented documentation (coffee-shop owner audience, not engineers).
- Support channel for customers.
- Per-tenant usage analytics: retention and time-saved / economy metrics feeding case studies and the exit gate.

## Access by role

| Role | What they can do |
|---|---|
| [[admin]] | Reads owner documentation, reaches support; sees their own usage/value metrics. |
| [[superadmin]] | Views cross-tenant retention/economy analytics; curates case studies and gate evidence. |
| [[member]] | Consumes owner docs and support. |
| [[sqladmin-operator]] | Not involved (no operator-plane surface). |

## Involved entities

- [[organizations]] — the unit for retention and per-tenant value metrics.
- [[subdivisions]] — granularity for usage/economy measurement.
- [[system_settings]] — flags controlling analytics collection.

## Dependencies / links

- **Requirements:** [[multitenancy]] (usage analytics aggregated strictly per tenant, no cross-customer data mixing — consistent with the "no price aggregation between clients" privacy stance), [[global-requirements]] (Phase-2 success metrics as the exit gate).
- **Features:** presents and measures the product delivered across [[LCOS-E15-saas]]; usage metrics draw on the value delivered by the Phase-1 wedge ([[LCOS-E2-invoice-intake]]).
- **Epics:** final, demand-driven block of [[LCOS-E15-saas]]; feeds the month-12 kill/scale decision.

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). Decomposed into a dedicated `PHASE_P2_F` file; success is measured against the Phase-2 exit gate (10 paying customers, MRR $1K+, retention ≥80%).

## Sources

- `plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-F` (landing, owner docs, support channel, per-tenant usage/retention/economy analytics).
- `plan/PHASE_P2_SAAS_OUTLINE.md §3` and front-matter (exit gate: 10 paying, MRR $1K+, retention ≥80%).
- `Local_OS_About.md` Phase 2 (packaging for the market; success metrics; month-12 kill criterion).
