---
id: purchase_order_lines
type: entity
title: purchase_order_lines — строки черновика заказа (planned)
status: planned
scope: subdivision
table: purchase_order_lines
pk: int
used_by: ["[[LCOS-F37-purchase-orders]]", "[[LCOS-F38-orders-ui]]", "[[LCOS-F40-ai-order-proposal]]", "[[LCOS-F41-ai-order-ui]]"]
requirements: ["[[multitenancy]]"]
sources: ["08_PHASE1_SPEC.md F4.1/F4.4 (archived)"]
updated: 2026-07-09
---
# purchase_order_lines — строки черновика заказа (planned)

> **Status: planned** (эпик [[LCOS-E8-purchasing]]). Специфицировано в [[LCOS-F37-purchase-orders]].

## Назначение
Позиции черновика [[purchase_orders]]. Каждая строка фиксирует свой `origin` (manual / ai / prefill), который питает метрику close-out «AI edited» ([[LCOS-F44-live-closeout]]); редактирование AI-строки переводит `origin` в manual.

## Область (scope)
Область — subdivision (см. [[multitenancy]]).

## Ключевые поля (planned)
| Поле | Примечания |
|---|---|
| purchase_order_id | → [[purchase_orders]] (CASCADE) |
| ingredient_id | → [[ingredients]] |
| quantity / packing | округлено планировщиком до целых [[packings]] |
| origin | `manual` \| `ai` \| `prefill` |
| reason | почему планировщик предложил эту строку (AI origin) |

## Используется
[[LCOS-F37-purchase-orders]], [[LCOS-F38-orders-ui]], [[LCOS-F40-ai-order-proposal]], [[LCOS-F41-ai-order-ui]], [[LCOS-F44-live-closeout]].

## Источники
`08_PHASE1_SPEC.md` F4.1/F4.4 (archived).
