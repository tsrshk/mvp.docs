---
id: REQ-SUPPLIER-CRITERIA
type: requirement
title: Реестр гибких критериев поставщика (Supplier.criteria JSONB + registry)
status: built
scope: cross-cutting
roles: [admin, member]
entities: ["[[suppliers]]"]
adrs: ["[[ADR-017]]", "[[ADR-021]]"]
requirements: ["[[multitenancy]]", "[[sku-identity-resolver]]", "[[global-requirements]]"]
ssot_for: [supplier-criteria-registry, criterion-def-registry, criteria-jsonb-validation]
legacy_refs: [08 F2.1 (superseded), plan F3, APP §10]
sources: [APP_OVERVIEW.md §10, 01_ARCHITECTURE.md "suppliers", app/domain/supplier_criteria.py]
updated: 2026-07-20
---

# REQ-SUPPLIER-CRITERIA · Реестр гибких критериев поставщика

**Type:** cross-cutting SSOT · **Status:** built. Расширяемая модель условий поставки. **As-built дизайн, замещающий** плановую 08_PHASE1_SPEC F2.1 (см. restructure-plan collision #4).

## Нормативное положение

- **N1. `suppliers.criteria` — колонка JSONB** на [[suppliers]] (tenant-scoped, org-wide). Хранит гибкий набор условий поставки без фиксированной схемы колонок.
- **N2. Определения — в реестре** `app/domain/supplier_criteria.py`: `CriterionDef` описывает каждый критерий (минимальный объём/сумма заказа, срок поставки, дни поставки, режим оплаты, отсрочка оплаты). Реестр — SSOT ключей/типов/валидации.
- **N3. Валидация против реестра на уровне API:** невалидные значения → **422**; **неизвестные ключи тихо отбрасываются** (не 422 — толерантность к лишним ключам). Значение приводится к типу критерия из реестра.
- **N4. Новый критерий — правкой реестра, без миграций** — JSONB не нужен ALTER TABLE. Это ключевое свойство: продуктовое расширение условий не блокируется циклом миграций.
- **N5. Отдельные структурные поля карточки поставщика** (не в `criteria`, миграция `0006`): `contact_name`, `phone`, `messenger`, `delivery_terms` (Text), `min_order_amount` (Numeric), `min_order_note`, `is_active` (soft-hide устаревших). Гибкие критерии дополняют карточку, не заменяют её.
- **N6. Consumer-аналитика (REQ 1b) — шов, потребитель отложен:** модель критериев существует, но потребитель (сравнение/скоринг поставщиков) отложен решением checkpoint — сейчас это только хранение + валидация. Отложенный шов потребителя реализуется поверх единой серии `supplier_prices` ([[ADR-021]] §3), а не над отдельным источником цен.

## Обоснование

Условия поставки различаются у поставщиков и меняются со временем; жёсткая схема колонок потребовала бы миграцию на каждый новый критерий. JSONB + реестр даёт добавление критерия правкой одного файла, сохраняя валидацию (в отличие от «свалки в JSON»). Толерантное отбрасывание неизвестных ключей позволяет FE/интеграциям слать лишние поля без поломки. Разделение структурной карточки (контакты, min order) и гибких `criteria` держит частые поля типизированными, а редкие/растущие — гибкими.

## Режимы отказа

- **Невалидное значение известного критерия** → 422 (не тихое сохранение мусора).
- **Неизвестный ключ** → тихо отбрасывается (намеренная толерантность; не ошибка).
- **`is_active=false`** — поставщик скрыт из активного выбора (soft-hide), не удалён (история накладных цела).
- **Риск:** consumer-аналитика не построена — критерии пока декларативны; продуктовая ценность (скоринг/сравнение) появляется только с потребителем.

## Связи

- ADR: [[ADR-017]] (supplier self-service — шов схемы `supplier_settings`, портал не построен; смежная тема условий); [[ADR-021]] (поставщики — локальный SSOT + единая серия `supplier_prices`, поверх которой сядет отложенный consumer-шов критериев).
- Сущности: [[suppliers]] (`criteria` JSONB + карточка).
- Требования: [[multitenancy]] (org-scope), [[sku-identity-resolver]] (`supplier_external_id` в композитном ключе moat), [[global-requirements]].

## На это ссылаются

`LCOS-F18` (Supplier flexible criteria registry), `LCOS-F17` (Supplier cards CRUD + delivery terms), [[LCOS-F40-ai-order-proposal]] (order planning — предполагаемый потребитель критериев при скоринге/предложении заказа).

## Источники

- APP_OVERVIEW.md §10; 01_ARCHITECTURE.md → Data model (`suppliers`, поля F3-B1, миграция 0006).
- Код: `app/domain/supplier_criteria.py` (`CriterionDef`), `app/api/v1/routes/suppliers.py`.
- Legacy (superseded): 08_PHASE1_SPEC.md F2.1.
