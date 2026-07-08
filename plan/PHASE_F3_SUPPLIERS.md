---
doc: plan/PHASE_F3_SUPPLIERS
title: Фаза F3 — Справочник поставщиков и история цен
version: 1.0.1
status: current
updated: 2026-07-03
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
- Сравнение поставщиков между собой (F4); импорт прайсов из Excel/PDF (Phase 2);
  вопросы в свободной форме «какая цена на молоко у X» (F10 — диалог).

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
- 2026-07-08 — реализован справочник поставщиков + условия поставок (F3-B1 + CRUD + mobile UI);
  история цен вынесена в следующий инкремент.
- 2026-07-03 v1.0.1 — терминология: «жена» → «пилотная кофейня».
- 2026-07-03 v1.0.0 — создан из стадии F3 (Functional_Stages) + блока C Specification_v04, адаптировано под web PWA и текущую архитектуру.
