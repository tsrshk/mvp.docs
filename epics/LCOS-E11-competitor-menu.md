---
id: LCOS-E11
type: epic
title: Меню и цены конкурентов
status: future
phase: "Phase 2"
features: ["[[LCOS-F54-competitor-directory]]", "[[LCOS-F55-menu-ocr]]", "[[LCOS-F56-positioning]]", "[[LCOS-F57-places-prefill]]"]
legacy_refs: [plan F7, 07 Э7/Э8]
sources: [plan/00_IMPLEMENTATION_PLAN.md F7, 07_PHASES.md Э7/Э8, 06_STRATEGY.md]
updated: 2026-07-09
---

# LCOS-E11 · Меню и цены конкурентов

**Статус:** 🔭 future · **Фаза:** Phase 2

## Описание

Конкурентное позиционирование: справочник конкурентов, OCR меню (doc-type `menu` — переиспользует провайдерский OCR-шов из [[LCOS-E2-invoice-intake]] / [[LCOS-E6-ocr-quality]]), сравнение по району и ценовое позиционирование, опциональный prefill из Google Places. Цель — дать владельцу ответ на «как я выгляжу рядом с соседями».

## Цель / ценность

Расширить AI-управляющего с внутренней рутины на внешний рынок: подсказки по ценам и ассортименту относительно ближайших конкурентов. Питает идеи меню ([[LCOS-E13-menu-ideas]]) и стратегический диалог ([[LCOS-E14-strategic-insights]]).

## Фичи

| ID | Название | Статус | Ссылка |
|---|---|---|---|
| LCOS-F54 | Справочник конкурентов | 🔭 future | [[LCOS-F54-competitor-directory]] |
| LCOS-F55 | OCR меню (doc-type menu) | 🔭 future | [[LCOS-F55-menu-ocr]] |
| LCOS-F56 | Сравнение/позиционирование по району | 🔭 future | [[LCOS-F56-positioning]] |
| LCOS-F57 | Prefill из Google Places (опционально) | 🔭 future | [[LCOS-F57-places-prefill]] |

## Ключевые сущности / требования

- Сущности: будущие таблицы конкурентов/меню — заглушки; переиспользует OCR-инфраструктуру потока [[invoices]].
- Требования: [[provider-abstraction]], [[vpn-egress]], [[multitenancy]].
- Роли: [[admin]] (ведёт конкурентов), [[member]].

## Гейты

- **doc-type-расширяемость:** OCR-шов должен принять новый тип документа `menu` без переписывания провайдера ([[ADR-009]]).
- AC: TBD (Phase 2).

## legacy_refs

plan F7; 07 Э7/Э8.

## Источники

- plan/00_IMPLEMENTATION_PLAN.md F7, 07_PHASES.md Э7/Э8, 06_STRATEGY.md
