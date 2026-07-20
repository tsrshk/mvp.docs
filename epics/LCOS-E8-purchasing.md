---
id: LCOS-E8
type: epic
title: Закупки — черновики заказов и замыкание цикла
status: partial  # F37 (purchase_orders) построен, F43 (идемпотентность) done; остальное — план
phase: "Phase 1"
features: ["[[LCOS-F37-purchase-orders]]", "[[LCOS-F38-orders-ui]]", "[[LCOS-F39-order-message]]", "[[LCOS-F40-ai-order-proposal]]", "[[LCOS-F41-ai-order-ui]]", "[[LCOS-F42-receipt-reconciliation]]", "[[LCOS-F43-idempotency]]", "[[LCOS-F44-live-closeout]]"]
legacy_refs: [07 Э4a/Э4b/Э5, 08 F4.x/F5.x]
sources: [07_PHASES.md Э4/Э5, 08_PHASE1_SPEC.md F4.x/F5.x]
updated: 2026-07-09
---

# LCOS-E8 · Закупки — черновики заказов и замыкание цикла

**Статус:** 🟡 partial (F37 построен, F43 done; остальное план) · **Фаза:** Phase 1

## Описание

Финальный шаг Phase 1: превратить знание об остатках и условиях поставщиков в готовые к отправке заказы. Сущности `purchase_orders` + строки с собственной машиной состояний и предзаполнением из условий поставщика ([[LCOS-E4-suppliers]]) и остатков ([[LCOS-E7-stock]]). Ручной черновик на `/orders` с индикатором минимальной суммы; подтверждение превращает заказ в **копируемое сообщение поставщику**. Далее — AI-предложение заказа (`order_planning_service`) с пометкой AI-строк, сверка приход ↔ заказ, серверная идемпотентность (DEFER-04) и live-режим с метриками закрытия.

Замыкание цикла: заказано → пришло → принято как накладная ([[LCOS-E2-invoice-intake]]) → сверено с заказом → остатки обновлены. Это полный контур «AI-управляющего» на одной рутине.

## Цель / ценность

Шаг 4 лестницы рутин и целевая точка Pilot-Gate: владелец не считает заказы вручную — AI предлагает, человек подтверждает, сообщение уходит поставщику. Ежедневное продакшн-использование этого контура Customer Zero — это и есть критерий прохождения Pilot-Gate ([[ADR-003]]).

## Фичи

| ID | Название | Статус | Ссылка |
|---|---|---|---|
| LCOS-F37 | `purchase_orders` + строки + машина состояний + prefill | 📝 planned | [[LCOS-F37-purchase-orders]] |
| LCOS-F38 | `/orders` ручной черновик + индикатор минимальной суммы | 📝 planned | [[LCOS-F38-orders-ui]] |
| LCOS-F39 | Подтверждение → копируемое сообщение поставщику | 📝 planned | [[LCOS-F39-order-message]] |
| LCOS-F40 | AI-предложение заказа (`order_planning_service`) | 📝 planned | [[LCOS-F40-ai-order-proposal]] |
| LCOS-F41 | UI «Предложить заказ» + пометка AI-строк | 📝 planned | [[LCOS-F41-ai-order-ui]] |
| LCOS-F42 | Сверка приход ↔ заказ | 📝 planned | [[LCOS-F42-receipt-reconciliation]] |
| LCOS-F43 | Серверная идемпотентность (DEFER-04) | ✅ done | [[LCOS-F43-idempotency]] |
| LCOS-F44 | Live-режим + метрики закрытия | 📝 planned | [[LCOS-F44-live-closeout]] |

## Ключевые сущности / требования

- Сущности: [[purchase_orders]], [[purchase_order_lines]], [[stock_levels]], [[suppliers]], [[ingredients]], [[invoices]].
- Требования: [[supplier-criteria-registry]], [[erp-esupl-integration]], [[provider-abstraction]], [[fail-closed]].
- Роли: [[member]] (создаёт/подтверждает заказ), [[admin]].

## Гейты

- **Человек подтверждает:** AI готовит предложение, человек принимает решение об отправке (сквозной принцип).
- **Идемпотентность (DEFER-04):** серверная защита от дублей заказов.
- **Pilot-Gate ([[ADR-003]]) / kill-критерии:** если построенный шаг не используется Customer Zero через 4 недели после выката — пересмотр стратегии (06_STRATEGY §review).
- Строки заказа несут устойчивые ссылки на идентичность POS через [[sku_mapping]] (переиспользование moat из [[LCOS-E3-sku-identity]]).

## legacy_refs

07 Э4a/Э4b/Э5 (заказы + замыкание); 08_PHASE1_SPEC F4.x/F5.x.

## Источники

- 07_PHASES.md Э4/Э5, 08_PHASE1_SPEC.md F4.x/F5.x
- ADR: [[ADR-003]], [[ADR-016]]
