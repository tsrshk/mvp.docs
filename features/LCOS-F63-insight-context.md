---
id: LCOS-F63
type: feature
title: Insight context builder
epic: "[[LCOS-E14-strategic-insights]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin]
entities: ["[[ingredients]]", "[[suppliers]]", "[[subdivisions]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[multitenancy]]", "[[config-secrets]]"]
adrs: ["[[ADR-003]]"]
legacy_refs: [plan F10, "plan F10-B1"]
sources: ["plan/PHASE_F10_STRATEGIC_INSIGHTS.md §1 F10-B1", "plan/PHASE_F10_STRATEGIC_INSIGHTS.md (dependencies)"]
updated: 2026-07-09
---
# LCOS-F63 · Insight context builder
**Epic:** [[LCOS-E14-strategic-insights]] · **Status:** future · **Phase:** Phase 2

## Description

The deterministic core of the strategic-insights epic: an `InsightContextBuilder` service that assembles a compact, structured snapshot of one subdivision over a rolling window of N weeks. It draws from every lower module that is present — sales and anomalies ([[LCOS-E9-sales-analytics]]), supplier price changes and alerts ([[LCOS-E4-suppliers]]), position vs. the neighborhood ([[LCOS-E11-competitor-menu]]), review trends ([[LCOS-E12-competitor-reviews]]), and accepted/rejected menu ideas ([[LCOS-E13-menu-ideas]]).

The builder is a **pure function of the database** (no LLM call), so it is unit-tested independently of any model. It degrades gracefully: a module that is absent or has no data simply has its section omitted, with an explicit note left in the context so downstream reasoning knows the gap exists rather than hallucinating around it.

The context obeys a strict size budget — aggregates and top-N summaries, never raw rows — governed by `insight_context_weeks` (config registry, default 4). This is the shared input consumed by the weekly session ([[LCOS-F64-weekly-questions]]) and the free-form dialog ([[LCOS-F65-freeform-dialog]]), where it is frozen into each session's `context_snapshot` for auditability.

## Capabilities

- Assemble a per-subdivision context over a configurable N-week window (`insight_context_weeks`, default 4).
- Aggregate-only budget: top-N and rolled-up figures, never raw line rows, to bound token cost.
- Graceful degradation: a missing module's section is dropped with an explicit "not available" marker.
- Pure DB → structure transform, testable without any LLM (matches the [[LCOS-F45-sales-read]] "builder is a pure function" pattern).
- Produces the exact structure later frozen as `context_snapshot` for [[LCOS-F64-weekly-questions]] audit.

## Access by role

| Role | What they can do |
|---|---|
| [[admin]] | No direct interaction; the context they see is surfaced indirectly through [[LCOS-F64-weekly-questions]] and [[LCOS-F65-freeform-dialog]]. |
| [[superadmin]] | Same across all tenants; tunes `insight_context_weeks` and module enable flags via the config API. |
| [[member]] | Not involved. |
| [[sqladmin-operator]] | Sets `insight_context_weeks` and module gates in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

## Involved entities

- [[subdivisions]] — the tenant scope; every context is built for exactly one subdivision.
- [[ingredients]] — catalog referenced when summarizing consumption/stock signals.
- [[suppliers]] — source of price-change and delivery-terms signals folded into the context.
- Phase-2 read models (sales aggregates, weather/events, competitor and review tables, menu-idea statuses) are consumed here but owned by their respective epics; they are not new entities of this feature.

## Dependencies / links

- **Requirements:** [[multitenancy]] (context is strictly subdivision-scoped), [[config-secrets]] (`insight_context_weeks` and module flags via the three-level config), [[provider-abstraction]] (this feature stays LLM-free; the seam is used only by its consumers), [[fail-closed]] (a missing module is an explicit omission, never a silent guess).
- **Features:** consumed by [[LCOS-F64-weekly-questions]] and [[LCOS-F65-freeform-dialog]]; draws data produced by [[LCOS-E9-sales-analytics]], [[LCOS-E10-local-context]], [[LCOS-E11-competitor-menu]], [[LCOS-E12-competitor-reviews]], [[LCOS-E13-menu-ideas]].
- **Epics / gates:** part of [[LCOS-E14-strategic-insights]]; the epic closes Phase 1 and feeds the Pilot-Gate check ([[ADR-003]]).

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). Draft direction: full-module fixtures return all sections; missing-module fixtures omit sections cleanly; the builder is covered by unit tests with no LLM in the loop.

## Sources

- `plan/PHASE_F10_STRATEGIC_INSIGHTS.md §1 F10-B1` (deterministic `InsightContextBuilder`, N-week window, aggregate/top-N budget, `insight_context_weeks` default 4, missing-module omission, LLM-free testing).
- `plan/PHASE_F10_STRATEGIC_INSIGHTS.md` (dependencies: graceful degradation, max value with F4+F5+F6+F7+F8, formal minimum F5).
