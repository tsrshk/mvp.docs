---
id: LCOS-E12
type: epic
title: Отзывы о конкурентах
status: future
phase: "Phase 2"
features: ["[[LCOS-F58-review-storage]]", "[[LCOS-F59-review-analysis]]", "[[LCOS-F60-reviews-api]]"]
legacy_refs: [plan F8]
sources: [plan/00_IMPLEMENTATION_PLAN.md F8, 06_STRATEGY.md]
updated: 2026-07-09
---

# LCOS-E12 · Отзывы о конкурентах

**Статус:** 🔭 future · **Фаза:** Phase 2

## Описание

Сбор и анализ отзывов о конкурентах: хранение + приём отзывов, AI-анализ (темы, тональность, сильные/слабые стороны), API отзывов + раздел дайджеста + алерт на всплеск негатива. Дополняет меню/цены ([[LCOS-E11-competitor-menu]]) качественным рыночным сигналом.

## Цель / ценность

Дать владельцу понимание, за что хвалят и ругают соседей — вход для решений по меню и сервису. Алерт на негатив превращает пассивные данные в действие.

## Фичи

| ID | Название | Статус | Ссылка |
|---|---|---|---|
| LCOS-F58 | Хранение + приём отзывов | 🔭 future | [[LCOS-F58-review-storage]] |
| LCOS-F59 | AI-анализ отзывов | 🔭 future | [[LCOS-F59-review-analysis]] |
| LCOS-F60 | API отзывов + раздел дайджеста + алерт на негатив | 🔭 future | [[LCOS-F60-reviews-api]] |

## Ключевые сущности / требования

- Сущности: будущие таблицы отзывов — заглушки; связаны со справочником конкурентов [[LCOS-E11-competitor-menu]].
- Требования: [[provider-abstraction]], [[vpn-egress]], [[multitenancy]].
- Роли: [[admin]], [[member]].

## Гейты

- **AI-анализ за швом:** тональность/темы через провайдерский LLM-шов ([[ADR-009]], [[ADR-012]]).
- AC: TBD (Phase 2).

## legacy_refs

plan F8.

## Источники

- plan/00_IMPLEMENTATION_PLAN.md F8, 06_STRATEGY.md
