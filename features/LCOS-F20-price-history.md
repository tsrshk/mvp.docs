---
id: LCOS-F20
type: feature
title: История цен + авто-сбор из инвойсов
epic: "[[LCOS-E4-suppliers]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[suppliers]]", "[[ingredients]]", "[[invoices]]", "[[invoice_lines]]", "[[packings]]", "[[price_list_line]]"]
requirements: ["[[multitenancy]]", "[[invoice-status-machine]]"]
adrs: []
legacy_refs: ["plan F3-B2", "plan F3-B3", "plan F3-B4", "plan F3-F1", "07 Э2"]
sources: ["plan/PHASE_F3_SUPPLIERS.md §1-3", "plan/PHASE_F3_SUPPLIERS.md AC-2/5/6/7", "APP_OVERVIEW.md §10", "mvp.be app/services/invoice_service.py"]
updated: 2026-07-13
---
# LCOS-F20 · История цен + авто-сбор из инвойсов

**Эпик:** [[LCOS-E4-suppliers]] · **Статус:** built · **Фаза:** Phase 1

## Описание

Боль: цены поставщиков живут «в голове», в WhatsApp и блокноте — невозможно сравнить или отследить. Продуктовый ответ: персональная книга цен поставщиков, где цены обновляются **автоматически** из каждого запостенного инвойса, а история изменений видна. Конкретно, каждый запостенный инвойс добавляет per-line наблюдения цен в append-only таблицу `supplier_prices`; «текущая цена» для пары `(supplier, ingredient)` — это просто последнее наблюдение по `observed_at`.

Это следующий инкремент эпика E4 после карточки поставщика + CRUD ([[LCOS-F17-supplier-cards]], построено). Карточка/справочник готовы; история цен (F3-B2/B3, маршруты `GET /suppliers/{id}/prices` и `/ingredients/{id}/price-history` из F3-B4, ручной ввод цены и UI цен) **не построена** — эта фича её покрывает. Сигнал изменения цены в потоке инвойсов — родственная [[LCOS-F21-price-change-signal]] (она читает предыдущую цену, которую эта фича записывает).

История никогда не перезаписывается: каждый инвойс добавляет строки. Цены хранятся за **базовую единицу SKU** — `unit_price` строки инвойса пересчитывается через фактор упаковки ([[packings]]), так что наблюдения сравнимы между размерами упаковок. Ручной ввод цены (владелец печатает цену) создаёт точку истории с `source_invoice_id = NULL`.

## Возможности

- (Запланировано) Append-only таблица `supplier_prices` (`OrganizationScopedMixin`, int pk): `supplier_id` (FK, CASCADE), `ingredient_id` (uuid FK→ingredients.id, **SET NULL** — удаление позиции каталога не стирает историю цены), `pos_ingredient_id varchar(256)` (durable POS-SKU для строк, разрешённых только до POS), `price_per_base_unit Numeric(14,4)` за базовую единицу, `currency varchar(8)` (по умолчанию BYN), `raw_name` (как строка была названа в инвойсе), `unit`, `qty` (контекст наблюдения), `source_invoice_id` (FK, SET NULL, nullable — NULL = ручной), `observed_at timestamptz` (дата инвойса, не `created_at`). Индексы: `(organization_id, supplier_id, ingredient_id, observed_at)` и `(organization_id, pos_ingredient_id, observed_at)`. Точная SQLAlchemy-спека — [[ARCH_SUPPLIER_PRICELISTS]] §1.1.
- (Запланировано) Дискриминатор источника наблюдения: `source varchar` (enum `invoice | manual | price_list_upload`, no, default `invoice`) плюс `source_price_list_line_id int` (FK→`price_list_lines.id`, SET NULL, yes) рядом с существующим `source_invoice_id`. Так `supplier_prices` становится единым временным рядом поверх всех источников цен, а даунстрим-фичи ([[LCOS-F21-price-change-signal]], сравнение поставщиков) работают одинаково независимо от того, откуда пришло наблюдение.
- (Запланировано) Авто-сбор в `InvoiceService.submit()`: при успешном сохранении `prepared`/`written` инвойса пишет одну строку `supplier_prices` на каждую строку с разрешённым SKU, цена за базовую единицу через фактор упаковки (Decimal-арифметика, без float).
- (Запланировано) Идемпотентность: повторная отправка того же инвойса (тот же `external_id`) не дублирует строки цен.
- (Запланировано) Проекция прайс-листов: каждая позиция загруженного прайса ([[price_list_line]] из [[LCOS-F73-price-list-parsing]]) с разрешённым SKU проецируется в одно наблюдение `supplier_prices` (`source = price_list_upload`, `observed_at` = дата наблюдения загрузки, цена = `price_per_base_unit`). Проекция идемпотентна по `source_price_list_line_id`. Так F20 покрывает и цены из инвойсов, и цены из прайс-листов единым временным рядом.
- (Запланировано) `GET /suppliers/{id}/prices` — текущая цена на SKU (последний `observed_at`) плюс предыдущая цена и % изменения.
- (Запланировано) `GET /ingredients/{id}/price-history?supplier_id=` — серия точек цен для графика.
- (Запланировано) `POST /suppliers/{id}/prices` — ручной ввод цены (`source_invoice_id = NULL`).
- (Запланировано) `PriceService` (слой services) + `SupplierPriceRepository` (scope организации в конструкторе); весь роутер остаётся за гейтом модуля `suppliers`.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Видит книгу цен поставщика и историю на SKU; вводит цену вручную. Цены авто-появляются из постящихся им инвойсов. Право = «любой member subdivision» (plan F3-B4). |
| [[admin]] | То же, внутри subdivision. |
| [[superadmin]] | Межарендаторский доступ. |
| [[sqladmin-operator]] | Не участвует; переключает гейт модуля `suppliers` в плоскости SQLAdmin (см. [[LCOS-F6-module-gates]]). |

Scope арендатора (`organization_id`) приходит из активного контекста JWT; цены org-A не должны быть видны из scope org-B (см. [[multitenancy]]).

## Задействованные сущности

- [[suppliers]] — владелец книги цен; FK `supplier_prices.supplier_id` (CASCADE).
- [[ingredients]] — SKU, для которого наблюдается цена; FK `supplier_prices.ingredient_id` (CASCADE); `/ingredients/{id}/price-history` читает по ингредиенту.
- [[invoices]] — источник авто-собранного наблюдения; FK `supplier_prices.source_invoice_id` (SET NULL); `observed_at` = дата инвойса.
- [[invoice_lines]] — каждая строка с разрешённым SKU даёт одно наблюдение; `raw_name`/`unit`/`qty` несут контекст строки.
- [[packings]] — фактор упаковки пересчитывает `unit_price` к цене за базовую единицу, так что наблюдения сравнимы.

## Зависимости / связи

- **Требования:** [[multitenancy]] (новая таблица несёт `organization_id`, изоляция протестирована), [[invoice-status-machine]] (авто-сбор выполняется внутри `submit()` для `prepared`/`written` инвойсов; идемпотентность повторной отправки).
- **Фичи:** [[LCOS-F17-supplier-cards]] (родительский справочник/карточка — построено), [[LCOS-F21-price-change-signal]] (читает предыдущую цену, записанную здесь, чтобы поднять предупреждение об изменении), [[LCOS-F10-invoice-status-machine]] (путь submit, триггерящий авто-сбор), [[LCOS-F13-sku-identity-resolver]] (записываются только строки с разрешённым SKU), [[LCOS-F72-supplier-price-list-upload]]/[[LCOS-F73-price-list-parsing]] (загрузка и парсинг прайс-листов/фото/буклетов/сообщений, чьи позиции проецируются сюда как наблюдения `source = price_list_upload`). Импорт цен из Excel/CSV/текста/PDF/фото больше не вне scope — он покрыт [[LCOS-F72-supplier-price-list-upload]] и [[LCOS-F73-price-list-parsing]]; межпоставщиковое сравнение — родственная фича эпика E4.

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. Миграция `supplier_prices` применяется и откатывается; таблица несёт `organization_id`; тест изоляции арендаторов: цены org-A не видны из scope org-B. (plan F3 AC-1)
- [ ] AC-BE-2. Отправка `prepared`/`written` инвойса с 2 замапленными строками создаёт 2 строки `supplier_prices` с корректной ценой **за базовую единицу** (пересчёт по фактору упаковки — Decimal юнит-тест, без float); повторная отправка не дублирует. (plan F3 AC-2)
- [ ] AC-BE-3. `GET /suppliers/{id}/prices` возвращает, на SKU, последнюю цену, предыдущую цену и % изменения (тест с 3 точками истории). (plan F3 AC-5)
- [ ] AC-BE-4. `GET /ingredients/{id}/price-history?supplier_id=` возвращает упорядоченную серию точек цен (дата + источник). (plan F3 AC-6)
- [ ] AC-BE-5. `POST /suppliers/{id}/prices` создаёт точку истории с `source_invoice_id = NULL` (ручной ввод). (plan F3 AC-7)
- [ ] AC-BE-6. История append-only: каждый инвойс добавляет строки, ни одна не перезаписывается; «текущая цена» = последняя по `observed_at` на `(supplier, ingredient)`.
- [ ] AC-BE-7. Маршруты за `module_suppliers_enabled`: отключение в SQLAdmin → 404 на всех маршрутах цен. (plan F3 AC-8)
- [ ] AC-BE-8. `supplier_prices` несёт `source` (enum `invoice | manual | price_list_upload`, default `invoice`) и `source_price_list_line_id` (FK→`price_list_lines`, SET NULL); миграция расширяет таблицу без потери существующих наблюдений (существующие строки → `source = invoice`).
- [ ] AC-BE-9. Разрешённая позиция прайса ([[price_list_line]] из [[LCOS-F73-price-list-parsing]]) проецируется в одно наблюдение `supplier_prices` (`source = price_list_upload`, `observed_at` из загрузки, цена = `price_per_base_unit`); проекция идемпотентна по `source_price_list_line_id` (повторный парсинг/переразбор не дублирует наблюдения).

### Frontend
- [ ] AC-FE-1. Карточка поставщика показывает таблицу цен (SKU → текущая цена, дата, стрелка/% изменения с warn-подсветкой при росте). (plan F3-F1)
- [ ] AC-FE-2. История цен на SKU видна (как минимум таблица точек с датами и источником «инвойс №… / вручную»; простой sparkline/график приемлем только если не раздувает бандл — решение записано в рабочем журнале). (plan F3 AC-6)
- [ ] AC-FE-3. Ручной ввод цены из UI создаёт точку с `source_invoice_id = NULL`. (plan F3 AC-7)
- [ ] AC-FE-4. `entities/supplier` получает RTK-endpoints для цен/истории (`injectEndpoints` + `queryFn`); провайдер `backend | mock` возвращает демо-цены в dev.

### Прочее
- [ ] AC-OTHER-1. Метрика готовности: все реальные поставщики пилотной кофейни (7–12) внесены, и после первого реального инвойса их цены появляются автоматически — записано в `work/phase-f3.md`. (plan F3 AC-9)

## Открытые вопросы / гейты

- **Ещё не построено:** `supplier_prices`, авто-сбор в `submit()`, маршруты цен/истории и ручной ввод, а также UI цен — это открытый инкремент F3 (plan F3 status 2026-07-08: F3-B2/B3, F3-B4 маршруты цен, F3-F2 открыты). AC-2/3/5/6/7/9 плана F3 остаются открытыми.
- **Библиотека графиков:** рисовать ли sparkline/график или простую таблицу точек оставлено на усмотрение исполнителя во избежание раздувания бандла; решение зажурналить.
- **Аналитика потребителя (REQ 1b):** история цен — естественный вход для скоринга поставщиков, но этот потребитель отложен по решению checkpoint.

## Источники

- `plan/PHASE_F3_SUPPLIERS.md §1` (F3-B2 схема `supplier_prices`, F3-B3 авто-сбор + идемпотентность), `§2` (F3-B4 маршруты + `PriceService`/`SupplierPriceRepository`), `§3` (F3-F1/F3-F2 UI), `§5 AC-1/2/5/6/7/8/9`, «Статус реализации (2026-07-08)» (список НЕ построено).
- `APP_OVERVIEW.md §10` (поставщики + критерии), `§11` (модель данных — `suppliers`, `invoices`, `packings`).
- `mvp.be/app/services/invoice_service.py` (`submit()` — точка подключения авто-сбора).
