---
id: LCOS-F62
type: feature
title: Menu ideas UI + statuses
epic: "[[LCOS-E13-menu-ideas]]"
status: future
phase: "Phase 2"
roles: [member, admin, superadmin]
entities: ["[[ingredients]]", "[[packings]]"]
requirements: ["[[multitenancy]]", "[[provider-abstraction]]"]
adrs: []
legacy_refs: [plan F9, "plan F9-F1"]
sources: ["plan/PHASE_F9_CROSS_RECIPE.md §2 (F9-F1 Menu Ideas page)", "plan/00_IMPLEMENTATION_PLAN.md §4"]
updated: 2026-07-09
---
# LCOS-F62 · Menu ideas UI + statuses
**Epic:** [[LCOS-E13-menu-ideas]] · **Status:** future · **Phase:** Phase 2

## Description

The frontend of the cross-recipe epic: a "Menu ideas" page where the owner triggers generation and reviews the proposals produced by [[LCOS-F61-menu-idea-generation]] as idea cards. Each card shows the composition (which SKUs are already on hand ✓ vs. what must be bought, with a price estimate), the code-computed cost of on-hand ingredients, the suggested selling price, the rationale, and — when [[LCOS-E11-competitor-menu]] data exists — a neighborhood price benchmark. The page keeps the "idea ≠ action" discipline (Gate G7): it presents proposals, and the owner decides what actually enters the menu.

Each idea carries a lifecycle status the user drives from the card: 👍 liked, hide (dismissed), or "added to the menu" (adopted). These statuses persist via `PATCH /api/v1/menu-ideas/{id}` and feed the epic's stage metric (≥3 ideas a month with rationale; ≥1 position actually adopted per quarter). Generation is only ever launched by an explicit button press — no automatic refresh — and a mock provider supplies demo ideas so the page can be built without a live LLM.

## Capabilities

- "Menu ideas" page with a "Propose ideas" button plus optional `season` / `focus` selectors.
- Idea cards rendering composition (on-hand ✓ vs. to-buy + estimate), computed cost, suggested price, rationale, and neighborhood benchmark when available.
- Per-card status actions: 👍 (liked) / hide (dismissed) / "added to menu" (adopted), persisted via `PATCH /api/v1/menu-ideas/{id}`.
- Status-filtered list backed by `GET /api/v1/menu-ideas?status=`.
- Section hidden when `module_menu_ideas_enabled` is off; clear error surface when the AI is unavailable / VPN down (`503`) while previously generated ideas remain readable.
- Over-limit generation (daily cap) shown as an explicit message rather than a silent failure.
- Mock provider renders demo ideas for development without a real backend LLM call.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Open the page, trigger generation, and view ideas within their subdivision/organization. |
| [[admin]] | Drives idea lifecycle: marks liked / dismissed / adopted; primary owner of the page. |
| [[superadmin]] | Cross-tenant access; controls the module gate / daily limit via the config API. |
| [[sqladmin-operator]] | Not involved in the UI; only flips the gate in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

Tenant-scoped: ideas shown belong to the active organization; the scope comes from the JWT context ([[auth]], [[multitenancy]]).

## Involved entities

- [[ingredients]] — cards reference on-hand SKUs; the ✓ / to-buy split is derived from the catalog.
- [[packings]] — packing granularity behind the displayed cost figures.
- `menu_ideas` (future organization-scoped table) — the source of card content and the `status` mutated by the UI actions; entity doc created on activation.

## Dependencies / links

- **Requirements:** [[multitenancy]] (org-scoped ideas), [[provider-abstraction]] (backend/mock provider behind the "Propose ideas" action).
- **Features:** renders the output of [[LCOS-F61-menu-idea-generation]]; benchmark column depends on [[LCOS-F56-positioning]]; gated by [[LCOS-F6-module-gates]]; built on the [[LCOS-F7-frontend-platform]] (FSD/RTK/PWA) foundation.
- **Epic siblings:** part of [[LCOS-E13-menu-ideas]]; status metric feeds strategic review in [[LCOS-E14-strategic-insights]].

## Acceptance criteria

Acceptance criteria: TBD (Phase 2 — detailed on activation). On activation, drafts cover: card composition/cost/benchmark rendering; status change persistence (test + browser verification); over-limit and `503` error surfaces; generation only on user click; and tenant-scoped listing.

## Sources

- `plan/PHASE_F9_CROSS_RECIPE.md §2` — F9-F1 (Menu Ideas page: propose button, idea cards with composition/cost/price/rationale/benchmark, liked/dismissed/adopted statuses feeding the stage metric, mock provider).
- `plan/00_IMPLEMENTATION_PLAN.md §4` (human-triggered AI, module gates, fail-closed envelope).
