---
id: LCOS-E11
type: epic
title: Competitor menu and prices
status: future
phase: "Phase 2"
features: ["[[LCOS-F54-competitor-directory]]", "[[LCOS-F55-menu-ocr]]", "[[LCOS-F56-positioning]]", "[[LCOS-F57-places-prefill]]"]
legacy_refs: [plan F7, 07 Э7/Э8]
sources: [plan/00_IMPLEMENTATION_PLAN.md F7, 07_PHASES.md Э7/Э8, 06_STRATEGY.md]
updated: 2026-07-09
---

# LCOS-E11 · Competitor menu and prices

**Status:** 🔭 future · **Phase:** Phase 2

## Description

Competitive positioning: a competitor directory, menu OCR (doc-type `menu` — reuses the provider OCR seam from [[LCOS-E2-invoice-intake]] / [[LCOS-E6-ocr-quality]]), neighborhood comparison and price positioning, and optional prefill from Google Places. The goal is to give the owner an answer to "how do I look next to my neighbors."

## Goal / value

Extend the AI manager from the internal routine to the external market: suggestions on prices and assortment relative to the nearest competitors. Feeds menu ideas ([[LCOS-E13-menu-ideas]]) and the strategic dialog ([[LCOS-E14-strategic-insights]]).

## Features

| ID | Name | Status | Link |
|---|---|---|---|
| LCOS-F54 | Competitor directory | 🔭 future | [[LCOS-F54-competitor-directory]] |
| LCOS-F55 | Menu OCR (doc-type menu) | 🔭 future | [[LCOS-F55-menu-ocr]] |
| LCOS-F56 | Neighborhood comparison/positioning | 🔭 future | [[LCOS-F56-positioning]] |
| LCOS-F57 | Google Places prefill (optional) | 🔭 future | [[LCOS-F57-places-prefill]] |

## Key entities / requirements

- Entities: future competitor/menu tables — stubs; reuses the OCR infrastructure of the [[invoices]] flow.
- Requirements: [[provider-abstraction]], [[vpn-egress]], [[multitenancy]].
- Roles: [[admin]] (maintains competitors), [[member]].

## Gates

- **doc-type extensibility:** the OCR seam must accept a new document type `menu` without rewriting the provider ([[ADR-009]]).
- AC: TBD (Phase 2).

## legacy_refs

plan F7; 07 Э7/Э8.

## Sources

- plan/00_IMPLEMENTATION_PLAN.md F7, 07_PHASES.md Э7/Э8, 06_STRATEGY.md
