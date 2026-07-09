---
id: supplier_settings
type: entity
title: supplier_settings — условия заказа по каждому поставщику (planned design)
status: planned
scope: org
table: supplier_settings
pk: int
used_by: ["[[LCOS-F19-supplier-self-service]]", "[[LCOS-F39-order-message]]", "[[LCOS-F40-ai-order-proposal]]"]
requirements: ["[[supplier-criteria-registry]]", "[[multitenancy]]"]
sources: ["08_PHASE1_SPEC.md F2.1 (archived)", "APP_OVERVIEW.md §10 (archived)"]
updated: 2026-07-09
---
# supplier_settings — условия заказа по каждому поставщику (planned design)

> **Status: planned design.** ⚠️ **As-built разошёлся:** реализованная версия хранит условия по каждому поставщику как `Supplier.criteria` JSONB, валидируемый реестром (см. [[supplier-criteria-registry]] и [[LCOS-F18-supplier-criteria]]), а **не** в отдельной таблице `supplier_settings`. Эта заметка документирует изначально запланированную таблицу (08 F2.1) для трассируемости; реестр критериев замещает её, если только позже не будет заново введена выделенная таблица для портала самообслуживания поставщиков ([[LCOS-F19-supplier-self-service]], [[ADR-017]]).

## Назначение (planned)
Условия по каждому поставщику, управляющие планировщиком заказов: дни доставки по неделе, срок поставки (lead time), минимальная сумма заказа + порог бесплатной доставки, предпочитаемый канал связи. В as-built-системе они живут в [[suppliers]]`.criteria` (JSONB) — см. [[supplier-criteria-registry]].

## Область (scope)
Область — org (см. [[multitenancy]]).

## Отношение к as-built
| Planned (08 F2.1) | As-built |
|---|---|
| отдельная таблица `supplier_settings` + `extra_terms` JSONB | `Supplier.criteria` JSONB + реестр `app/domain/supplier_criteria.py` |
| — | новые критерии добавляются без миграции (валидируются реестром, 422 при недопустимом) |

## Используется
[[LCOS-F18-supplier-criteria]] (as-built), [[LCOS-F19-supplier-self-service]] (будущий портал), [[LCOS-F39-order-message]] (канал связи), [[LCOS-F40-ai-order-proposal]] (min-order/lead-time).

## Источники
`08_PHASE1_SPEC.md` F2.1 (archived), `APP_OVERVIEW.md` §10 (archived), [[ADR-017]].
