---
id: LCOS-F46
type: feature
title: Хранение продаж + суточные агрегаты
epic: "[[LCOS-E9-sales-analytics]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin]
entities: ["[[ingredients]]", "[[subdivisions]]", "[[organizations]]"]
requirements: ["[[multitenancy]]", "[[erp-esupl-integration]]"]
adrs: []
legacy_refs: [plan F5-B2, 07 Э6]
sources: ["plan/PHASE_F5_SALES_ANALYTICS.md §1 F5-B2", "07_PHASES.md Э6"]
updated: 2026-07-09
---
# LCOS-F46 · Хранение продаж + суточные агрегаты
**Epic:** [[LCOS-E9-sales-analytics]] · **Status:** future · **Phase:** Phase 2

## Описание

Слой персистентности для продаж, читаемых в [[LCOS-F45-sales-read]]. Вводит две таблицы со скоупом подразделения: `sales_records` (сырые строки продаж, зеркалируемые из Esupl) и `daily_aggregates` (посуточные свёртки, материализуемые синхронизацией). Ограничение уникальности `external_id` — именно то, что делает повторную синхронизацию того же окна идемпотентной — без дублирующих строк — что является ключевым свойством корректности всего эпика.

`sales_records` сопоставляется с локальным каталогом там, где это возможно (nullable FK `ingredient_id`), чтобы производные фичи могли рассуждать в терминах локальных ингредиентов; где сопоставления нет, `name`/`category` из Esupl сохраняются дословно. `daily_aggregates` пересчитывается для затронутых дней при каждой синхронизации, так что выручка и топ-позиции всегда отражают последний upsert.

## Возможности

- `sales_records` (`SubdivisionScopedMixin`, int pk): `external_id` (уникален внутри org), `sold_at` (tz-aware), `sku_external_id?`, `ingredient_id?` (FK, nullable), `name`, `category?`, `qty` `Numeric(14,3)`, `revenue` `Numeric(14,2)`, `cost?` `Numeric(14,2)`, `currency`. Уникально `(organization_id, external_id)`.
- `daily_aggregates` (`SubdivisionScopedMixin`): `date`, `revenue`, `receipts_count?`, `top_positions JSONB?`; уникально `(subdivision_id, date)`; пересчитывается для затронутых дней синхронизацией.
- Идемпотентный upsert по ключу `external_id`; повторный прогон того же окна не создаёт дубликатов.
- Детерминированная математика агрегатов (Decimal) — покрываемая юнит-тестами, без участия LLM.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[admin]] | Владеет данными своего подразделения (наполняются синхронизацией); ручное редактирование строк отсутствует. |
| [[superadmin]] | Кросс-тенантная видимость сохранённых продаж/агрегатов. |
| [[member]] | Читает только через производную аналитику (дайджест, предложение точки дозаказа). |
| [[sqladmin-operator]] | Инспектирует таблицы в плоскости SQLAdmin для операционной видимости. |

## Задействованные сущности

- [[organizations]] — org-скоуп для ключа идемпотентности `external_id` (`unique (organization_id, external_id)`).
- [[subdivisions]] — скоуп подразделения (`SubdivisionScopedMixin`) и ключ агрегата `(subdivision_id, date)`.
- [[ingredients]] — nullable FK `ingredient_id` в `sales_records`, сопоставляющий строку продажи с локальным каталогом там, где возможно.
- Новые таблицы `sales_records` и `daily_aggregates` определяются здесь; отдельных документов-сущностей у них пока нет (заготовки Phase 2).

## Зависимости / связи

- **Requirements:** [[multitenancy]] (обе таблицы тенант-скоупные; изоляция должна быть покрыта тестами), [[erp-esupl-integration]] (строки происходят из данных Esupl, читаемых только на чтение).
- **Features:** наполняется из [[LCOS-F45-sales-read]], записывается заданием синхронизации [[LCOS-F47-scheduler]], потребляется [[LCOS-F48-weekly-digest]] и [[LCOS-F49-reorder-suggestion]].
- **Epics:** [[LCOS-E9-sales-analytics]].

## Критерии приёмки

- Критерии приёмки: TBD (Phase 2 — детализируются при активации). Идемпотентность (уникальный `external_id`), корректный Decimal-пересчёт агрегатов и тесты тенант-изоляции прорабатываются при активации.

## Sources

- `plan/PHASE_F5_SALES_ANALYTICS.md §1 F5-B2` (схема хранения продаж, агрегаты, идемпотентность).
- `07_PHASES.md Э6` (`sales_history`, идемпотентный перезапуск, суммы сходятся с Esupl).
