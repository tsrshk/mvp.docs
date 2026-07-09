---
id: LCOS-F66
type: feature
title: Production hardening & deploy
epic: "[[LCOS-E15-saas]]"
status: future
phase: "Phase 2"
roles: [superadmin, sqladmin-operator]
entities: ["[[integration_credentials]]", "[[system_settings]]", "[[refresh_sessions]]", "[[invoices]]"]
requirements: ["[[secret-encryption]]", "[[config-secrets]]", "[[fail-closed]]", "[[auth]]", "[[global-requirements]]"]
adrs: ["[[ADR-008]]", "[[ADR-009]]"]
legacy_refs: [plan P2-A, "DEFER-01", "DEFER-02", "DEFER-04", "DEC-04", R-Deploy]
sources: ["plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-A", "plan/PHASE_P2_SAAS_OUTLINE.md §3", "Local_OS_About.md Phase 2"]
updated: 2026-07-09
---
# LCOS-F66 · Production hardening & deploy

**Epic:** [[LCOS-E15-saas]] · **Status:** future · **Phase:** Phase 2

## Description

The first Phase-2 work item and a hard prerequisite for every other one: nobody outside Customer Zero may touch the product until production hardening is complete. It moves LCOS off the local Docker Compose setup onto a hosted deployment (Hetzner target) and closes the security/operations gaps deliberately deferred during Phase 1 (the `DEFER-*` backlog items and the R-Deploy conformance checklist).

Scope covers a multi-stage `Dockerfile.prod`, infrastructure/deploy for backend + static frontend hosting, real production secrets (`SECRETS_ENC_KEY` with rotation, `JWT_SECRET`, `SESSION_SECRET`), transport hardening (`COOKIE_SECURE=true`, `CSRF_ENABLED=true` with the `backendRequest.ts` change that reads the `lcos_csrf` cookie into an `X-CSRF-Token` header — DEC-04), abuse controls (rate-limiting `/auth/login`, server-side invoice-send idempotency replacing the per-browser `sentRegistry` — DEFER-04), a CI pipeline (pytest merge-gate non-negotiables, ruff, frontend build), Postgres backups, and minimum observability (structured logs + uptime check + error alerting).

The multi-tenant, secret-encryption and split auth-plane foundations already exist from day one ([[LCOS-E1-platform]]); this feature does not redesign them, it makes them production-safe.

## Capabilities

- Production container/build (`Dockerfile.prod`, multi-stage) and hosted deploy for backend + static frontend.
- Real production secrets with rotation for the Fernet KEK (`SECRETS_ENC_KEY`), `JWT_SECRET`, `SESSION_SECRET`.
- Secure cookies + CSRF end to end (`COOKIE_SECURE`, `CSRF_ENABLED`, `lcos_csrf` → `X-CSRF-Token`).
- Login rate-limiting and server-side invoice-send idempotency (replacing the per-browser guard).
- CI: pytest (merge-gate non-negotiables), ruff, frontend build; automated Postgres backups.
- Minimum monitoring: structured logs, uptime check, error alerting.

## Access by role

| Role | What they can do |
|---|---|
| [[superadmin]] | Owns deploy/secret rotation and reads the production R-Deploy checklist; no new end-user surface. |
| [[sqladmin-operator]] | Operates the deployed instance via the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]); manages runtime config/secrets. |
| [[admin]] | No direct interaction; benefits from the hardened, hosted platform. |
| [[member]] | No direct interaction. |

## Involved entities

- [[integration_credentials]] — encrypted secrets whose production KEK rotation is part of hardening.
- [[system_settings]] — runtime config/flags that must be production-set (not dev defaults).
- [[refresh_sessions]] — auth sessions affected by secure-cookie / CSRF hardening.
- [[invoices]] — the send path that gains server-side idempotency (DEFER-04).

## Dependencies / links

- **Requirements:** [[secret-encryption]] and [[config-secrets]] (production KEK + rotation, real secrets), [[fail-closed]] (egress stays fail-closed in production), [[auth]] (secure cookies, CSRF, login rate-limit), [[global-requirements]] (R-Deploy checklist must be fully green).
- **Features:** hardens the platform built in [[LCOS-E1-platform]] ([[LCOS-F2-app-auth]], [[LCOS-F4-config-secrets]], [[LCOS-F3-sqladmin-operator]]); gates [[LCOS-F67-onboarding]] (no external users before this lands).
- **Epics:** first work block of [[LCOS-E15-saas]]; blocks all sibling Phase-2 features.
- **ADR:** [[ADR-008]] (multi-tenant-ready foundations reused), [[ADR-009]] (no speculative build before the gate).

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). Decomposed into a dedicated `PHASE_P2_A` file with its own AC when Phase 2 starts; the R-Deploy production checklist must be fully green before the first external user.

## Sources

- `plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-A` (Dockerfile.prod, IaC, secrets, cookies/CSRF, rate-limiting, idempotency, CI, backups, monitoring).
- `plan/PHASE_P2_SAAS_OUTLINE.md §3` (ordering: Pilot-Gate → P2-A first), `§4 AC-3` (P2-A complete before first external user).
- `Local_OS_About.md` Phase 2 (Docker Compose local → Hetzner on Phase 2).
