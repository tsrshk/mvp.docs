---
id: LCOS-E7
type: epic
title: Остатки и список дефицита
status: planned
phase: "Phase 1"
features: ["[[LCOS-F34-stock-levels]]", "[[LCOS-F35-reorder-point]]", "[[LCOS-F36-stock-screen]]"]
legacy_refs: [07 Э3, 08 F3.x, ADR-016]
sources: [07_PHASES.md Э3, 08_PHASE1_SPEC.md F3.x, ADR-016]
updated: 2026-07-09
---

# LCOS-E7 · Остатки и список дефицита

**Статус:** 📝 planned · **Фаза:** Phase 1

## Описание

Видимость остатков ингредиентов и список того, что скоро закончится — вход в планирование заказов. В [[ADR-016]] зафиксированы три источника остатков: **A** — `remains` из Esupl; **B** — приход − расход; **C** — ручной ввод (гарантированный fallback на старте). Стратегия: начать на C (работает без подтверждения контракта), включить A после того, как контракт `remains` эмпирически подтверждён в браузере.

Снимки остатков хранятся в `stock_levels` (с `organization_id` + `subdivision_id` + `source` + `external_id` с первого дня — заглушка под переносимость). На ингредиентах появляется `reorder_point`. Экран `/stock` показывает список low-stock и позволяет ручную корректировку (которая питает источник C).

## Цель / ценность

Без остатков «предложи заказ» — это гадание. Это шаг 3 лестницы рутин: система знает, что заканчивается, и готовит вход для шага 4 (заказы, [[LCOS-E8-purchasing]]).

## Фичи

| ID | Название | Статус | Ссылка |
|---|---|---|---|
| LCOS-F34 | `get_stock` + снимки `stock_levels` + синхронизация | 📝 planned | [[LCOS-F34-stock-levels]] |
| LCOS-F35 | `reorder_point` на ингредиентах | 📝 planned | [[LCOS-F35-reorder-point]] |
| LCOS-F36 | Экран `/stock` (список low + ручная корректировка) | 📝 planned | [[LCOS-F36-stock-screen]] |

## Ключевые сущности / требования

- Сущности: [[stock_levels]], [[ingredients]] (`reorder_point`), [[subdivisions]].
- Требования: [[erp-esupl-integration]], [[provider-abstraction]], [[multitenancy]].
- Роли: [[member]] (смотрит/корректирует), [[admin]] (задаёт `reorder_point`).

## Гейты

- **[[ADR-016]] источник остатков:** начать на C (ручной), A включается только после подтверждения контракта `remains` в браузере.
- **Kill-критерии (07 Э0):** `remains` не возвращает данных → эпик остаётся на C.
- **Соглашение о заглушках:** каждая новая таблица несёт `organization_id` + `source` + `external_id` с первого дня.

## legacy_refs

07 Э3 (остатки); 08_PHASE1_SPEC F3.x; ADR-016 (источник остатков).

## Источники

- 07_PHASES.md Э3, 08_PHASE1_SPEC.md F3.x
- ADR: [[ADR-016]]
