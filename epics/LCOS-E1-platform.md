---
id: LCOS-E1
type: epic
title: Platform and foundations
status: built
phase: "Phase 1"
features: ["[[LCOS-F1-multitenancy]]", "[[LCOS-F2-app-auth]]", "[[LCOS-F3-sqladmin-operator]]", "[[LCOS-F4-config-secrets]]", "[[LCOS-F5-provider-seams]]", "[[LCOS-F6-module-gates]]", "[[LCOS-F7-frontend-platform]]"]
legacy_refs: [plan/00 G1–G11, LCOS_Conformance R1–R9]
sources: [APP_OVERVIEW.md §2–§5 §11, 01_ARCHITECTURE.md, LCOS_Conformance_Alignment_GlobalRequirements.md]
updated: 2026-07-09
---

# LCOS-E1 · Platform and foundations

**Status:** built · **Phase:** Phase 1 · **Type:** cross-cutting

## Description

The load-bearing framework on which every other epic stands: multitenancy, two independent authentication planes, three-level configuration with secret encryption, provider seams behind interfaces, request-time module gates, and the frontend platform (FSD/RTK/PWA). This is not a "user-facing feature" but a set of architectural invariants; breaking any one of them breaks tenant isolation, secret security, or fail-closed behavior.

Tenant = organization; `organization_id` is denormalized into every operational row — a tenant query without a scope is impossible by design. Operational rows also carry `subdivision_id`. Providers (OCR, ERP) are hidden behind a `Protocol` + registry; services depend only on interfaces. See the as-built SSOT in [[architecture]].

## Goal / value

Give every product feature a secure, isolated, configurable foundation that will not need rewriting when moving to SaaS ([[LCOS-E15-saas]]). Platform invariants (isolation, fail-closed, separation of auth planes) are covered by merge-blocking tests — their regression physically cannot land in main.

## Features

| ID | Name | Status | Link |
|---|---|---|---|
| LCOS-F1 | Multitenancy and tenant isolation | ✅ built | [[LCOS-F1-multitenancy]] |
| LCOS-F2 | Application authentication (JWT + refresh) | ✅ built | [[LCOS-F2-app-auth]] |
| LCOS-F3 | SQLAdmin operator plane + config API | ✅ built | [[LCOS-F3-sqladmin-operator]] |
| LCOS-F4 | Three-level configuration and secret encryption | ✅ built | [[LCOS-F4-config-secrets]] |
| LCOS-F5 | Provider seams + fail-closed egress | ✅ built | [[LCOS-F5-provider-seams]] |
| LCOS-F6 | Module gates | ✅ built | [[LCOS-F6-module-gates]] |
| LCOS-F7 | Frontend platform (FSD/RTK/PWA) | ✅ built | [[LCOS-F7-frontend-platform]] |

## Key entities / requirements

- Entities: [[organizations]], [[subdivisions]], [[users]], [[memberships]], [[integration_credentials]], [[system_settings]].
- Requirements: [[multitenancy]], [[auth]], [[config-secrets]], [[secret-encryption]], [[fail-closed]], [[vpn-egress]], [[provider-abstraction]], [[global-requirements]].
- Roles: [[superadmin]], [[admin]], [[member]], [[sqladmin-operator]].

## Gates

- **Invariants covered by tests (VER-01):** tenant isolation, fail-closed VPN, admin-auth — covered and **merge-blocking**. A regression cannot land in main.
- **DEC-0011/0013:** the two-context identity model stands on the platform's scopes (`scope_type/scope_id`) — see [[LCOS-E3-sku-identity]].
- **Kill-criteria (Pilot-Gate / ADR-003):** the platform exists so that Customer Zero uses the invoice pipeline daily; if the foundation gets in the way of feature velocity — simplify, do not grow it (Phase 1 non-goals: Celery, cloud, RBAC matrix, OAuth).

## legacy_refs

plan/00 global requirements G1–G11; LCOS_Conformance normative R1–R9 (consolidated into [[global-requirements]]).

## Sources

- APP_OVERVIEW.md §2 (stack), §3 (architecture), §4 (multitenancy/auth), §5 (secrets/fail-closed), §11 (data model)
- 01_ARCHITECTURE.md (normative architecture)
- LCOS_Conformance_Alignment_GlobalRequirements.md (R1–R9)
- ADR: [[ADR-004]], [[ADR-005]], [[ADR-006]], [[ADR-007]], [[ADR-008]], [[ADR-009]], [[ADR-010]], [[ADR-011]], [[ADR-012]]
