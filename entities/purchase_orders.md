---
id: purchase_orders
type: entity
title: purchase_orders — черновики заказов поставщику (planned)
status: planned
scope: subdivision
table: purchase_orders
pk: int
used_by: ["[[LCOS-F37-purchase-orders]]", "[[LCOS-F38-orders-ui]]", "[[LCOS-F39-order-message]]", "[[LCOS-F40-ai-order-proposal]]", "[[LCOS-F42-receipt-reconciliation]]"]
requirements: ["[[multitenancy]]", "[[invoice-status-machine]]"]
sources: ["08_PHASE1_SPEC.md F4.1 (archived)", "07_PHASES.md Э4a (archived)"]
updated: 2026-07-09
---
# purchase_orders — черновики заказов поставщику (planned)

> **Status: planned** (эпик [[LCOS-E8-purchasing]]). Специфицировано в [[LCOS-F37-purchase-orders]].

## Назначение
Черновик заказа поставщику, который оператор собирает (вручную или предзаполненным ИИ), подтверждает и отправляет через собственный канал поставщика. LCOS **не** пишет заказы в Esupl — только human-in-the-loop (см. [[ADR-002]]).

## Область (scope)
Область — subdivision (см. [[multitenancy]]).

## Ключевые поля (planned)
| Поле | Примечания |
|---|---|
| organization_id / subdivision_id | область арендатора (tenant scope) |
| supplier_id | → [[suppliers]] |
| status | `draft` → `confirmed` → `sent_manually` → `received` / `cancelled` (409 при недопустимом переходе) |
| total_amount | вычисляемое |
| confirmed_by | → [[users]] |

Планируется сверка с полученной накладной через `invoices.purchase_order_id` — **этой колонки пока НЕТ в схеме** (F42 не реализован; ни модель Invoice, ни миграции её не добавляют). Появится при реализации [[LCOS-F42-receipt-reconciliation]]; SSOT существования колонки — [[invoices]].

## Используется
[[LCOS-F37-purchase-orders]], [[LCOS-F38-orders-ui]], [[LCOS-F39-order-message]], [[LCOS-F40-ai-order-proposal]], [[LCOS-F41-ai-order-ui]], [[LCOS-F42-receipt-reconciliation]].

## Источники
`08_PHASE1_SPEC.md` F4.1/F5.1 (archived), `07_PHASES.md` Э4a/Э5 (archived).
