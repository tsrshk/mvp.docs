---
id: LCOS-E12
type: epic
title: Competitor reviews
status: future
phase: "Phase 2"
features: ["[[LCOS-F58-review-storage]]", "[[LCOS-F59-review-analysis]]", "[[LCOS-F60-reviews-api]]"]
legacy_refs: [plan F8]
sources: [plan/00_IMPLEMENTATION_PLAN.md F8, 06_STRATEGY.md]
updated: 2026-07-09
---

# LCOS-E12 · Competitor reviews

**Status:** 🔭 future · **Phase:** Phase 2

## Description

Collecting and analyzing competitor reviews: storage + review ingestion, AI analysis (themes, sentiment, strengths/weaknesses), a reviews API + a digest section + an alert on a spike of negativity. Complements menu/prices ([[LCOS-E11-competitor-menu]]) with a qualitative market signal.

## Goal / value

Give the owner an understanding of what the neighbors are praised and criticized for — an input for menu and service decisions. A negative alert turns passive data into action.

## Features

| ID | Name | Status | Link |
|---|---|---|---|
| LCOS-F58 | Review storage + ingestion | 🔭 future | [[LCOS-F58-review-storage]] |
| LCOS-F59 | AI review analysis | 🔭 future | [[LCOS-F59-review-analysis]] |
| LCOS-F60 | Reviews API + digest section + negative alert | 🔭 future | [[LCOS-F60-reviews-api]] |

## Key entities / requirements

- Entities: future review tables — stubs; linked to the competitor directory [[LCOS-E11-competitor-menu]].
- Requirements: [[provider-abstraction]], [[vpn-egress]], [[multitenancy]].
- Roles: [[admin]], [[member]].

## Gates

- **AI analysis behind a seam:** sentiment/themes through the provider LLM seam ([[ADR-009]], [[ADR-012]]).
- AC: TBD (Phase 2).

## legacy_refs

plan F8.

## Sources

- plan/00_IMPLEMENTATION_PLAN.md F8, 06_STRATEGY.md
