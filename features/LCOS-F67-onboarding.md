---
id: LCOS-F67
type: feature
title: Self-service onboarding
epic: "[[LCOS-E15-saas]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin]
entities: ["[[organizations]]", "[[subdivisions]]", "[[users]]", "[[memberships]]", "[[integration_credentials]]", "[[sku_mapping]]", "[[packings]]"]
requirements: ["[[multitenancy]]", "[[auth]]", "[[erp-esupl-integration]]", "[[secret-encryption]]"]
adrs: ["[[ADR-008]]"]
legacy_refs: [plan P2-B, "DEC-08"]
sources: ["plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-B", "plan/PHASE_P2_SAAS_OUTLINE.md §1", "Local_OS_About.md Phase 2"]
updated: 2026-07-09
---
# LCOS-F67 · Self-service onboarding

**Epic:** [[LCOS-E15-saas]] · **Status:** future · **Phase:** Phase 2

## Description

Lets a new coffee-shop owner start using LCOS without the founder manually creating their tenant. A self-service sign-up creates an organization + subdivision + admin user in one flow — the first public write endpoint that runs *outside* an existing tenant, which is exactly why it needs its own dedicated security review before it ships.

After sign-up, a connection wizard walks the owner through linking Esupl (entering `team_id` / `warehouse_id` / API token via the existing per-org pos-config, DEC-08), running the initial catalog import (SKU/packings), and completing a first-invoice tutorial. It also fills the two auth gaps that single-tenant Phase 1 never needed: email confirmation and password reset.

The tenant hierarchy and per-org POS credentials this feature populates already exist ([[LCOS-F1-multitenancy]], [[ADR-008]]); onboarding is the guided, unattended path into them.

## Capabilities

- Self-service registration: creates [[organizations]] + [[subdivisions]] + an admin [[users]] record with its [[memberships]] link (public, non-tenant-scoped endpoint — dedicated security review).
- Esupl connection wizard: enter `team_id` / `warehouse_id` / token into the existing per-org pos-config (DEC-08).
- Initial catalog import of SKUs and packings; first-invoice tutorial.
- Email confirmation and password reset (absent in Phase 1).

## Access by role

| Role | What they can do |
|---|---|
| [[admin]] | The self-registered coffee-shop owner: completes sign-up, connects Esupl, imports the catalog, runs the tutorial. |
| [[superadmin]] | Oversees new tenants across the platform; can assist onboarding. |
| [[member]] | Invited into an already-onboarded tenant; does not run onboarding. |
| [[sqladmin-operator]] | Can inspect/repair a tenant's pos-config in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

## Involved entities

- [[organizations]], [[subdivisions]], [[users]], [[memberships]] — the tenant + first admin created by self-service sign-up.
- [[integration_credentials]] — the per-org Esupl token captured by the connection wizard (Fernet-encrypted, backend-only).
- [[sku_mapping]], [[packings]] — populated by the initial catalog import.

## Dependencies / links

- **Requirements:** [[multitenancy]] (creates a fully isolated tenant; the public endpoint must not leak across `organization_id`), [[auth]] (email confirm + password reset + first admin credential), [[erp-esupl-integration]] (pos-config + read-only catalog import), [[secret-encryption]] (token stored encrypted).
- **Features:** requires [[LCOS-F66-prod-hardening]] first (no external users before hardening); builds on [[LCOS-F1-multitenancy]] and the pos-config path in [[LCOS-F11-esupl-read]]; catalog import reuses [[LCOS-F15-sku-catalog]].
- **Epics:** part of [[LCOS-E15-saas]]; precedes [[LCOS-F68-billing]] (piloted onboarding proves willingness to pay before billing is built).
- **ADR:** [[ADR-008]] (multi-tenant-ready hierarchy reused).

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). Decomposed into a dedicated `PHASE_P2_B` file; the public sign-up endpoint requires a standalone security review as part of its AC.

## Sources

- `plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-B` (self-service registration, Esupl wizard, catalog import, email confirm/reset).
- `plan/PHASE_P2_SAAS_OUTLINE.md §1` (existing per-org pos-config, DEC-08).
- `Local_OS_About.md` Phase 2 (self-service onboarding for other owners).
