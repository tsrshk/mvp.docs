---
id: LCOS-F47
type: feature
title: Scheduler + sync job
epic: "[[LCOS-E9-sales-analytics]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin]
entities: ["[[system_settings]]", "[[integration_credentials]]", "[[organizations]]", "[[subdivisions]]"]
requirements: ["[[config-secrets]]", "[[fail-closed]]", "[[provider-abstraction]]"]
adrs: []
legacy_refs: [plan F5-B3, 07 Э6, plan §6 Q3]
sources: ["plan/PHASE_F5_SALES_ANALYTICS.md §1 F5-B3", "07_PHASES.md Э6"]
updated: 2026-07-09
---
# LCOS-F47 · Scheduler + sync job
**Epic:** [[LCOS-E9-sales-analytics]] · **Status:** future · **Phase:** Phase 2

## Description

The background scheduling backbone for analytics — the first recurring job in the product (batch/queues are a non-goal in Phase 1, they appear here). An in-process scheduler (planned: APScheduler `AsyncIOScheduler` started in the FastAPI `lifespan`, single process for Phase 1 — to be captured in a dedicated ADR, plan §6 Q3) runs `SalesSyncService.sync(organization, subdivision)` on a configurable interval and drives digest generation.

All schedules and enable flags live in the `system_settings` registry so they change without redeploy: `sales_sync_enabled` (bool, default `False` — turned on only after the POS token is configured), `sales_sync_interval_hours` (default 6), `digest_weekday`/`digest_hour` (default Mon/9). The sync is incremental from the last successful point with a 1-day overlap window, upserts by `external_id`, and recomputes `daily_aggregates`. A `sync_runs` journal (org-scoped: `kind`, `started_at`, `finished_at`, `status`, `error?`, `records_upserted`) gives "is the sync alive" visibility in SQLAdmin.

## Capabilities

- In-process scheduler in `lifespan` (APScheduler, single process; ADR pending) driving sales sync and digest jobs.
- Schedules/flags in `system_settings` REGISTRY, editable from SQLAdmin without redeploy.
- `SalesSyncService.sync`: incremental from last success (1-day overlap), upsert by `external_id`, recompute affected `daily_aggregates`.
- `sync_runs` journal for run visibility (status, error text, rows upserted).
- Fail-closed: no POS token / Esupl unreachable → `sync_run` marked `failed` with error text; app stays up; no retries more often than the schedule; next attempt on schedule.

## Access by role

| Role | What they can do |
|---|---|
| [[admin]] | Trigger "sync now" for their subdivision (`POST /api/v1/sales/sync`, requires subdivision admin). |
| [[superadmin]] | Same across tenants; configures the POS token that gates enabling sync. |
| [[member]] | No control; consumes synced data downstream. |
| [[sqladmin-operator]] | Edits schedule/enable flags in `system_settings` and inspects `sync_runs` in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

## Involved entities

- [[system_settings]] — registry holding `sales_sync_enabled`, `sales_sync_interval_hours`, `digest_weekday`/`digest_hour` (resolver-read, no redeploy).
- [[integration_credentials]] — POS token the sync requires; absent → fail-closed failed run.
- [[organizations]] / [[subdivisions]] — the `sync_runs` journal is org-scoped; sync runs per subdivision.
- New table `sync_runs` is defined here (Phase 2 stub, no standalone entity doc yet).

## Dependencies / links

- **Requirements:** [[config-secrets]] (three-level config/registry read without redeploy), [[fail-closed]] (missing token / ERP down → failed run, no silent skip, no tight retry), [[provider-abstraction]] (sync calls the `ErpProvider` reads from [[LCOS-F45-sales-read]]).
- **Features:** schedules [[LCOS-F45-sales-read]] → [[LCOS-F46-sales-storage]], and triggers [[LCOS-F48-weekly-digest]] generation.
- **Epics:** [[LCOS-E9-sales-analytics]]. New scheduler ADR (Q3) to be added under [[index]] on activation.

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). Scheduler ADR, "flags change without redeploy", and fail-closed run behavior are drafted on activation.

## Sources

- `plan/PHASE_F5_SALES_ANALYTICS.md §1 F5-B3` (scheduler, registry flags, `sync_runs`, fail-closed).
- `07_PHASES.md Э6` (`sync_state` cursor, incremental + manual trigger).
