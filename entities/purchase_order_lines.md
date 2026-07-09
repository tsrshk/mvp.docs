---
id: purchase_order_lines
type: entity
title: purchase_order_lines — order draft lines (planned)
status: planned
scope: subdivision
table: purchase_order_lines
pk: int
used_by: ["[[LCOS-F37-purchase-orders]]", "[[LCOS-F38-orders-ui]]", "[[LCOS-F40-ai-order-proposal]]", "[[LCOS-F41-ai-order-ui]]"]
requirements: ["[[multitenancy]]"]
sources: ["08_PHASE1_SPEC.md F4.1/F4.4 (archived)"]
updated: 2026-07-09
---
# purchase_order_lines — order draft lines (planned)

> **Status: planned** (epic [[LCOS-E8-purchasing]]). Specified by [[LCOS-F37-purchase-orders]].

## Purpose
Line items of a [[purchase_orders]] draft. Each line records its `origin` (manual / ai / prefill) which feeds the "AI edited" close-out metric ([[LCOS-F44-live-closeout]]); editing an AI line flips `origin` to manual.

## Scope
Subdivision-scoped (see [[multitenancy]]).

## Key fields (planned)
| Field | Notes |
|---|---|
| purchase_order_id | → [[purchase_orders]] (CASCADE) |
| ingredient_id | → [[ingredients]] |
| quantity / packing | rounded to whole [[packings]] by the planner |
| origin | `manual` \| `ai` \| `prefill` |
| reason | why the planner proposed this line (AI origin) |

## Used by
[[LCOS-F37-purchase-orders]], [[LCOS-F38-orders-ui]], [[LCOS-F40-ai-order-proposal]], [[LCOS-F41-ai-order-ui]], [[LCOS-F44-live-closeout]].

## Sources
`08_PHASE1_SPEC.md` F4.1/F4.4 (archived).
