---
id: LCOS-F57
type: feature
title: Google Places prefill (optional)
epic: "[[LCOS-E11-competitor-menu]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin, sqladmin-operator]
entities: ["[[integration_credentials]]", "[[subdivisions]]", "[[system_settings]]"]
requirements: ["[[provider-abstraction]]", "[[config-secrets]]", "[[secret-encryption]]", "[[vpn-egress]]"]
adrs: ["[[ADR-009]]", "[[ADR-006]]"]
legacy_refs: [plan F7, "plan F7-B4"]
sources: ["plan/PHASE_F7_COMPETITORS_MENU.md §1 (F7-B4)", "07_PHASES.md Э7", "plan/00_IMPLEMENTATION_PLAN.md F7"]
updated: 2026-07-09
---
# LCOS-F57 · Google Places prefill (optional)
**Epic:** [[LCOS-E11-competitor-menu]] · **Status:** future · **Phase:** Phase 2

## Description

An optional convenience for seeding the [[LCOS-F54-competitor-directory]]: if a free-tier Google Places key is configured, search for coffee shops within a radius of the subdivision's coordinates and prefill competitor cards (name, address, rating, `google_place_id`). This is strictly a helper — the primary, always-available path is manual card creation. With no key or an unavailable free tier, the feature simply degrades to manual entry.

The Places key is a platform-scoped `integration_credentials` secret (`platform, google_places`), Fernet-encrypted (`enc:v2:*`) and read backend-only; egress follows the platform policy ([[vpn-egress]]). Access is behind a provider seam consistent with the rest of the platform ([[provider-abstraction]], [[ADR-009]]), and the whole section is under `module_competitors_enabled`.

## Capabilities

- Radius search of nearby places from the subdivision's `lat`/`lon`, gated on a configured `google_places` key.
- Prefill of competitor cards with name, address, rating, `google_place_id` (user confirms before save).
- Graceful degradation: no key / free tier unavailable → manual card creation (the main path) remains fully functional.
- Key stored platform-scoped and encrypted (`enc:v2:*`), read backend-only; no browser exposure.
- Behind the module gate `module_competitors_enabled`.

## Access by role

| Role | What they can do |
|---|---|
| [[admin]] | Runs the Places search and confirms prefilled competitor cards for the organization. |
| [[superadmin]] | Sets the Google Places key and toggles the feature via the config API across tenants. |
| [[sqladmin-operator]] | Stores/rotates the `google_places` credential in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |
| [[member]] | Not involved (directory maintenance is an admin task). |

Tenant-scoped: prefilled cards are written into the organization's own [[LCOS-F54-competitor-directory]] ([[multitenancy]]).

## Involved entities

- [[integration_credentials]] — platform-scoped `google_places` key, Fernet-encrypted (`enc:v2:*`), backend-only.
- [[subdivisions]] — supplies `lat`/`lon` for the radius search.
- [[system_settings]] — the `module_competitors_enabled` gate and any Places-related flags, resolved at runtime.
- `competitors` (future org-scoped table) — the prefill target (see [[LCOS-F54-competitor-directory]]).

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (Places behind a seam, consistent with other integrations), [[config-secrets]] + [[secret-encryption]] (key stored encrypted, no env fallback), [[vpn-egress]] (egress governed by platform policy).
- **Features:** prefills cards for [[LCOS-F54-competitor-directory]]; gated by [[LCOS-F6-module-gates]]; complementary to the manual walk-around behind [[LCOS-F55-menu-ocr]].
- **ADR:** [[ADR-009]] (provider seam), [[ADR-006]] (egress policy).

## Acceptance criteria

Acceptance criteria: TBD (Phase 2 — detailed on activation).

## Sources

- `plan/PHASE_F7_COMPETITORS_MENU.md §1` — F7-B4 (optional Google Places for the initial list; key in `integration_credentials(platform, google_places)`; manual creation is the main path).
- `07_PHASES.md Э7` (competitor directory seeding).
- `plan/00_IMPLEMENTATION_PLAN.md F7`.
