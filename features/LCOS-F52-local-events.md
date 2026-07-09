---
id: LCOS-F52
type: feature
title: Local events (manual entry)
epic: "[[LCOS-E10-local-context]]"
status: future
phase: "Phase 2"
roles: [member, admin, superadmin]
entities: ["[[subdivisions]]"]
requirements: ["[[multitenancy]]"]
adrs: []
legacy_refs: [plan F6, "plan F6-B3", "plan F6-F1"]
sources: ["plan/PHASE_F6_LOCAL_CONTEXT.md §1 (F6-B3), §2 (F6-F1)", "plan/00_IMPLEMENTATION_PLAN.md F6"]
updated: 2026-07-09
---
# LCOS-F52 · Local events (manual entry)
**Epic:** [[LCOS-E10-local-context]] · **Status:** future · **Phase:** Phase 2

## Description

Lets the owner record neighborhood events (a festival, a nearby concert, road works) that move foot traffic, so the digest can explain sales anomalies and warn about upcoming ones. For the MVP this is deliberately **manual entry** — an automatic poster/listing parser (relax.by and similar) is out of scope until the value of manual entry is validated (plan §3, Q4).

Events are stored in a subdivision-scoped `local_events` table: `title`, `starts_on`, optional `ends_on`, `expected_impact` (`traffic_up | traffic_down | unknown`), optional `note` and `source`. They are exposed via CRUD endpoints under `/api/v1/context/events...` and surfaced alongside weather in [[LCOS-F53-digest-enrichment]]. A mock provider supplies demo events for development.

## Capabilities

- `local_events` storage (subdivision-scoped): `title`, `starts_on`, `ends_on?`, `expected_impact` enum, `note?`, `source?`.
- CRUD API: `POST/PATCH/DELETE /api/v1/context/events...`.
- Events section (inside the Digest or Settings page): list of future/past events + a mobile-friendly add form.
- Mock provider with demo events for dev.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Adds/edits events for their own subdivision via the Events form. |
| [[admin]] | Same, within their subdivision/organization. |
| [[superadmin]] | Manages events across tenants. |
| [[sqladmin-operator]] | Not involved in this flow. |

Tenant-scoped: events are isolated per subdivision ([[multitenancy]]).

## Involved entities

- [[subdivisions]] — scope owner for each event (`SubdivisionScopedMixin`).
- `local_events` (future subdivision-scoped table) — the manual-entry event store; entity doc to be created on activation.

## Dependencies / links

- **Requirements:** [[multitenancy]] (events isolated per subdivision).
- **Features:** consumed by [[LCOS-F53-digest-enrichment]] (upcoming-events block + anomaly context); surfaced next to weather from [[LCOS-F50-weather]].

## Acceptance criteria

Acceptance criteria: TBD (Phase 2 — detailed on activation).

## Sources

- `plan/PHASE_F6_LOCAL_CONTEXT.md §1` — F6-B3 (`local_events` schema, manual entry), `§2` — F6-F1 (Events section + add form + mock provider), `§3` (parser out of scope, Q4).
- `plan/00_IMPLEMENTATION_PLAN.md F6`.
