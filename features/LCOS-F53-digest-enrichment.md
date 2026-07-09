---
id: LCOS-F53
type: feature
title: Digest anomaly enrichment
epic: "[[LCOS-E10-local-context]]"
status: future
phase: "Phase 2"
roles: [member, admin, superadmin]
entities: ["[[subdivisions]]", "[[system_settings]]"]
requirements: ["[[provider-abstraction]]", "[[multitenancy]]"]
adrs: []
legacy_refs: [plan F6, "plan F6-B4", "plan F6-F2"]
sources: ["plan/PHASE_F6_LOCAL_CONTEXT.md §1 (F6-B4), §2 (F6-F2)", "plan/00_IMPLEMENTATION_PLAN.md F6"]
updated: 2026-07-09
---
# LCOS-F53 · Digest anomaly enrichment
**Epic:** [[LCOS-E10-local-context]] · **Status:** future · **Phase:** Phase 2

## Description

Closes the local-context loop: for each anomalous sales day flagged by the weekly digest ([[LCOS-F48-weekly-digest]] in [[LCOS-E9-sales-analytics]]), attach a plausible external cause from weather ([[LCOS-F50-weather]]) and events ([[LCOS-F52-local-events]]). Correlation is **deterministic, not LLM-based**: a day is anomalous when it deviates >±20% from the 4-week average for the same weekday, and context is attached when precipitation exceeds a threshold, temperature deviates beyond a threshold, or an event overlaps the day.

The digest `metrics` gain `anomalies[{date, delta_pct, context[]}]` and `upcoming[{date, kind, title}]` (events + extreme forecast for the coming week). The digest's LLM text (from the sales-analytics digest feature) receives only this pre-computed data and may reference context **only** from it — the same anti-hallucination discipline used elsewhere ([[provider-abstraction]]). Anomaly thresholds (`anomaly_rain_mm` default 5, `anomaly_temp_delta` default 8) and the schedule are tunable via the config registry with no redeploy. When no cause is found, the digest states "cause not found" rather than inventing one.

## Capabilities

- Deterministic anomaly detection (>±20% vs same-weekday 4-week average) — no LLM in the correlation step.
- Context attachment from `weather_days` (rain/temp thresholds) and `local_events` (overlap).
- Digest `metrics` extended with `anomalies[]` and `upcoming[]` (events + extreme forecast next week).
- Anti-hallucination: LLM digest text may cite only context present in `metrics`; explicit "cause not found" when empty.
- Runtime-tunable thresholds via config registry (`anomaly_rain_mm`, `anomaly_temp_delta`).
- FE: anomaly block ("Thu −30% · rain 12 mm"), "Next week" block (events + forecast), per-day weather in detail view via `context/days`.
- `GET /api/v1/context/days?from=&to=` — weather + events for the UI.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Reads the enriched digest (anomaly explanations + upcoming warnings). |
| [[admin]] | Same; also curates the inputs via [[LCOS-F51-coordinates]] and [[LCOS-F52-local-events]]. |
| [[superadmin]] | Tunes anomaly thresholds/schedule via the config API across tenants. |
| [[sqladmin-operator]] | Adjusts thresholds/registry flags in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

Tenant-scoped: enrichment reads only the subdivision's own weather/events ([[multitenancy]]).

## Involved entities

- [[subdivisions]] — scope for the digest and its context inputs.
- [[system_settings]] — anomaly thresholds and schedule resolved at runtime.
- `weather_days`, `local_events` (future subdivision-scoped tables) — the context sources; entity docs to be created on activation.

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (LLM text confined to pre-computed metrics — anti-hallucination), [[multitenancy]] (per-subdivision context only).
- **Features:** enriches [[LCOS-F48-weekly-digest]] ([[LCOS-E9-sales-analytics]]); consumes [[LCOS-F50-weather]] and [[LCOS-F52-local-events]]; depends on [[LCOS-F51-coordinates]] for the weather feed.

## Acceptance criteria

Acceptance criteria: TBD (Phase 2 — detailed on activation).

## Sources

- `plan/PHASE_F6_LOCAL_CONTEXT.md §1` — F6-B4 (deterministic correlation, `anomalies`/`upcoming` metrics, anti-hallucination, `context/days` API), `§2` — F6-F2 (anomaly + next-week blocks, per-day weather).
- `plan/00_IMPLEMENTATION_PLAN.md F6`.
