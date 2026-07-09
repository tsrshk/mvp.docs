---
id: LCOS-F68
type: feature
title: Billing & subscriptions
epic: "[[LCOS-E15-saas]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin]
entities: ["[[organizations]]", "[[system_settings]]", "[[integration_credentials]]"]
requirements: ["[[multitenancy]]", "[[config-secrets]]", "[[secret-encryption]]"]
adrs: ["[[ADR-008]]"]
legacy_refs: [plan P2-C]
sources: ["plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-C", "plan/PHASE_P2_SAAS_OUTLINE.md §3", "Local_OS_About.md Phase 2"]
updated: 2026-07-09
---
# LCOS-F68 · Billing & subscriptions

**Epic:** [[LCOS-E15-saas]] · **Status:** future · **Phase:** Phase 2

## Description

Turns onboarded tenants into paying customers. Introduces plans/subscriptions, a payment provider (Stripe or a Belarusian equivalent — provider choice is an explicit research task, since CIS HoReCa is the target market), and new billing tables (subscriptions, billing invoices) kept clearly separate from the recognition `invoices` domain.

Feature gating by plan layers on top of the existing per-deploy module gates ([[LCOS-F6-module-gates]]) so a tenant's active subscription decides which modules are on. It also covers the subscription lifecycle: grace period and dunning on failed payment.

Billing is deliberately sequenced after a piloted-onboarding gate ("2 of 3 pilots ready to pay") — it is not built speculatively. Target economics from the strategy: subscription $99–149/month, aiming at the Phase-2 goal of 10 paying customers and MRR $1K+ with retention ≥80%.

## Capabilities

- Plans/tiers and subscription records; payment-provider integration (Stripe or CIS equivalent — research task).
- Billing tables (subscriptions, billing invoices) separate from the recognition [[invoices]] domain.
- Plan-based feature gating layered over the existing module gates.
- Subscription lifecycle: grace period and dunning on failed payment.

## Access by role

| Role | What they can do |
|---|---|
| [[admin]] | Chooses/changes the tenant's plan, manages payment method, views billing history. |
| [[superadmin]] | Configures plans, sees all tenants' subscription state, handles overrides/comps. |
| [[member]] | No billing control; may hit plan-gated feature limits. |
| [[sqladmin-operator]] | Inspects/repairs subscription + gate state in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

## Involved entities

- [[organizations]] — the billed unit; a subscription belongs to an org.
- [[system_settings]] — module/plan gate flags that billing drives per tenant.
- [[integration_credentials]] — pattern for storing the encrypted payment-provider API secret (backend-only).
- New billing tables (subscriptions, billing invoices) are introduced by this feature.

## Dependencies / links

- **Requirements:** [[multitenancy]] (subscription scoped per org, no cross-tenant leakage), [[config-secrets]] (plan gates resolved through the config layer, on top of [[LCOS-F6-module-gates]]), [[secret-encryption]] (payment-provider secret stored encrypted).
- **Features:** requires [[LCOS-F67-onboarding]] (paying customers must be onboardable first) and the pilot payment-willingness gate; layers on [[LCOS-F6-module-gates]].
- **Epics:** part of [[LCOS-E15-saas]]; sits behind the "2 of 3 pilots ready to pay" gate and before the demand-driven [[LCOS-F69-iiko-connector]] / [[LCOS-F70-tenancy-scaling]] / [[LCOS-F71-product-packaging]].
- **ADR:** [[ADR-008]] (org is the tenant/billing boundary).

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). Decomposed into a dedicated `PHASE_P2_C` file; payment-provider selection is a prerequisite research task before AC are fixed.

## Sources

- `plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-C` (plans/subscriptions, payment provider, billing tables, plan gating, grace/dunning).
- `plan/PHASE_P2_SAAS_OUTLINE.md §3` (sequencing: after "2 of 3 pilots ready to pay"), front-matter goals ($99–149/mo, MRR $1K+, retention ≥80%).
- `Local_OS_About.md` Phase 2 (billing; subscription pricing).
