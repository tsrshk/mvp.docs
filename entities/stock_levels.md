---
id: stock_levels
type: entity
title: stock_levels — снимки остатков (planned)
status: planned
scope: subdivision
table: stock_levels
pk: uuid
used_by: ["[[LCOS-F34-stock-levels]]", "[[LCOS-F36-stock-screen]]", "[[LCOS-F40-ai-order-proposal]]", "[[LCOS-F49-reorder-suggestion]]"]
requirements: ["[[multitenancy]]", "[[erp-esupl-integration]]"]
sources: ["work/plan/PHASE_S1... n/a", "08_PHASE1_SPEC.md F3.1 (archived)", "ADR-016"]
updated: 2026-07-09
---
# stock_levels — снимки остатков (planned)

> **Status: planned** (эпик [[LCOS-E7-stock]]). Ещё не в схеме; специфицировано в [[LCOS-F34-stock-levels]].

## Назначение
Снимки остатков ингредиента на момент времени, из остатков Esupl или ручного ввода (решение об источнике остатков — см. [[ADR-016]]). Питает список дефицита ([[LCOS-F36-stock-screen]]) и планировщик заказов ([[LCOS-F40-ai-order-proposal]]).

## Область (scope)
Область — subdivision (`organization_id` + `subdivision_id` денормализованы — см. [[multitenancy]]).

## Ключевые поля (planned)
| Поле | Примечания |
|---|---|
| organization_id / subdivision_id | область арендатора (tenant scope) |
| ingredient_id | → [[ingredients]] |
| warehouse_id | склад Esupl |
| quantity | текущий уровень (базовая единица) |
| as_of | момент снимка; побеждает `max(as_of)` |
| source | `esupl` \| `manual` (по [[ADR-016]]) |

## Используется
[[LCOS-F34-stock-levels]] (синхронизация), [[LCOS-F35-reorder-point]] (`is_low`), [[LCOS-F36-stock-screen]], [[LCOS-F40-ai-order-proposal]], [[LCOS-F49-reorder-suggestion]].

## Источники
`08_PHASE1_SPEC.md` F3.1 (archived), `07_PHASES.md` Э3 (archived), [[ADR-016]].
