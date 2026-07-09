---
id: LCOS-E10
type: epic
title: Local context — weather and events
status: future
phase: "Phase 2"
features: ["[[LCOS-F50-weather]]", "[[LCOS-F51-coordinates]]", "[[LCOS-F52-local-events]]", "[[LCOS-F53-digest-enrichment]]"]
legacy_refs: [plan F6]
sources: [plan/00_IMPLEMENTATION_PLAN.md F6, 06_STRATEGY.md]
updated: 2026-07-09
---

# LCOS-E10 · Local context — weather and events

**Status:** 🔭 future · **Phase:** Phase 2

## Description

Enriching analytics with external local context: a weather provider + storage, subdivision coordinates, local events (manual entry), and enrichment of anomalies in the digest ("sales dropped — it rained / there was a concert nearby"). The goal is for the AI manager's suggestions to account for what a human sees but the bare POS numbers do not.

## Goal / value

Increase the relevance of the digest ([[LCOS-E9-sales-analytics]]) and order proposals: explain demand anomalies through external factors instead of leaving the owner guessing.

## Features

| ID | Name | Status | Link |
|---|---|---|---|
| LCOS-F50 | Weather provider + storage | 🔭 future | [[LCOS-F50-weather]] |
| LCOS-F51 | Subdivision coordinates | 🔭 future | [[LCOS-F51-coordinates]] |
| LCOS-F52 | Local events (manual entry) | 🔭 future | [[LCOS-F52-local-events]] |
| LCOS-F53 | Anomaly enrichment in the digest | 🔭 future | [[LCOS-F53-digest-enrichment]] |

## Key entities / requirements

- Entities: [[subdivisions]] (coordinates); future weather/events tables — stubs.
- Requirements: [[provider-abstraction]], [[vpn-egress]], [[multitenancy]].
- Roles: [[admin]] (enters events/coordinates), [[member]].

## Gates

- **Weather provider behind a seam:** external call through the VPN egress policy ([[vpn-egress]], [[ADR-006]]).
- AC: TBD (Phase 2).

## legacy_refs

plan F6.

## Sources

- plan/00_IMPLEMENTATION_PLAN.md F6, 06_STRATEGY.md
