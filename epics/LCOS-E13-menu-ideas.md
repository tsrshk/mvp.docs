---
id: LCOS-E13
type: epic
title: Cross-recipe menu ideas
status: future
phase: "Phase 2"
features: ["[[LCOS-F61-menu-idea-generation]]", "[[LCOS-F62-menu-ideas-ui]]"]
legacy_refs: [plan F9]
sources: [plan/00_IMPLEMENTATION_PLAN.md F9, 06_STRATEGY.md]
updated: 2026-07-09
---

# LCOS-E13 · Cross-recipe menu ideas

**Status:** 🔭 future · **Phase:** Phase 2

## Description

Generating menu ideas at the intersection of the available ingredients/recipes (use what is already purchased and sitting in stock) and a UI with their statuses (proposed / in progress / accepted / rejected). The AI proposes dishes/items that reduce write-offs and use already-paid-for ingredients.

## Goal / value

Turn data on stock levels ([[LCOS-E7-stock]]) and consumption ([[LCOS-E9-sales-analytics]]) into concrete proposals that increase margin and cut write-offs — again "the AI does the work" rather than showing a report.

## Features

| ID | Name | Status | Link |
|---|---|---|---|
| LCOS-F61 | Menu idea generation | 🔭 future | [[LCOS-F61-menu-idea-generation]] |
| LCOS-F62 | Menu ideas UI + statuses | 🔭 future | [[LCOS-F62-menu-ideas-ui]] |

## Key entities / requirements

- Entities: [[ingredients]], [[stock_levels]]; future menu_ideas table — stub.
- Requirements: [[provider-abstraction]], [[vpn-egress]], [[multitenancy]].
- Roles: [[member]] (accepts/rejects ideas), [[admin]].

## Gates

- **The human confirms:** an idea is a proposal, the owner decides on adding it to the menu.
- AC: TBD (Phase 2).

## legacy_refs

plan F9.

## Sources

- plan/00_IMPLEMENTATION_PLAN.md F9, 06_STRATEGY.md
