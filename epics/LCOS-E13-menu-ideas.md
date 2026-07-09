---
id: LCOS-E13
type: epic
title: Идеи меню на пересечении рецептур
status: future
phase: "Phase 2"
features: ["[[LCOS-F61-menu-idea-generation]]", "[[LCOS-F62-menu-ideas-ui]]"]
legacy_refs: [plan F9]
sources: [plan/00_IMPLEMENTATION_PLAN.md F9, 06_STRATEGY.md]
updated: 2026-07-09
---

# LCOS-E13 · Идеи меню на пересечении рецептур

**Статус:** 🔭 future · **Фаза:** Phase 2

## Описание

Генерация идей меню на пересечении доступных ингредиентов/рецептур (использовать то, что уже закуплено и лежит на остатках) и UI с их статусами (proposed / in progress / accepted / rejected). AI предлагает блюда/позиции, снижающие списания и использующие уже оплаченные ингредиенты.

## Цель / ценность

Превратить данные об остатках ([[LCOS-E7-stock]]) и потреблении ([[LCOS-E9-sales-analytics]]) в конкретные предложения, повышающие маржу и сокращающие списания — снова «AI делает работу», а не показывает отчёт.

## Фичи

| ID | Название | Статус | Ссылка |
|---|---|---|---|
| LCOS-F61 | Генерация идей меню | 🔭 future | [[LCOS-F61-menu-idea-generation]] |
| LCOS-F62 | UI идей меню + статусы | 🔭 future | [[LCOS-F62-menu-ideas-ui]] |

## Ключевые сущности / требования

- Сущности: [[ingredients]], [[stock_levels]]; будущая таблица menu_ideas — заглушка.
- Требования: [[provider-abstraction]], [[vpn-egress]], [[multitenancy]].
- Роли: [[member]] (принимает/отклоняет идеи), [[admin]].

## Гейты

- **Человек подтверждает:** идея — это предложение, владелец решает о её добавлении в меню.
- AC: TBD (Phase 2).

## legacy_refs

plan F9.

## Источники

- plan/00_IMPLEMENTATION_PLAN.md F9, 06_STRATEGY.md
