---
doc: plan/PHASE_F3_SUPPLIERS
title: Фаза F3 — Справочник поставщиков и история цен
version: 1.1.0
status: current
updated: 2026-07-13
verified_against_code: n/a
owner: Ivan
supersedes: []
superseded_by: none
trust_tier: 2
ssot_for: [phase-f3-requirements]
---

# Фаза F3 — Справочник поставщиков и история цен

> Боль: цены и условия поставщиков — «в голове», WhatsApp и блокноте; сравнить невозможно.
> Продукт: персональная база поставщиков, цены обновляются АВТОМАТИЧЕСКИ из каждой
> проведённой накладной, история изменений видна. Стадия F3 из исходного роадмапа,
> переадаптированная под web PWA (Telegram-бот из старой спеки — мёртв).
> Сквозные требования — `00_IMPLEMENTATION_PLAN.md` §4 (G1–G11).

**Цель:** 100% активных поставщиков в справочнике; цены обновляются автоматически при
каждой новой накладной; изменение цены видно сразу.

**Зависимости:** S1 (стабилизация). **Оценка:** 2 недели. Масштаб данных: 7–12 поставщиков,
50–150 SKU, 20–40 накладных/мес.

---

## 1. Модель данных (backend)

### F3-B1. Расширение `suppliers`
Добавить (миграция, все поля nullable):
- `contact_name`, `phone`, `messenger` (str) — контакты;
- `delivery_terms` (Text) — условия доставки свободным текстом;
- `min_order_amount Numeric(14,2)`, `min_order_note` (str) — минимальная партия;
- `is_active` (bool, default True) — скрытие неактуальных без удаления (FK RESTRICT).

### F3-B2. Новая таблица `supplier_prices` (история цен, append-only)
`OrganizationScopedMixin`, int pk:
- `supplier_id` FK→suppliers (CASCADE), `ingredient_id` FK→ingredients (CASCADE);
- `price Numeric(14,4)` (цена за базовую единицу SKU), `currency` (str, default BYN);
- `raw_name` (Text) — как позиция называлась в накладной;
- `unit` (str), `qty Numeric(14,3)` — контекст наблюдения;
- `source_invoice_id` FK→invoices (SET NULL, nullable) — откуда цена; NULL = ручной ввод;
- `observed_at` (DateTime tz) — дата накладной (не created_at).
- Индексы: `(organization_id, ingredient_id, observed_at)`, `(organization_id, supplier_id)`.
- История НЕ перезаписывается: каждая накладная добавляет строки; «текущая цена» =
  последняя по `observed_at` для (supplier, ingredient).

### F3-B3. Автосбор цен из накладных
- В `InvoiceService.submit()`: при успешном персисте накладной со статусом
  `prepared`/`written` — для каждой строки с разрешённым SKU записать `supplier_prices`
  (цена за базовую единицу: `unit_price` пересчитанный через фактор фасовки).
- Идемпотентность: повторный submit той же накладной (same external_id) не дублирует строки.
- Сравнение с предыдущей ценой того же (supplier, ingredient): расхождение >
  `price_change_alert_pct` (новая настройка `REGISTRY`, default 5%) → warning в ответе
  submit + пометка на строке цены (`is_change` вычислимо, отдаётся API).

## 2. API (backend)

### F3-B4. Роуты (`/api/v1`, за гейтом существующего `module_suppliers_enabled`)
- `GET /suppliers` — расширить полями F3-B1 + `last_delivery_at` (по накладным).
- `POST /suppliers`, `PATCH /suppliers/{id}` — CRUD карточки (тенант-скоуп из JWT;
  права: любой member подразделения).
- `GET /suppliers/{id}/prices` — текущий прайс: последняя цена по каждому SKU
  (+ предыдущая цена и % изменения).
- `GET /ingredients/{id}/price-history?supplier_id=` — история точек цены для графика.
- `POST /suppliers/{id}/prices` — ручной ввод цены (source_invoice_id=NULL).
- Схемы — Pydantic в `api/v1/schemas.py`; сервис `SupplierService` расширяется,
  логика цен — новый `PriceService` (services-слой, репозиторий `SupplierPriceRepository`
  со скоупом org в конструкторе).

## 3. Frontend

### F3-F1. Страница «Поставщики» (`pages/suppliers`, пункт в сайдбар/таб-бар)
- Список: имя, контакты, последняя поставка, число SKU в прайсе; мобильные карточки.
- Карточка поставщика: реквизиты (редактируемые), условия, мин. партия; прайс-таблица
  (SKU → текущая цена, дата, стрелка/процент изменения с warn-подсветкой роста).
- История цены SKU: простой график/спарклайн или таблица точек (без сторонних
  chart-библиотек, если это тянет бандл — достаточно таблицы; решение за исполнителем,
  зафиксировать в журнале).
- FSD: `entities/supplier` расширяется endpoint'ами (`injectEndpoints` + `queryFn`),
  провайдер-паттерн `backend|mock` — mock отдаёт демо-прайсы.

### F3-F2. Сигнал изменения цены в потоке накладной
- В workbench/после отправки: если бэк вернул warnings об изменении цен — показать их
  в существующем механизме (toast/панель предупреждений): «Молоко 3.2%: 2.80 → 3.10 BYN (+10.7%)».

## 4. Вне объёма
- Сравнение поставщиков между собой (F4);
  вопросы в свободной форме «какая цена на молоко у X» (F10 — диалог).
- ~~Импорт прайсов из Excel/PDF (Phase 2)~~ — СНЯТО: по [[ADR-021]] загрузка и парсинг
  прайс-листов/буклетов/сообщений/ФОТО введена в скоуп фичами F72–F75 (раздел 6 ниже);
  вход прогоняется через полный парсинг/OCR в структурированные строки.

---

## 5. Acceptance Criteria

- [ ] AC-1. Миграции применяются и откатываются; новые таблицы несут `organization_id`
      (RESTRICT); тест tenant-изоляции: цены org A не видны из скоупа org B.
- [ ] AC-2. Отправка накладной (status prepared/written) с 2 замапленными строками создаёт
      2 строки `supplier_prices` с корректной ценой за базовую единицу (пересчёт фасовки —
      unit-тест на Decimal, без float); повторный submit не дублирует.
- [ ] AC-3. Цена, изменившаяся больше порога из `system_settings` (default 5%), возвращает
      warning в ответе и подсвечена в прайсе поставщика; порог меняется из SQLAdmin без
      редеплоя (тест резолвера + ручная проверка).
- [ ] AC-4. CRUD поставщика работает из UI (создать, отредактировать контакты/условия,
      скрыть неактивного); браузерная верификация на мобильном вьюпорте.
- [ ] AC-5. `GET /suppliers/{id}/prices` отдаёт по каждому SKU последнюю цену, предыдущую
      и % изменения (тест с 3 точками истории).
- [ ] AC-6. История цены SKU видна в UI (минимум таблица точек с датами и источником
      «накладная №…/вручную»).
- [ ] AC-7. Ручной ввод цены через UI создаёт точку истории с `source_invoice_id=NULL`.
- [ ] AC-8. Роуты фазы закрыты `module_suppliers_enabled` (выключение в SQLAdmin → 404,
      UI-раздел скрыт); mock-провайдер FE работает в демо-режиме.
- [ ] AC-9. Метрика готовности: все реальные поставщики пилотной кофейни заведены (7–12), после первой
      же реальной накладной их цены появились автоматически — фиксация в `work/phase-f3.md`.
- [ ] AC-10. Общий DoD G10 (pytest+ruff+build зелёные; 01_ARCHITECTURE: таблица
      supplier_prices, роуты; 03_ROADMAP бампнут).

---

## 6. Прайс-листы и ассортимент поставщика (F72–F75, [[ADR-021]])

Расширение фазы: любой вход (Excel/CSV/текст/сообщение/PDF/ФОТО/буклет) поставщик-менеджер
загружает по поставщику, вход прогоняется через полный парсинг/OCR в структурированные строки
(Р1: мягкая деградация — низкоуверенные строки помечаются `needs_review` и дочищаются вручную,
не блокируя загрузку). Разрешённые позиции проецируются в единый временной ряд `supplier_prices`
(F3-B2 / [[LCOS-F20-price-history]]) с дискриминатором `source`, поверх которого работают сигнал
изменения ([[LCOS-F21-price-change-signal]]) и сравнение ([[PHASE_F4_SUPPLIER_COMPARE]]).
Спека фич: [[LCOS-F72-supplier-price-list-upload]], [[LCOS-F73-price-list-parsing]],
[[LCOS-F74-supplier-assortment-freshness]], [[LCOS-F75-supplier-price-analytics]];
сущности [[price_list_upload]], [[price_list_line]].

### F72 — загрузка и хранение прайса (backend)

- Миграция: таблица `price_list_uploads` (scope=org, pk `id` int) — поля `organization_id`
  (FK→organizations RESTRICT, indexed), `supplier_id` (FK→suppliers.id CASCADE), `source_kind`
  (`price_file|photo|booklet|message`), `mime_type`, `original_filename`, `storage_ref`, `raw_text`,
  `effective_date` (date, nullable — при NULL freshness берёт дату загрузки), `status`
  (`uploaded|parsing|parsed|needs_review|failed`), `parse_provider`, `parse_confidence`
  numeric(4,3), `version` int (монотонная на пару `(organization_id, supplier_id)`), `uploaded_by`
  (FK→users.id SET NULL), `note`, TimestampMixin. Индексы `(organization_id, supplier_id)` и
  `(organization_id, supplier_id, version)`.
- Хранение исходного документа/фото (storage_ref) + метаданные; версии append-only (новая загрузка
  инкрементит `version`, старые остаются).
- Роуты за гейтом `module_suppliers_enabled`, тенант-скоуп из JWT:
  `POST /suppliers/{id}/price-lists` (multipart: файл/фото ИЛИ `raw_text` для сообщения + optional
  `effective_date`), `GET /suppliers/{id}/price-lists` (список версий),
  `GET /price-lists/{upload_id}` (одна загрузка + статус). После upload — авто-триггер парсинга (F73).

### F73 — парсинг прайса → `price_list_lines` (backend)

- Миграция: таблица `price_list_lines` (scope=org, pk `id` int, append-only) — `organization_id`
  (FK→organizations RESTRICT, indexed), `price_list_upload_id` (FK→price_list_uploads.id CASCADE),
  `supplier_id` (FK→suppliers.id CASCADE, денормализовано), `line_no` int, `raw_name` varchar(512),
  `raw_unit`, `raw_packing`, `price` numeric(14,4), `currency` (default BYN), `price_per_base_unit`
  numeric(14,4, nullable), `pos_ingredient_id` varchar(64, nullable), `ingredient_id`
  (FK→ingredients.id SET NULL, nullable), `resolution_method` (`manual|fuzzy|ai|unresolved`),
  `resolution_confidence` numeric(4,3), `is_available` bool (default true), `observed_at` date
  (ДРАЙВЕР freshness = `effective_date` загрузки, иначе дата загрузки), `created_at`. Индексы
  `(organization_id, supplier_id, observed_at)`, `(organization_id, pos_ingredient_id, observed_at)`,
  `(price_list_upload_id)`. Инвариант: `price/raw_*/observed_at` неизменны после создания; поля
  `resolution_*` могут дозаполняться при ручной дочистке.
- Новый метод `OcrProvider.extract_price_list(...)` -> список позиций прайса (отдельный layout-профиль:
  нет накладной-хедера, возможен буклет/сообщение/фото); переиспользует egress/провайдер-инфраструктуру
  (claude/gemini, providers/http, provider context, VPN-guard) от `extract_invoice`.
- Confidence-gate: низкоуверенные строки → `upload.status=needs_review`; парсинг деградирует мягко.
- SKU-резолв каждой строки через [[LCOS-F13-sku-identity-resolver]] + `sku_mapping` по
  `(supplier_external_id, нормализованный raw_name)`, `resolution_method` fuzzy/ai + ручное
  подтверждение (manual); нормализация цены к базовой единице через фактор фасовки (`packings`).
- Проекция: каждая разрешённая `price_list_line` пишет одно наблюдение в `supplier_prices`
  (`source=price_list_upload`, `observed_at` из загрузки, цена = `price_per_base_unit`), идемпотентно
  по `source_price_list_line_id`. Расширение `supplier_prices` (F3-B2): добавить `source`
  (`invoice|manual|price_list_upload`, default invoice) и `source_price_list_line_id`
  (FK→price_list_lines.id SET NULL) рядом с `source_invoice_id`.
- Роуты: `POST /price-lists/{id}/parse` (переразбор), `PATCH /price-list-lines/{id}` (ручная
  правка/подтверждение связи с SKU).

### F74 — ассортимент и freshness (backend + frontend)

- Backend: `GET /suppliers/{id}/assortment` — последняя `price_list_line` на пару
  `(supplier, разрешённый SKU / raw_name)` с ценой и freshness по `observed_at`.
- Frontend: вкладка «Ассортимент» на карточке поставщика (`pages/suppliers`) — список позиций,
  цена, freshness («обновлено N дней назад», подсветка устаревших); FSD `entities/supplier`
  расширяется endpoint'ом (RTK `injectEndpoints`, провайдер `backend|mock`).

### F75 — аналитика цен и ассортимента (planned, даунстрим)

- Поверх единого `supplier_prices` (F20): рост цены по SKU во времени, рост ассортимента
  (кол-во уникальных предлагаемых SKU во времени), по всем источникам `source`.
- Реализуется ПОСЛЕ F72–F74; лёгкий AC. Родственные: [[LCOS-F21-price-change-signal]],
  [[PHASE_F4_SUPPLIER_COMPARE]].

### AC расширения (F72–F75)

- [ ] AC-11. Миграции `price_list_uploads`/`price_list_lines` применяются и откатываются; обе таблицы
      несут `organization_id` (RESTRICT); тест tenant-изоляции (прайсы org A не видны из org B).
- [ ] AC-12. `POST /suppliers/{id}/price-lists` принимает и файл/фото, и `raw_text`, сохраняет
      `storage_ref`/метаданные, инкрементит `version`, авто-триггерит парсинг; за гейтом
      `module_suppliers_enabled` (404 при выкл).
- [ ] AC-13. `extract_price_list` парсит фото/буклет → `price_list_lines`; низкоуверенные строки →
      `status=needs_review`, загрузка не блокируется; `PATCH /price-list-lines/{id}` дочищает связь с SKU.
- [ ] AC-14. Разрешённая строка проецируется в `supplier_prices` c `source=price_list_upload` и
      корректной ценой за базовую единицу; повторный парсинг идемпотентен по `source_price_list_line_id`.
- [ ] AC-15. `GET /suppliers/{id}/assortment` отдаёт последнюю позицию на пару (supplier, SKU) с
      freshness; вкладка «Ассортимент» видна в UI (мобильный вьюпорт), устаревшие подсвечены.
- [ ] AC-16. F75 (даунстрим): аналитика роста цены/ассортимента считается поверх `supplier_prices`
      по всем `source` — реализуется после F72–F74.

---

## Статус реализации (2026-07-08)

**СДЕЛАНО — «Справочник поставщиков и условия поставок» (первый инкремент F3):**
- F3-B1: `suppliers` расширена (миграция `0006`): `contact_name/phone/messenger`,
  `delivery_terms`, `min_order_amount/min_order_note`, `is_active` (soft-hide). Autogenerate diff пуст.
- F3-B4 (частично): CRUD-роуты `GET /suppliers`, `GET /suppliers/{id}`, `POST /suppliers`,
  `PATCH /suppliers/{id}` — за гейтом `module_suppliers_enabled` (весь роутер; 404 при выкл).
  `SupplierService.create_card/update_card`, `SupplierRepository.create/update`,
  схемы `SupplierCreate/SupplierUpdate/SupplierOut` (расширена).
- F3-F1 (карточка/справочник): mobile-first страница `pages/suppliers` (адаптивные карточки,
  bottom-sheet форма, 44px таргеты), nav «Поставщики» (сайдбар + drawer + заголовок),
  `entities/supplier` — RTK endpoints `getManagedSuppliers/createSupplier/updateSupplier`
  (backend-direct, тег `Supplier`). Прайс-график/спарклайн — вне этого инкремента.
- Тесты: `tests/test_suppliers_crud.py` (create/patch-partial/deactivate/get/404/validation/
  **tenant-isolation**/**module-gate**) — зелёные; FE `tsc -b` + `vite build` зелёные;
  e2e smoke на живом бэке (login→create 201→patch 200).

**НЕ СДЕЛАНО (следующие инкременты F3):** F3-B2 `supplier_prices` (история цен, append-only),
F3-B3 автосбор цен из накладной + price-change warning, F3-B4 `GET /suppliers/{id}/prices` +
`GET /ingredients/{id}/price-history` + ручной ввод цены, F3-F2 сигнал изменения цены. AC-2/3/5/6/7/9
относятся к этим инкрементам и остаются открытыми.

## Журнал изменений
- 2026-07-13 v1.1.0 — добавлен раздел 6 (прайс-листы и ассортимент, F72–F75) по [[ADR-021]];
  снят пункт «импорт прайсов из Excel/PDF (Phase 2)» из «Вне объёма» — введён в скоуп v1.
- 2026-07-08 — реализован справочник поставщиков + условия поставок (F3-B1 + CRUD + mobile UI);
  история цен вынесена в следующий инкремент.
- 2026-07-03 v1.0.1 — терминология: «жена» → «пилотная кофейня».
- 2026-07-03 v1.0.0 — создан из стадии F3 (Functional_Stages) + блока C Specification_v04, адаптировано под web PWA и текущую архитектуру.
