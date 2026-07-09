---
id: LCOS-E15
type: epic
title: SaaS (Phase 2)
status: future
phase: "Phase 2"
features: ["[[LCOS-F66-prod-hardening]]", "[[LCOS-F67-onboarding]]", "[[LCOS-F68-billing]]", "[[LCOS-F69-iiko-connector]]", "[[LCOS-F70-tenancy-scaling]]", "[[LCOS-F71-product-packaging]]"]
legacy_refs: [plan P2]
sources: [06_STRATEGY.md, plan/00_IMPLEMENTATION_PLAN.md P2, 07_PHASES.md]
updated: 2026-07-09
---

# LCOS-E15 · SaaS (Phase 2)

**Status:** 🔭 future · **Phase:** Phase 2 (after Pilot-Gate + first niche customers)

## Description

Turning the product validated on Customer Zero into a sellable SaaS: production hardening and deploy (moving off local Docker to the cloud), self-service onboarding, billing, a second ERP connector (iiko) on top of the existing provider seam ([[LCOS-F5-provider-seams]]), multitenancy scaling ([[LCOS-F1-multitenancy]]), and product packaging. This epic, not anything earlier, is what implements "Phase 2 = SaaS" from the old planning docs (collision-resolution #2).

The strategy explicitly forbids building this before the Pilot-Gate: attempting to go "straight for the exponential" (global market, self-service, billing) before validation is a way to lose a year (06_STRATEGY §roadmap).

## Goal / value

Reaching a growing stream of users and a decent founder income ($3–8k/month: 30–80 paying × $99–149/month at a "manager" price point). The scaling channel is the Poster marketplace after the Pilot-Gate + 5–10 niche customers.

## Features

| ID | Name | Status | Link |
|---|---|---|---|
| LCOS-F66 | Production hardening and deploy | 🔭 future | [[LCOS-F66-prod-hardening]] |
| LCOS-F67 | Self-service onboarding | 🔭 future | [[LCOS-F67-onboarding]] |
| LCOS-F68 | Billing | 🔭 future | [[LCOS-F68-billing]] |
| LCOS-F69 | Second ERP connector (iiko) | 🔭 future | [[LCOS-F69-iiko-connector]] |
| LCOS-F70 | Multitenancy scaling | 🔭 future | [[LCOS-F70-tenancy-scaling]] |
| LCOS-F71 | Product packaging | 🔭 future | [[LCOS-F71-product-packaging]] |

## Key entities / requirements

- Entities: [[organizations]], [[subdivisions]], [[users]], [[memberships]], [[integration_credentials]] (scaling the existing tenant hierarchy).
- Requirements: [[multitenancy]], [[auth]], [[config-secrets]], [[secret-encryption]], [[provider-abstraction]], [[erp-esupl-integration]].
- Roles: [[superadmin]], [[admin]], [[sqladmin-operator]], [[supplier-future]] (supplier self-service is activated here).

## Gates

- **Pilot-Gate first ([[ADR-003]]):** SaaS does not start until the Pilot-Gate is passed and the first paying niche customers exist — a hard strategic gate.
- **Second ERP through a seam:** the iiko connector implements the existing `Protocol` without rewriting services ([[ADR-009]]).
- **Supplier self-service:** activates the [[ADR-017]] placeholder (the `supplier` role, `portal_user_id`).
- AC: TBD (Phase 2).

## legacy_refs

plan P2 (SaaS phase); 06_STRATEGY roadmap and market options A/B/C.

## Sources

- 06_STRATEGY.md (roadmap, revenue, channel), plan/00_IMPLEMENTATION_PLAN.md P2, 07_PHASES.md
- ADR: [[ADR-003]], [[ADR-009]], [[ADR-017]]
