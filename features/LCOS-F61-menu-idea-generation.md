---
id: LCOS-F61
type: feature
title: Menu idea generation
epic: "[[LCOS-E13-menu-ideas]]"
status: future
phase: "Phase 2"
roles: [member, admin, superadmin]
entities: ["[[ingredients]]", "[[packings]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[vpn-egress]]", "[[multitenancy]]"]
adrs: []
legacy_refs: [plan F9, "plan F9-B1", "plan F9-B2"]
sources: ["plan/PHASE_F9_CROSS_RECIPE.md §1 (F9-B1 generation), §1 (F9-B2 API)", "plan/00_IMPLEMENTATION_PLAN.md §4"]
updated: 2026-07-09
---
# LCOS-F61 · Menu idea generation
**Epic:** [[LCOS-E13-menu-ideas]] · **Status:** future · **Phase:** Phase 2

## Description

The backend of the cross-recipe epic: on an explicit user click, the system proposes new menu positions built from ingredients the shop already buys, each with an economic rationale — what is already on hand, what must be bought and at roughly what price, and a suggested selling price. It answers the owner's recurring pain "what else can I add to the menu cheaply?" by turning the existing SKU catalog into concrete, costed ideas rather than another report. An idea is a proposal, not an action (Gate G7): the human decides, and a recipe is only finalized by tasting.

Generation is deliberately human-triggered — `POST /api/v1/menu-ideas/generate` — never scheduled or automatic, so there are no background LLM calls. `MenuIdeaService` builds the prompt context **deterministically** from the local SKU catalog ([[ingredients]] + [[packings]]), current prices (from [[LCOS-E4-suppliers]] / [[LCOS-F20-price-history]], latest non-stale), top sellers (from [[LCOS-E9-sales-analytics]] if present) and competitor positions (from [[LCOS-E11-competitor-menu]] if present), then makes a single `ai_complete` call under a strict JSON contract. Anti-hallucination mirrors the invoice matcher `_parse_matches`: any idea whose `uses_skus.ingredient_id` does not exist in the catalog is dropped wholesale. Cost for on-hand SKUs is recomputed in code from real prices (LLM numbers are never trusted); LLM prices are allowed only in `est_price_note` for missing ingredients and are flagged as estimates.

## Capabilities

- `POST /api/v1/menu-ideas/generate` — user-triggered generation with optional `season` / `focus`; one `ai_complete` call per request against the main model.
- Deterministic context assembly from local catalog, current SKU prices, and (when available) sales top-sellers and competitor menu prices.
- Strict JSON contract: `ideas[{title, description, uses_skus[{ingredient_id, qty_note}], missing_ingredients[{name, est_price_note}], selling_price_suggestion, rationale}]`.
- Anti-hallucination post-validation: ideas referencing non-existent `ingredient_id` are discarded entirely.
- Cost of on-hand SKUs recomputed in code (Decimal) from real prices; LLM price guesses confined to `est_price_note` and marked as estimates.
- Persistence to a future organization-scoped `menu_ideas` table (`OrganizationScopedMixin`, uuid pk): `title`, `description`, `payload` JSONB (full idea + costing), `status` (`new|liked|dismissed|adopted`), optional `season`, `created_at`, `generated_by_model`.
- Daily generation cap (`menu_ideas_daily_limit`, config registry, default 3) per Gate G11; over-limit returns a clear error.
- `GET /api/v1/menu-ideas?status=` and `PATCH /api/v1/menu-ideas/{id}` (status change) behind the module gate `module_menu_ideas_enabled`.
- Mock provider yields demo ideas for development without a live LLM.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Trigger generation and read ideas within their own subdivision/organization. |
| [[admin]] | Same as member; primary consumer maintaining idea statuses via [[LCOS-F62-menu-ideas-ui]]. |
| [[superadmin]] | Cross-tenant access; toggles `module_menu_ideas_enabled` and sets `menu_ideas_daily_limit` via the config API. |
| [[sqladmin-operator]] | Flips the module gate and daily limit in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]); not involved in generation. |

Tenant-scoped: `menu_ideas` is isolated per organization; the scope comes from the active JWT context ([[auth]], [[multitenancy]]).

## Involved entities

- [[ingredients]] — the SKU catalog that seeds context; `uses_skus.ingredient_id` must resolve here or the idea is dropped.
- [[packings]] — packing/price granularity used when recomputing on-hand cost in code.
- `menu_ideas` (future organization-scoped table) — the idea store with `payload` JSONB and lifecycle `status`; entity doc to be created on activation.

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (LLM behind the provider seam + mock), [[fail-closed]] and [[vpn-egress]] (AI unavailable / VPN down → `503` envelope, previously generated ideas still readable), [[multitenancy]] (org-scoped rows, tenant isolation).
- **Features:** reads the catalog from [[LCOS-F15-sku-catalog]] and prices from [[LCOS-F20-price-history]]; optionally enriched by [[LCOS-E9-sales-analytics]] top-sellers and [[LCOS-F56-positioning]] benchmarks; gated by [[LCOS-F6-module-gates]]; shares the human-triggered "propose" pattern with [[LCOS-F40-ai-order-proposal]]; consumed by [[LCOS-F62-menu-ideas-ui]].
- **Epic siblings:** part of [[LCOS-E13-menu-ideas]]; downstream context feeds [[LCOS-E14-strategic-insights]].

## Acceptance criteria

Acceptance criteria: TBD (Phase 2 — detailed on activation). On activation, drafts cover: anti-hallucination drop of fake `ingredient_id`; code-side Decimal cost matching a manual calculation; daily limit + over-limit error; fail-closed `503` behavior; no LLM call without a user click; tenant isolation; and a live-catalog check of ≥3 meaningful ideas.

## Sources

- `plan/PHASE_F9_CROSS_RECIPE.md §1` — F9-B1 (deterministic context, single `ai_complete`, anti-hallucination, code-side costing, `menu_ideas` store, daily limit), F9-B2 (list/patch API, module gate).
- `plan/00_IMPLEMENTATION_PLAN.md §4` (cross-cutting requirements: human-triggered AI, fail-closed, config registry, module gates).
