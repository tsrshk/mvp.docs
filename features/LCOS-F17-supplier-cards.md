---
id: LCOS-F17
type: feature
title: Карточки поставщиков — CRUD справочника + условия поставки
epic: "[[LCOS-E4-suppliers]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[suppliers]]", "[[organizations]]", "[[subdivisions]]"]
requirements: ["[[LCOS-F6-module-gates]]", "[[multitenancy]]", "[[erp-esupl-integration]]", "[[supplier-criteria-registry]]"]
adrs: ["[[ADR-004]]", "[[ADR-008]]", "[[ADR-021]]"]
legacy_refs: [07 Э2, plan F3-B1, plan F3-B4, plan F3-F1, "APP §10"]
sources: ["plan/PHASE_F3_SUPPLIERS.md (status 2026-07-08)", "APP_OVERVIEW.md §10", "mvp.be app/api/v1/routes/suppliers.py", "mvp.be app/services/supplier_service.py"]
updated: 2026-07-13
---
# LCOS-F17 · Карточки поставщиков — CRUD справочника + условия поставки
**Эпик:** [[LCOS-E4-suppliers]] · **Статус:** built · **Фаза:** Phase 1

## Описание

Персональный справочник поставщиков для пилотной кофейни: имя, контакты, условия и минимальный заказ — вместо «в голове, WhatsApp и блокноте». Поставщики зеркалятся из POS (команды following Esupl арендатора) через `POST /suppliers/sync`, и поверх зеркала LCOS поддерживает **редактируемую карточку** (контакты, `delivery_terms`, `min_order_amount`/`min_order_note`) и мягко скрывает устаревших (`is_active`, без физического удаления — FK RESTRICT).

Это первый инкремент эпика E4: **справочник + карточка + CRUD** реализованы. Гибкие критерии (`Supplier.criteria` JSONB + реестр) — это смежная фича [[LCOS-F18-supplier-criteria]]; история цен и авто-сбор из инвойсов — [[LCOS-F20-price-history]] / [[LCOS-F21-price-change-signal]] (📝 запланировано). Весь роутер suppliers — за гейтом модуля `suppliers` (см. [[LCOS-F6-module-gates]]): выключение его в SQLAdmin → `404` на всех endpoint-ах, раздел скрыт в UI.

Карточка также обслуживает поток инвойсов: `POST /suppliers/match` авто-разрешает поставщика из текста инвойса (налоговый ID → имя), а `GET /suppliers/search` питает выпадающий список в SKU-dropdown.

### doc↔code и целевое состояние (по [[ADR-021]])

СЕЙЧАС `GET /suppliers` и `GET /suppliers/search` — живой pass-through из Esupl following (`routes/suppliers.py:42-73`) по [[DEC-0011]] «POS = SSOT»; локальная таблица `suppliers` помечена в коде как «больше не источник справочника». Это противоречит настоящему доку и [[suppliers]] (там справочник описан как локальный). [[ADR-021]] **реверсирует ровно эту часть** [[DEC-0011]] — только для справочника **поставщиков** (каталог ингредиентов остаётся POS-SSOT): чтение справочника (`GET /suppliers`, `GET /suppliers/search`) переводится с живого Esupl pass-through на **локальную таблицу `suppliers`** (локальный SSOT поставщика). `POST /suppliers/sync` при этом сохраняется как **обогащение** из POS (upsert из Esupl following по `external_id`), а Esupl following используется только для matching и durable `supplier_external_id` в `sku_mapping`. Локальная карточка (`POST/PATCH/GET /suppliers/{id}`, `sync`, `match`) не меняется.

## Возможности

- `GET /suppliers` — локальный справочник (карточки арендатора).
- `GET /suppliers/{id}` — карточка (или `404`).
- `POST /suppliers` — создать карточку вручную (`201`), scope арендатора из активного контекста.
- `PATCH /suppliers/{id}` — частичное обновление (`exclude_unset`): контакты / условия / минимальный заказ / `is_active`; явный `null` в `criteria` трактуется как «не трогать» (не ломает flush NOT NULL).
- `POST /suppliers/sync` — синхронизация из POS (`get_esupl_access` → `list_suppliers` → upsert по `external_id`); без привязанной команды Esupl → `400`.
- `POST /suppliers/match` — авто-разрешение по налоговому ID (точное) → имени (смешанный скор); `null` = не найдено.
- `GET /suppliers/search?q=` — поиск по имени (регистронезависимое частичное) для выпадающего списка.
- `GET /suppliers/criteria-schema` — определения критериев из реестра (объявлен ПЕРЕД `/{supplier_id}`, чтобы путь не был перехвачен как id).
- **Авто-разрешение имени** — смешанный скор: символьные триграммы (Dice) вес `0.65` + токенный Jaccard вес `0.35`, порог `_MIN_NAME_SCORE = 0.4`; налоговый ID (`tax_id`) — приоритетное точное совпадение.
- FE: mobile-first страница «Поставщики» (адаптивные карточки, форма bottom-sheet, цели 44px), пункт навигации (сайдбар + drawer), RTK-endpoints `entities/supplier`.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Полный CRUD карточек своей subdivision (создать, редактировать контакты/условия, скрыть неактивную), запуск sync, поиск/match поставщика. Права — «любой member subdivision» (plan F3-B4). |
| [[admin]] | То же внутри subdivision. |
| [[superadmin]] | Межарендаторский доступ. |
| [[sqladmin-operator]] | Не делает CRUD карточек; включает/выключает гейт модуля `suppliers` в плоскости SQLAdmin (`404`, если отключён). |

Scope арендатора (`organization_id`) — из активного контекста JWT; изоляция покрыта тестом (`tenant-isolation` в `test_suppliers_crud.py`), см. [[multitenancy]].

## Задействованные сущности

- [[suppliers]] — зеркало Esupl (`external_id`, `name`, `tax_id`) + карточка LCOS (`contact_name`, `phone`, `messenger`, `delivery_terms`, `min_order_amount`, `min_order_note`, `is_active`, `criteria` JSONB); миграция `0006` добавила поля карточки.
- [[organizations]] — арендатор; `organization ↔ ровно одна команда Esupl` (`[[ADR-004]]`), источник `team_id` для синхронизации.
- [[subdivisions]] — секция внутри арендатора; `subdivision ↔ склад Esupl` (`[[ADR-008]]`).

## Зависимости / связи

- **Требования:** [[LCOS-F6-module-gates]] (весь роутер за `require_module("suppliers")` → `404`), [[multitenancy]] (scope + изоляция), [[erp-esupl-integration]] (`get_esupl_access` + `following?is_virtual=1` на sync, только-чтение), [[supplier-criteria-registry]] (`criteria` JSONB, реестр).
- **Фичи:** [[LCOS-F18-supplier-criteria]] (гибкие критерии), [[LCOS-F20-price-history]] + [[LCOS-F21-price-change-signal]] (📝 следующие инкременты F3), [[LCOS-F19-supplier-self-service]] (🔭 шов), [[LCOS-F9-line-matching]] / [[LCOS-F13-sku-identity-resolver]] (потребители `match`/`search`).
- **Прайс-листы и ассортимент (следующий инкремент карточки, 📝 planned):** [[LCOS-F72-supplier-price-list-upload]] (загрузка прайса/буклета/сообщения/фото для поставщика), далее [[LCOS-F73-price-list-parsing]] (парсинг → позиции), [[LCOS-F74-supplier-assortment-freshness]] (вкладка «Ассортимент» с freshness на карточке) и [[LCOS-F75-supplier-price-analytics]] (аналитика). Строятся поверх локального SSOT поставщика, зафиксированного [[ADR-021]].
- **ADR:** [[ADR-004]] (org ↔ команда Esupl), [[ADR-008]] (subdivision ↔ склад), [[ADR-021]] (справочник поставщиков — локальный SSOT).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. Миграция `0006` применяется/откатывается; новые поля карточки nullable; `is_active` по умолчанию True.
- [ ] AC-BE-2. CRUD: `POST /suppliers` → `201`; `PATCH /suppliers/{id}` частичный (`exclude_unset`); `GET /suppliers/{id}` → карточка или `404`.
- [ ] AC-BE-3. `PATCH` с `criteria: null` не ломает flush (NOT NULL) — трактуется как «не трогать».
- [ ] AC-BE-4. `POST /suppliers/sync` разрешает `team_id` через `get_esupl_access`; без команды Esupl → `400`; upsert по `external_id` (без дубликатов); возвращает `{synced: n}`.
- [ ] AC-BE-5. `POST /suppliers/match`: налоговый ID — приоритетное точное совпадение; иначе лучшее по имени при скоре ≥ `0.4`; иначе `null`.
- [ ] AC-BE-6. Скор имени смешан `0.65·trigram-Dice + 0.35·token-Jaccard` на нормализованных именах.
- [ ] AC-BE-7. `GET /suppliers/search?q=` — регистронезависимое частичное по имени; `q` min_length 1.
- [ ] AC-BE-8. Весь роутер за `require_module("suppliers")`: при отключённом модуле все endpoint-ы → `404`.
- [ ] AC-BE-9. Изоляция арендаторов: поставщики org A не видны из scope org B (тест).
- [x] AC-BE-10. ([[ADR-021]]) `GET /suppliers` и `GET /suppliers/search` читают из локальной таблицы `suppliers` (локальный SSOT), а не через живой Esupl pass-through; `POST /suppliers/sync` остаётся обогащением из POS (upsert по `external_id`). Реверс касается только справочника поставщиков (каталог ингредиентов — POS-SSOT).
- [ ] AC-BE-11. (backfill, [[ADR-021]]) Организация с привязкой к Esupl обязана выполнить первичный `POST /suppliers/sync` для наполнения локального справочника; без него и без ручных карточек `GET /suppliers` вернёт пустой список (ожидаемо, не регрессия). Отразить в онбординге.

### Frontend
- [ ] AC-FE-1. Страница «Поставщики» — список (имя, контакты, последняя поставка, число SKU) с адаптивными карточками на мобильном.
- [ ] AC-FE-2. Карточка редактируема (детали, условия, минимальный заказ); мягкое скрытие неактивной.
- [ ] AC-FE-3. `entities/supplier` — RTK-endpoints `getManagedSuppliers/createSupplier/updateSupplier` (backend-direct, tag `Supplier`); провайдер `backend|mock`.
- [ ] AC-FE-4. Пункт навигации «Поставщики» (сайдбар + drawer); при отключённом модуле раздел скрыт.
- [ ] AC-FE-5. Проверка в браузере на мобильном viewport (логин → создание `201` → patch `200`).

## Открытые вопросы / гейты

- **История цен не реализована** (F3-B2/B3): `supplier_prices` append-only, авто-сбор из инвойса, предупреждение об изменении цены → [[LCOS-F20-price-history]], [[LCOS-F21-price-change-signal]]. AC-2/3/5/6/7/9 плана F3 относятся к этому и **остаются открытыми**.
- **Потребитель аналитики поставщиков (REQ 1b)** — шов модели существует, потребитель **отложен** по решению checkpoint.
- График цен/sparkline — вне текущего инкремента.

## Источники

- `plan/PHASE_F3_SUPPLIERS.md` — «Implementation status (2026-07-08)» (F3-B1 + CRUD + мобильный UI готовы; история цен — следующий инкремент), F3-B4 (гейт модуля).
- `APP_OVERVIEW.md §10` (критерии JSONB + реестр), `§9` (`get_esupl_access`, endpoint following), `§11`.
- `mvp.be/app/api/v1/routes/suppliers.py` (роутер + `require_module("suppliers")`).
- `mvp.be/app/services/supplier_service.py:74` (`sync_from_erp`), `:92` (`create_card`), `:101` (`find_by_name`), `:23-27` (веса скора `0.65`/`0.35`, порог `0.4`).
