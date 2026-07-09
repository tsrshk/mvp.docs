---
id: LCOS-F56
type: feature
title: Neighborhood comparison / positioning
epic: "[[LCOS-E11-competitor-menu]]"
status: future
phase: "Phase 2"
roles: [member, admin, superadmin]
entities: ["[[system_settings]]"]
requirements: ["[[sku-identity-resolver]]", "[[erp-esupl-integration]]", "[[multitenancy]]"]
adrs: ["[[ADR-009]]"]
legacy_refs: [plan F7, "plan F7-B3", "plan F7-F1", 07 Э8]
sources: ["plan/PHASE_F7_COMPETITORS_MENU.md §1 (F7-B3), §2 (F7-F1)", "07_PHASES.md Э8", "plan/00_IMPLEMENTATION_PLAN.md F7"]
updated: 2026-07-09
---
# LCOS-F56 · Neighborhood comparison / positioning
**Epic:** [[LCOS-E11-competitor-menu]] · **Status:** future · **Phase:** Phase 2

## Description

The payoff of the epic: answer "how do my prices look against the neighborhood?" per position. `GET /api/v1/competitors/compare?position=<canonical_name>` returns our price (sourced from the Esupl menu via the read provider [[LCOS-F11-esupl-read]] when available, otherwise a manual "our price" field on the comparison position), the neighborhood average / min / max, and a per-competitor breakdown — computed only from the **latest** snapshot of each **active** competitor ([[LCOS-F55-menu-ocr]]). The report is built to drive a decision, not to hand over a table of numbers: e.g. "latte is 12% below market — consider +0.5".

Positions are joined on a `canonical_name` assigned when a snapshot is confirmed — a fuzzy suggestion (reusing the `rankSkus` approach from [[LCOS-F13-sku-identity-resolver]] on the backend, or a simple Jaccard) plus manual confirmation. Items left with `canonical_name = NULL` do not enter comparison. A quarterly "refresh the base" reminder is generated as an alert (the config-registry alert mechanism) for competitors whose `captured_on` is older than `competitor_staleness_days` (REGISTRY, default 90). The whole section is behind `module_competitors_enabled`. Actual price changes stay manual — the product only informs.

## Capabilities

- `GET /competitors/compare?position=<canonical_name>` — our price + neighborhood avg/min/max + per-competitor rows.
- Our price resolved from the Esupl menu via [[LCOS-F11-esupl-read]] when available; manual "our price" fallback otherwise.
- Comparison window: latest snapshot of each active competitor only (historical snapshots excluded from the current view).
- `canonical_name` mapping at snapshot confirmation: fuzzy suggestion (`rankSkus`-style) + manual confirm; `NULL` items excluded from comparison.
- Decision-oriented recommendations with accept/reject actions (positioning report, not a raw number grid).
- Quarterly staleness alert for competitors older than `competitor_staleness_days` (REGISTRY default 90).
- Mobile-first comparison screen (`/positioning`), gated by `module_competitors_enabled`.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Views the neighborhood comparison / positioning report for their subdivision. |
| [[admin]] | Confirms `canonical_name` mappings, reviews recommendations, accepts/rejects suggested price moves (informational). |
| [[superadmin]] | Cross-tenant access; tunes `competitor_staleness_days` and the module gate via the config API. |
| [[sqladmin-operator]] | Adjusts the staleness threshold / module flag in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

Tenant-scoped: comparison reads only the organization's own competitors and snapshots ([[multitenancy]]).

## Involved entities

- [[system_settings]] — `competitor_staleness_days` (REGISTRY, default 90) and the `module_competitors_enabled` gate, resolved at runtime.
- `competitor_menu_items` (future) — the priced positions being compared; `canonical_name` is the join key.
- `competitor_menu_snapshots` (future) — supplies `captured_on` for the "latest / active" window and the staleness alert; entity docs created on activation.

## Dependencies / links

- **Requirements:** [[sku-identity-resolver]] (reuse the `rankSkus` fuzzy-matching approach for `canonical_name` suggestions), [[erp-esupl-integration]] (our menu price sourced read-only from Esupl), [[multitenancy]] (org-scoped comparison).
- **Features:** consumes snapshots from [[LCOS-F55-menu-ocr]] and cards from [[LCOS-F54-competitor-directory]]; our price via [[LCOS-F11-esupl-read]]; gated by [[LCOS-F6-module-gates]]; feeds [[LCOS-E13-menu-ideas]] and [[LCOS-E14-strategic-insights]].
- **ADR:** [[ADR-009]] (reuse of the matching seam / provider abstraction).

## Acceptance criteria

Acceptance criteria: TBD (Phase 2 — detailed on activation).

## Sources

- `plan/PHASE_F7_COMPETITORS_MENU.md §1` — F7-B3 (compare endpoint, `canonical_name` mapping, quarterly staleness alert, module gate), `§2` — F7-F1 (comparison screen, mobile-first).
- `07_PHASES.md Э8` (positioning report: own menu ↔ competitor items matching, per-position price comparison, decision-oriented recommendations, ≥60% auto-match kill-criterion).
- `plan/00_IMPLEMENTATION_PLAN.md F7`.
