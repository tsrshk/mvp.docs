---
id: LCOS-F51
type: feature
title: Subdivision coordinates
epic: "[[LCOS-E10-local-context]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin, sqladmin-operator]
entities: ["[[subdivisions]]"]
requirements: ["[[multitenancy]]"]
adrs: []
legacy_refs: [plan F6, "plan F6-B2"]
sources: ["plan/PHASE_F6_LOCAL_CONTEXT.md §1 (F6-B2)", "plan/00_IMPLEMENTATION_PLAN.md F6"]
updated: 2026-07-09
---
# LCOS-F51 · Subdivision coordinates
**Epic:** [[LCOS-E10-local-context]] · **Status:** future · **Phase:** Phase 2

## Description

Adds a geographic location to each point of sale so the weather sync ([[LCOS-F50-weather]]) knows where to fetch conditions for. Two nullable columns `lat`/`lon` (`Numeric(9,6)`) are added to [[subdivisions]], editable both in the SQLAdmin operator plane and in the org-admin Settings screen. A subdivision without coordinates is not an error: the weather sync simply skips it with an explicit `sync_run` note, so the rest of the pipeline keeps running.

This is a small enabling feature — no external calls of its own — but it is the precondition for any local-context enrichment, since weather and (implicitly) neighborhood events are anchored to the subdivision's location.

## Capabilities

- `subdivisions.lat` / `subdivisions.lon` columns (`Numeric(9,6)`, nullable) via migration.
- Editable in SQLAdmin (operator plane) and in org-admin Settings (self-serve).
- Missing coordinates → weather sync skips that subdivision with an explicit note (never a silent skip, never an exception).

## Access by role

| Role | What they can do |
|---|---|
| [[admin]] | Sets/edits the subdivision's coordinates in the Settings screen for their own tenant. |
| [[superadmin]] | Sets coordinates for any tenant via the config/admin surface. |
| [[sqladmin-operator]] | Edits `lat`/`lon` directly in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |
| [[member]] | No access — read-only consumer of downstream context only. |

Tenant-scoped: coordinates belong to a subdivision within its organization ([[multitenancy]]).

## Involved entities

- [[subdivisions]] — gains `lat`/`lon`; these feed the `get_daily`/`get_forecast` calls in [[LCOS-F50-weather]].

## Dependencies / links

- **Requirements:** [[multitenancy]] (coordinates scoped to a subdivision inside its org).
- **Features:** prerequisite for [[LCOS-F50-weather]]; indirectly supports [[LCOS-F53-digest-enrichment]].

## Acceptance criteria

Acceptance criteria: TBD (Phase 2 — detailed on activation).

## Sources

- `plan/PHASE_F6_LOCAL_CONTEXT.md §1` — F6-B2 (subdivision `lat`/`lon`, edited in SQLAdmin + Settings, missing-coords skip).
- `plan/00_IMPLEMENTATION_PLAN.md F6`.
