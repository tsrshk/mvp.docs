---
id: LCOS-E4
type: epic
title: Справочник поставщиков и условия
status: partial
phase: "Phase 1"
features: ["[[LCOS-F17-supplier-cards]]", "[[LCOS-F18-supplier-criteria]]", "[[LCOS-F19-supplier-self-service]]", "[[LCOS-F20-price-history]]", "[[LCOS-F21-price-change-signal]]"]
legacy_refs: [07 Э2, plan F3, 08 F2.x, APP §10]
sources: [APP_OVERVIEW.md §10, 07_PHASES.md Э2, 08_PHASE1_SPEC.md F2.x]
updated: 2026-07-09
---

# LCOS-E4 · Справочник поставщиков и условия

**Статус:** 🟡 partial · **Фаза:** Phase 1

## Описание

Поставщик в LCOS — это зеркало сущности Esupl (`following`, `is_virtual=1`) плюс собственная карточка LCOS: контакты, заметки и **гибкие критерии** (объём, срок поставки, дни поставки, режим оплаты, отсрочка). Критерии хранятся в `Supplier.criteria` (JSONB), а их определения живут в реестре `app/domain/supplier_criteria.py` (`CriterionDef`). Валидация выполняется по реестру на уровне API: невалидные значения → 422, неизвестные ключи молча отбрасываются. Новые критерии добавляются **редактированием реестра, без миграций**.

Это as-built-дизайн, который **заменяет** ранний план (07 Э2 предлагал отдельную таблицу `supplier_settings` с колонками) — решение сместилось к criteria-registry + JSONB (разрешение коллизии #4 в плане реструктуризации). FE-страница `/suppliers`, `supplier-selector`, хлебные крошки и футер существуют (правка doc↔code из инвентаризации).

## Цель / ценность

Дать AI-управляющему знание об условиях каждого поставщика — фундамент для планирования заказов ([[LCOS-E8-purchasing]]): когда можно заказать, минимальная сумма, срок поставки. Без структурированных условий предложение заказа было бы гаданием. Потребительская аналитика по критериям (REQ 1b) — модель существует (шов), потребитель отложен решением на чекпоинте.

## Фичи

| ID | Название | Статус | Ссылка |
|---|---|---|---|
| LCOS-F17 | CRUD карточек поставщиков + условия поставки | ✅ built | [[LCOS-F17-supplier-cards]] |
| LCOS-F18 | Реестр гибких критериев поставщика | ✅ built | [[LCOS-F18-supplier-criteria]] |
| LCOS-F19 | Шов self-service поставщика | 📝 planned | [[LCOS-F19-supplier-self-service]] |
| LCOS-F20 | История цен + авто-сбор | 📝 planned | [[LCOS-F20-price-history]] |
| LCOS-F21 | Сигнал об изменении цены в потоке накладной | 📝 planned | [[LCOS-F21-price-change-signal]] |

## Ключевые сущности / требования

- Сущности: [[suppliers]], [[users]] (nullable `portal_user_id` — заглушка self-service), [[memberships]].
- Требования: [[supplier-criteria-registry]], [[erp-esupl-integration]], [[multitenancy]].
- Роли: [[admin]] (заполняет карточки/критерии), [[member]] (читает), [[supplier-future]] (заглушка, в UI/auth ничего не построено).

## Гейты

- **Self-service — только заглушка ([[ADR-017]]):** роль `supplier` есть в enum, nullable `suppliers.portal_user_id → users.id`; «дверь открыта, глобальный supplier-user + invite-токены появятся позже». В auth/UI ничего не построено (не-цель Phase 1).
- **DEC-4/чекпоинт:** потребитель аналитики по поставщикам (REQ 1b) отложен.
- **НЕ построено в Phase 1:** `default_order_volume`, `supplier_prices`/ценовые алерты (07 Э2) — перенесены в F20/F21 как planned.

## legacy_refs

07 Э2 (настройки поставщика + заглушка self-service; таблица `supplier_settings` заменена criteria-JSONB); plan F3 (история цен → F20); 08_PHASE1_SPEC F2.x; APP_OVERVIEW §10.

## Источники

- APP_OVERVIEW.md §10 (гибкие критерии), §11 (`suppliers`)
- 07_PHASES.md Э2, 08_PHASE1_SPEC.md F2.x
- ADR: [[ADR-017]]
