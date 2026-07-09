---
id: LCOS-E14
type: epic
title: Strategic insights and weekly dialog
status: future
phase: "Phase 2"
features: ["[[LCOS-F63-insight-context]]", "[[LCOS-F64-weekly-questions]]", "[[LCOS-F65-freeform-dialog]]"]
legacy_refs: [plan F10]
sources: [plan/00_IMPLEMENTATION_PLAN.md F10, 06_STRATEGY.md]
updated: 2026-07-09
---

# LCOS-E14 · Strategic insights and weekly dialog

**Status:** 🔭 future · **Phase:** Phase 2

## Description

The top layer of the AI manager: an insight context builder (combines stock, sales, local context, competitors), a weekly "3 questions" session (the AI asks the owner the three key questions of the week), and free-form dialog. Here the product gets a chat-like interface for the first time — per the strategy's dev stop-list, a chat UI is not built before this step.

## Goal / value

Close the product promise — "an AI manager you talk to about the business." This is the routine-ladder step that provides long-term lock-in: a weekly strategic contact resting on all the epics below.

## Features

| ID | Name | Status | Link |
|---|---|---|---|
| LCOS-F63 | Insight context builder | 🔭 future | [[LCOS-F63-insight-context]] |
| LCOS-F64 | Weekly "3 questions" session | 🔭 future | [[LCOS-F64-weekly-questions]] |
| LCOS-F65 | Free-form dialog | 🔭 future | [[LCOS-F65-freeform-dialog]] |

## Key entities / requirements

- Entities: aggregates data from [[stock_levels]], [[ingredients]], [[suppliers]], and Phase-2 sales/context tables.
- Requirements: [[provider-abstraction]], [[vpn-egress]], [[multitenancy]], [[fail-closed]].
- Roles: [[admin]] (conducts the dialog), [[member]].

## Gates

- **Dev stop-list (06_STRATEGY):** chat UI not before this step — do not build the dialog prematurely.
- AC: TBD (Phase 2).

## legacy_refs

plan F10.

## Sources

- plan/00_IMPLEMENTATION_PLAN.md F10, 06_STRATEGY.md
