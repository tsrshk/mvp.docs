---
id: LCOS-F73
type: feature
title: Парсинг прайс-листа поставщика
epic: "[[LCOS-E4-suppliers]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[price_list_upload]]", "[[price_list_line]]"]
requirements: ["[[sku-identity-resolver]]", "[[fail-closed]]", "[[erp-esupl-integration]]"]
adrs: ["[[ADR-021]]"]
legacy_refs: []
sources: ["mvp.be app/providers/ocr/base.py", "mvp.be app/domain/supplier_criteria.py", "entities/price_list_upload.md", "entities/price_list_line.md"]
updated: 2026-07-13
---
# LCOS-F73 · Парсинг прайс-листа поставщика
**Эпик:** [[LCOS-E4-suppliers]] · **Статус:** planned · **Фаза:** Phase 1

## Описание

Фича превращает загруженный документ поставщика (см. [[LCOS-F72-supplier-price-list-upload]]) в структурированные позиции [[price_list_line]]. Решение владельца Р1 фиксирует **полный парсинг сразу**: любой вход — Excel/CSV/текст/сообщение/PDF/фото/буклет — прогоняется через парсинг/OCR в строки прайса. Фото и буклет — самый сложный вход, но он **в скоупе v1**.

Парсинг **деградирует мягко**: строки с низкой уверенностью не блокируют загрузку. При недостаточной уверенности загрузка помечается `status=needs_review`, и строки дочищаются вручную на экране проверки (как у накладных). Так поставщик получает данные даже из «грязного» входа, а качество добирается человеком.

Каждая распознанная строка проходит **резолв идентичности SKU** через [[LCOS-F13-sku-identity-resolver]] и `sku_mapping` по паре `(supplier_external_id, нормализованный raw_name)`. Разрешённые строки **проецируются** в единый временной ряд `supplier_prices` ([[LCOS-F20-price-history]]) с дискриминатором `source=price_list_upload` — так сигнал изменения цены (F21) и сравнение поставщиков (F4) работают поверх всех источников.

## Возможности

- Новый seam `OcrProvider.extract_price_list(...) -> список позиций прайса` поверх той же egress/провайдер-инфраструктуры OCR (claude/gemini, provider context, VPN-guard), что и `extract_invoice` ([[LCOS-F8-ocr-recognition]]).
- **Отдельный layout-профиль прайса**: у прайса нет хедера накладной, другой layout, возможен буклет/сообщение — поэтому профиль парсинга отдельный, не переиспользует профиль накладной.
- Полный парсинг любого входа (Р1); OCR фото/буклета включён.
- **Confidence-gate**: низкоуверенные строки → `upload.status=needs_review`; ручная дочистка не блокирует загрузку (мягкая деградация).
- SKU-резолв каждой строки через [[LCOS-F13-sku-identity-resolver]] и `sku_mapping` по `(supplier_external_id, нормализованный raw_name)`; `resolution_method` ∈ {fuzzy, ai} автоматически, `manual` — при ручном подтверждении.
- Проекция разрешённых строк в `supplier_prices` ([[LCOS-F20-price-history]]), идемпотентно по `source_price_list_line_id`.
- **Нормализация цены** к базовой единице через фактор фасовки ([[packings]]): `price_per_base_unit` заполняется, когда SKU разрешён.
- Append-only инвариант [[price_list_line]]: `price`/`raw_*`/`observed_at` не меняются; дозаполняются только `resolution_*` — история цен не нарушается.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Запускает переразбор и дочищает распознанные строки (подтверждает привязку к SKU) внутри своего scope арендатора. |
| [[admin]] | То же внутри subdivision. |
| [[superadmin]] | Межарендаторский доступ. |

## Задействованные сущности

- [[price_list_upload]] — источник входа и метаданных; парсинг переводит `status`: `uploaded/parsing → parsed` либо `→ needs_review` (confidence-gate) либо `→ failed`; хранит `parse_provider`, `parse_confidence`, `effective_date`.
- [[price_list_line]] — результат парсинга (append-only); `observed_at` берётся из загрузки (`effective_date`, иначе дата загрузки) и служит драйвером freshness; `resolution_*` дозаполняются при дочистке; `price_per_base_unit` нормализуется через фактор фасовки.

## Зависимости / связи

- **Фичи:** [[LCOS-F72-supplier-price-list-upload]] (даёт загрузку и триггер парсинга), [[LCOS-F8-ocr-recognition]] (egress/провайдер-инфраструктура OCR, переиспользуется через `extract_price_list`), [[LCOS-F13-sku-identity-resolver]] (резолв идентичности SKU по `sku_mapping`), [[LCOS-F20-price-history]] (проекция в `supplier_prices`).
- **ADR:** [[ADR-021]] (поставщик — локальный SSOT; матчинг и durable `supplier_external_id` через Esupl following).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `extract_price_list(...)` возвращает список позиций прайса, используя ту же egress/провайдер-инфраструктуру, что и `extract_invoice`, но с отдельным layout-профилем прайса.
- [ ] AC-BE-2. Парсинг создаёт `price_list_lines` с `observed_at` из загрузки (`effective_date`, иначе дата загрузки).
- [ ] AC-BE-3. Низкая уверенность парсинга → `upload.status=needs_review` (confidence-gate); строки не блокируют загрузку.
- [ ] AC-BE-4. SKU-резолв строки через [[LCOS-F13-sku-identity-resolver]] и `sku_mapping` по `(supplier_external_id, нормализованный raw_name)`; `resolution_method` ∈ {fuzzy, ai}.
- [ ] AC-BE-5. `PATCH /price-list-lines/{id}` правит/подтверждает связь строки с SKU (`resolution_method=manual`); правятся только `resolution_*`, поля `price`/`raw_*`/`observed_at` неизменны (append-only).
- [ ] AC-BE-6. `POST /price-lists/{id}/parse` выполняет переразбор загрузки.
- [ ] AC-BE-7. Проекция разрешённых строк в `supplier_prices` идемпотентна по `source_price_list_line_id` (`source=price_list_upload`, `observed_at` из загрузки, цена = `price_per_base_unit`).
- [ ] AC-BE-8. Нормализация к базовой единице через фактор фасовки ([[packings]]); вся ценовая арифметика на `Decimal`, без `float`.
- [ ] AC-BE-9. Изоляция арендаторов: парсинг и резолв не видят данные другой организации.

### Frontend
- [ ] AC-FE-1. Экран проверки распознанных строк (как у накладных) с подсветкой `needs_review`.
- [ ] AC-FE-2. Ручная привязка строки к SKU из экрана проверки (`resolution_method=manual`).

### Прочее
- [ ] AC-OTHER-1. Точность парсинга структурированного прайса ≥ порога на пилотном наборе; результат замера зажурналить.

## Открытые вопросы / гейты

- Порог confidence-gate (значение `parse_confidence`, ниже которого загрузка уходит в `needs_review`) — калибруется на пилотном наборе.
- Целевой порог точности парсинга структурированного прайса — зафиксировать по итогам пилота.
- Профиль парсинга буклета/сообщения (самый сложный вход) — уточнить layout-эвристики после первых реальных загрузок.

## Источники

- `mvp.be/app/providers/ocr/base.py` (`OcrProvider`, новый метод `extract_price_list`).
- `entities/price_list_upload.md`, `entities/price_list_line.md` (схема данных, append-only инвариант).
- Решение владельца Р1 (полный парсинг сразу, фото/буклет в скоупе, мягкая деградация через `needs_review`), Р2 (проекция в `supplier_prices`).
