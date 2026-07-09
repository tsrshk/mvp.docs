---
id: LCOS-E9
type: epic
title: Аналитика продаж и дайджест
status: future
phase: "Phase 2"
features: ["[[LCOS-F45-sales-read]]", "[[LCOS-F46-sales-storage]]", "[[LCOS-F47-scheduler]]", "[[LCOS-F48-weekly-digest]]", "[[LCOS-F49-reorder-suggestion]]"]
legacy_refs: [plan F5, 07 Э6]
sources: [07_PHASES.md Э6, plan/00_IMPLEMENTATION_PLAN.md F5, 06_STRATEGY.md]
updated: 2026-07-09
---

# LCOS-E9 · Аналитика продаж и дайджест

**Статус:** 🔭 future · **Фаза:** Phase 2 (после Pilot-Gate)

## Описание

Первый эпик роста после прохождения Pilot-Gate: чтение продаж из Esupl, их хранение с дневными агрегатами, планировщик sync-задач, еженедельный дайджест и подсказка `reorder_point`, выведенная из фактического потребления. Это переход от «я делаю работу по вводу данных» к «я подсказываю на основе данных» — всё ещё в логике AI-управляющего, не дашборд: дайджест приходит сам и заканчивается действием.

## Цель / ценность

Замкнуть цикл потребление ↔ закупки: система видит, что и как быстро продаётся, и использует это для уточнения точек дозаказа ([[LCOS-E7-stock]], [[LCOS-E8-purchasing]]). Дайджест — регулярный контакт продукта с владельцем, поддерживающий рутину.

## Фичи

| ID | Название | Статус | Ссылка |
|---|---|---|---|
| LCOS-F45 | Чтение продаж + backfill истории | 🔭 future | [[LCOS-F45-sales-read]] |
| LCOS-F46 | Хранение продаж + дневные агрегаты | 🔭 future | [[LCOS-F46-sales-storage]] |
| LCOS-F47 | Планировщик + sync-задача | 🔭 future | [[LCOS-F47-scheduler]] |
| LCOS-F48 | Еженедельный дайджест | 🔭 future | [[LCOS-F48-weekly-digest]] |
| LCOS-F49 | Подсказка `reorder_point` из потребления | 🔭 future | [[LCOS-F49-reorder-suggestion]] |

## Ключевые сущности / требования

- Сущности: [[ingredients]], [[stock_levels]], [[subdivisions]] (будущие таблицы продаж/агрегатов — заглушки).
- Требования: [[erp-esupl-integration]], [[provider-abstraction]], [[multitenancy]].
- Роли: [[member]], [[admin]].

## Гейты

- **Kill-критерии (07 Э0):** глубина продаж < 3 месяцев → backfill урезается до «от сегодня вперёд».
- **Не-цель Phase 1:** планировщик/очереди (Celery) — появляются здесь, в Phase 2.
- AC: TBD (Phase 2) — детальные критерии не прорабатываются до чекпоинта.

## legacy_refs

plan F5; 07 Э6.

## Источники

- 07_PHASES.md Э6, plan/00_IMPLEMENTATION_PLAN.md F5, 06_STRATEGY.md
