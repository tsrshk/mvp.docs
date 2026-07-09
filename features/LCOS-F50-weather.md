---
id: LCOS-F50
type: feature
title: Weather provider + storage
epic: "[[LCOS-E10-local-context]]"
status: future
phase: "Phase 2"
roles: [member, admin, superadmin, sqladmin-operator]
entities: ["[[subdivisions]]", "[[integration_credentials]]", "[[system_settings]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[config-secrets]]", "[[secret-encryption]]"]
adrs: ["[[ADR-009]]", "[[ADR-006]]"]
legacy_refs: [plan F6, "plan F6-B1", "plan F6-B3"]
sources: ["plan/PHASE_F6_LOCAL_CONTEXT.md §1 (F6-B1, F6-B3)", "plan/00_IMPLEMENTATION_PLAN.md F6"]
updated: 2026-07-09
---
# LCOS-F50 · Weather provider + storage
**Epic:** [[LCOS-E10-local-context]] · **Status:** future · **Phase:** Phase 2

## Description

Pulls daily weather (actuals + short forecast) for each subdivision so that sales anomalies can later be explained by external factors rather than left to guesswork. A new provider seam `WeatherProvider` (one implementation, `openweather`) mirrors the OCR/ERP registry pattern from [[LCOS-E1-platform]]: the domain DTO `WeatherDay` carries `date`, `temp_min/max`, `precipitation_mm`, `condition`, and optional `wind`. Egress is a direct client call (the weather API is not an AI provider, so `requires_vpn=False`), governed by the platform egress policy ([[vpn-egress]]).

A once-a-day sync job (hosted in the [[LCOS-E9-sales-analytics]] scheduler) fetches yesterday's actuals plus a 7–14 day forecast into `weather_days`; forecast rows are later overwritten by actuals. The job is gated behind a REGISTRY flag (`weather_sync_enabled`, default off until a key is configured) and consumes the subdivision coordinates from [[LCOS-F51-coordinates]]. The API key is stored as a platform-scoped `integration_credentials` secret (encrypted `enc:v2:*`); with no key, the sync fails with an explicit `sync_run` error (fail-closed) while the app stays up.

## Capabilities

- `WeatherProvider` protocol + `openweather` implementation behind a registry (one implementation only — see [[provider-abstraction]]).
- Daily sync: actuals for yesterday + 7–14 day forecast, idempotent per `(subdivision_id, date)`, forecast rows overwritten by actuals.
- `weather_days` storage (subdivision-scoped): `date`, `temp_min/max`, `precipitation_mm`, `condition`, `is_forecast`.
- Fail-closed on missing key/credential: explicit error surfaced in `sync_run`, no silent env fallback.
- Runtime-tunable schedule/enable via config registry (`weather_sync_enabled`), no redeploy.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Consumes weather context indirectly via the digest ([[LCOS-F53-digest-enrichment]]); no direct control. |
| [[admin]] | Same; ensures subdivision coordinates are set so the sync runs ([[LCOS-F51-coordinates]]). |
| [[superadmin]] | Sets the OpenWeather key and toggles `weather_sync_enabled` via the config API across tenants. |
| [[sqladmin-operator]] | Stores/rotates the OpenWeather credential and edits sync flags in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

Tenant-scoped: `weather_days` is isolated per subdivision ([[multitenancy]]).

## Involved entities

- [[subdivisions]] — supplies `lat`/`lon` for the fetch; a subdivision without coordinates is skipped with an explicit `sync_run` note.
- [[integration_credentials]] — platform-scoped `openweather` key, Fernet-encrypted (`enc:v2:*`); read backend-only.
- [[system_settings]] — registry flags/schedule (`weather_sync_enabled`) resolved at runtime.
- `weather_days` (future subdivision-scoped table) — the weather store; entity doc to be created on activation.

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (weather seam + registry, one implementation), [[fail-closed]] (missing key → explicit `sync_run` error, app stays up), [[config-secrets]] + [[secret-encryption]] (key stored encrypted, no env fallback).
- **Features:** feeds [[LCOS-F53-digest-enrichment]]; consumes coordinates from [[LCOS-F51-coordinates]]; sync runs inside the [[LCOS-F47-scheduler]] job.
- **ADR:** [[ADR-009]] (provider seam, one implementation), [[ADR-006]] (egress policy / fail-closed).

## Acceptance criteria

Acceptance criteria: TBD (Phase 2 — detailed on activation).

## Sources

- `plan/PHASE_F6_LOCAL_CONTEXT.md §1` — F6-B1 (weather provider seam, `openweather`, key + fail-closed), F6-B3 (`weather_days` storage + sync job).
- `plan/00_IMPLEMENTATION_PLAN.md F6`.
