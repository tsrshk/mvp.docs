---
id: LCOS-F69
type: feature
title: Second ERP connector (iiko)
epic: "[[LCOS-E15-saas]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin, sqladmin-operator]
entities: ["[[organizations]]", "[[integration_credentials]]", "[[system_settings]]", "[[invoices]]"]
requirements: ["[[provider-abstraction]]", "[[erp-esupl-integration]]", "[[fail-closed]]", "[[secret-encryption]]"]
adrs: ["[[ADR-009]]"]
legacy_refs: [plan P2-D]
sources: ["plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-D", "Local_OS_About.md Phase 2"]
updated: 2026-07-09
---
# LCOS-F69 · Second ERP connector (iiko)

**Epic:** [[LCOS-E15-saas]] · **Status:** future · **Phase:** Phase 2

## Description

Adds iiko as a second ERP/POS backend alongside Esupl. This is the trigger that finally exercises the ERP provider seam: [[ADR-009]] allows a second implementation *only* here (no speculative multi-provider build during Phase 1). A new `IikoErpProvider` implements the existing `ErpProvider` Protocol so recognition, prepare/submit and read flows work against iiko without rewriting any service.

The key change is *where* provider selection lives: today it is a deploy-level `ERP_PROVIDER` env var (one POS per deployment); serving multiple tenants requires moving the choice to the org level (an organization column/setting). That is a genuine architectural shift and must be captured in its own ADR when built.

## Capabilities

- `IikoErpProvider` behind the existing `ErpProvider` Protocol — a drop-in second implementation, services unchanged.
- Provider selection moves from deploy-level (`ERP_PROVIDER` env) to org-level (organization column/setting).
- iiko authentication/credentials via the existing per-org encrypted credential pattern.
- Same read-only-plus-gated-write posture as the Esupl connector (no new write semantics introduced by the seam).

## Access by role

| Role | What they can do |
|---|---|
| [[admin]] | For a tenant whose POS is iiko, uses the normal invoice/read flows transparently. |
| [[superadmin]] | Sets the per-org ERP provider; manages iiko credentials across tenants. |
| [[sqladmin-operator]] | Configures the org-level provider choice + credentials in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |
| [[member]] | Uses invoice flows unaware of which ERP backend is active. |

## Involved entities

- [[organizations]] — gains the org-level ERP-provider selection (migrated off the deploy env var).
- [[integration_credentials]] — per-org iiko token/credentials (Fernet-encrypted, backend-only).
- [[system_settings]] — provider/flag resolution surface.
- [[invoices]] — the domain whose prepare/submit path now targets iiko when selected.

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (second `ErpProvider` implementation, the seam's whole purpose), [[erp-esupl-integration]] (the first connector this mirrors; read-only + gated write posture preserved), [[fail-closed]] (iiko egress stays fail-closed), [[secret-encryption]] (iiko credentials encrypted).
- **Features:** realizes the seam from [[LCOS-F5-provider-seams]]; reuses the flows in [[LCOS-F10-invoice-status-machine]] and [[LCOS-F11-esupl-read]] without change.
- **Epics:** part of [[LCOS-E15-saas]]; demand-driven, built after [[LCOS-F68-billing]] when a paying tenant needs iiko.
- **ADR:** [[ADR-009]] (second implementation allowed only at this trigger); a new ADR records moving provider selection deploy-level → org-level.

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). Decomposed into a dedicated `PHASE_P2_D` file; a new ADR for org-level provider selection is a deliverable of that decomposition.

## Sources

- `plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-D` (`IikoErpProvider` behind `ErpProvider` Protocol; provider selection deploy → org level; ADR to be written).
- `Local_OS_About.md` Phase 2 (iiko support in addition to Esupl).
