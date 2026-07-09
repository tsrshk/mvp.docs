---
id: LCOS-F54
type: feature
title: Competitor directory
epic: "[[LCOS-E11-competitor-menu]]"
status: future
phase: "Phase 2"
roles: [member, admin, superadmin]
entities: ["[[organizations]]", "[[subdivisions]]"]
requirements: ["[[multitenancy]]"]
adrs: []
legacy_refs: [plan F7, "plan F7-B1", "plan F7-F1", 07 Э7]
sources: ["plan/PHASE_F7_COMPETITORS_MENU.md §1 (F7-B1), §2 (F7-F1)", "07_PHASES.md Э7", "plan/00_IMPLEMENTATION_PLAN.md F7"]
updated: 2026-07-09
---
# LCOS-F54 · Competitor directory
**Epic:** [[LCOS-E11-competitor-menu]] · **Status:** future · **Phase:** Phase 2

## Description

The entry point of the competitor-positioning epic: a small, manually curated directory of the 5–10 nearest coffee shops / bakeries whose prices the owner wants to keep an eye on. Data is collected by a legal manual walk-around (photos of menus later fed to [[LCOS-F55-menu-ocr]]) — there is no site scraping or aggregator parsing. This feature owns only the competitor cards; menu capture, comparison and Places prefill live in sibling features.

A new organization-scoped table `competitors` (`OrganizationScopedMixin`, uuid pk) holds `name`, optional `address`, `lat`/`lon`, `kind` (coffee shop / bakery / …), `rating`, `google_place_id`, `note`, and `is_active`. The whole section sits behind the module gate `module_competitors_enabled` ([[LCOS-F6-module-gates]]): with the module off, the API returns `404` and the UI hides the section. The target for the walk-around is entering 3+ real competitors by phone in ≤15 min each.

## Capabilities

- CRUD of competitor cards, organization-scoped and tenant-isolated ([[multitenancy]]).
- Card fields: name, address, coordinates, kind, rating, `google_place_id`, free-text note, active/inactive flag.
- List view with a "menu is stale" badge derived from the latest snapshot's `captured_on` (staleness surfaced by [[LCOS-F56-positioning]]).
- Manual creation is the primary path; optional prefill from Google Places is [[LCOS-F57-places-prefill]].
- Module gate `module_competitors_enabled` guards the whole feature (`404` + hidden UI when off).
- Mock provider ships demo competitors for development without real data.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | View competitor cards within their own subdivision/organization. |
| [[admin]] | Maintains the directory: creates/edits/deactivates competitor cards for the organization. |
| [[superadmin]] | Cross-tenant access; toggles `module_competitors_enabled` via the config API. |
| [[sqladmin-operator]] | Flips the module gate in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]); not involved in day-to-day card entry. |

Tenant-scoped: `competitors` is isolated per organization; the scope comes from the active JWT context ([[auth]], [[multitenancy]]).

## Involved entities

- [[organizations]] — the scope owner of a competitor card (`OrganizationScopedMixin`).
- [[subdivisions]] — the walk-around is anchored to a subdivision's neighborhood; coordinates seed the optional Places radius search.
- `competitors` (future organization-scoped table) — the directory store; entity doc to be created on activation.

## Dependencies / links

- **Requirements:** [[multitenancy]] (org-scoped rows, tenant isolation covered by tests on activation).
- **Features:** feeds menu capture [[LCOS-F55-menu-ocr]] and comparison [[LCOS-F56-positioning]]; optional card prefill [[LCOS-F57-places-prefill]]; gated by [[LCOS-F6-module-gates]].
- **Epic siblings:** part of [[LCOS-E11-competitor-menu]]; downstream context for [[LCOS-E13-menu-ideas]] and [[LCOS-E14-strategic-insights]].

## Acceptance criteria

Acceptance criteria: TBD (Phase 2 — detailed on activation).

## Sources

- `plan/PHASE_F7_COMPETITORS_MENU.md §1` — F7-B1 (`competitors` data model), `§2` — F7-F1 (competitor section / cards UI).
- `07_PHASES.md Э7` (competitors: photo of menu → structured items; 3 real competitors entered by phone).
- `plan/00_IMPLEMENTATION_PLAN.md F7`.
