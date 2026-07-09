---
id: LCOS-F70
type: feature
title: Multitenancy scaling
epic: "[[LCOS-E15-saas]]"
status: future
phase: "Phase 2"
roles: [superadmin, sqladmin-operator]
entities: ["[[organizations]]", "[[subdivisions]]", "[[integration_credentials]]", "[[system_settings]]"]
requirements: ["[[multitenancy]]", "[[provider-abstraction]]", "[[config-secrets]]", "[[fail-closed]]"]
adrs: ["[[ADR-008]]"]
legacy_refs: [plan P2-E, "S1-B4"]
sources: ["plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-E", "plan/PHASE_P2_SAAS_OUTLINE.md §1", "Local_OS_About.md Phase 2"]
updated: 2026-07-09
---
# LCOS-F70 · Multitenancy scaling

**Epic:** [[LCOS-E15-saas]] · **Status:** future · **Phase:** Phase 2

## Description

A revision pass to make the multi-tenant platform behave well under many concurrent tenants rather than the single-tenant Phase-1 workload. The foundations (org → subdivision → membership isolation, per-org credentials) already exist ([[LCOS-F1-multitenancy]], [[ADR-008]]); this feature adds the per-tenant fairness, quotas and auditability that only matter at scale.

Work items: per-tenant scheduler queues / jitter (so one tenant's sync jobs don't starve others — extends the analytics scheduler [[LCOS-F47-scheduler]]), per-org LLM budget limits, image-storage quotas, an action audit log (built only if customers require it), and reviving `CredentialScope.subdivision` if per-location POS tokens become necessary (the S1-B4 note). Each item is demand-driven and revisited when real multi-tenant load appears.

## Capabilities

- Per-tenant scheduler queues / jitter to fairly distribute background sync work.
- Per-org LLM budget limits and image-storage quotas.
- Action audit log (conditional — only if customers demand it).
- Optional revival of `CredentialScope.subdivision` for per-location POS tokens (S1-B4).

## Access by role

| Role | What they can do |
|---|---|
| [[superadmin]] | Sets per-org budgets/quotas, reviews the audit log and scheduler fairness across tenants. |
| [[sqladmin-operator]] | Tunes quotas/limits and inspects audit records in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |
| [[admin]] | Sees their tenant's usage against quota; no cross-tenant visibility. |
| [[member]] | No direct control; subject to their tenant's limits. |

## Involved entities

- [[organizations]] — the scope for LLM budgets, storage quotas and audit entries.
- [[subdivisions]] — scope for per-location credential scope if revived (S1-B4).
- [[integration_credentials]] — where `CredentialScope.subdivision` would re-apply.
- [[system_settings]] — where per-org limits/quotas are configured.

## Dependencies / links

- **Requirements:** [[multitenancy]] (hardens isolation + fairness at scale), [[provider-abstraction]] (budget limits wrap the AI/ERP provider calls), [[config-secrets]] (quotas/limits stored as tenant config), [[fail-closed]] (exceeding a budget/quota fails explicitly, never silently degrades).
- **Features:** extends the scheduler from [[LCOS-F47-scheduler]] with per-tenant queues; builds on [[LCOS-F1-multitenancy]] and [[LCOS-F4-config-secrets]].
- **Epics:** part of [[LCOS-E15-saas]]; demand-driven, applied as real multi-tenant load materializes after [[LCOS-F68-billing]].
- **ADR:** [[ADR-008]] (multi-tenant-ready foundations being scaled).

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). Decomposed into a dedicated `PHASE_P2_E` file; individual items (audit log, subdivision-scoped credentials) are conditional on customer demand.

## Sources

- `plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-E` (per-tenant scheduler queues/jitter, per-org LLM budgets, storage quotas, audit log, `CredentialScope.subdivision` revival / S1-B4).
- `plan/PHASE_P2_SAAS_OUTLINE.md §1` (existing isolation + per-org token foundations).
- `Local_OS_About.md` Phase 2 (multi-tenant scaling for the market).
