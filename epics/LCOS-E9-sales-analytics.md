---
id: LCOS-E9
type: epic
title: Sales analytics and digest
status: future
phase: "Phase 2"
features: ["[[LCOS-F45-sales-read]]", "[[LCOS-F46-sales-storage]]", "[[LCOS-F47-scheduler]]", "[[LCOS-F48-weekly-digest]]", "[[LCOS-F49-reorder-suggestion]]"]
legacy_refs: [plan F5, 07 Э6]
sources: [07_PHASES.md Э6, plan/00_IMPLEMENTATION_PLAN.md F5, 06_STRATEGY.md]
updated: 2026-07-09
---

# LCOS-E9 · Sales analytics and digest

**Status:** 🔭 future · **Phase:** Phase 2 (after Pilot-Gate)

## Description

The first growth epic after passing the Pilot-Gate: reading sales from Esupl, storing them with daily aggregates, a scheduler for sync jobs, a weekly digest, and a `reorder_point` suggestion derived from actual consumption. This is the transition from "I do the data-entry work" to "I suggest based on data" — still within the AI-manager logic, not a dashboard: the digest arrives on its own and ends with an action.

## Goal / value

Close the consumption ↔ purchasing loop: the system sees what sells and how fast, and uses that to refine reorder points ([[LCOS-E7-stock]], [[LCOS-E8-purchasing]]). The digest is the product's regular contact with the owner that sustains the routine.

## Features

| ID | Name | Status | Link |
|---|---|---|---|
| LCOS-F45 | Sales read + history backfill | 🔭 future | [[LCOS-F45-sales-read]] |
| LCOS-F46 | Sales storage + daily aggregates | 🔭 future | [[LCOS-F46-sales-storage]] |
| LCOS-F47 | Scheduler + sync job | 🔭 future | [[LCOS-F47-scheduler]] |
| LCOS-F48 | Weekly digest | 🔭 future | [[LCOS-F48-weekly-digest]] |
| LCOS-F49 | `reorder_point` suggestion from consumption | 🔭 future | [[LCOS-F49-reorder-suggestion]] |

## Key entities / requirements

- Entities: [[ingredients]], [[stock_levels]], [[subdivisions]] (future sales/aggregate tables — stubs).
- Requirements: [[erp-esupl-integration]], [[provider-abstraction]], [[multitenancy]].
- Roles: [[member]], [[admin]].

## Gates

- **Kill-criteria (07 Э0):** sales depth < 3 months → backfill is trimmed to "from today forward".
- **Phase 1 non-goal:** scheduler/queues (Celery) — appears here, in Phase 2.
- AC: TBD (Phase 2) — detailed criteria are not developed until the checkpoint.

## legacy_refs

plan F5; 07 Э6.

## Sources

- 07_PHASES.md Э6, plan/00_IMPLEMENTATION_PLAN.md F5, 06_STRATEGY.md
