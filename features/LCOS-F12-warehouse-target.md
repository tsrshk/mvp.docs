---
id: LCOS-F12
type: feature
title: Выбор целевого склада
epic: "[[LCOS-E2-invoice-intake]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]", "[[subdivisions]]", "[[organizations]]", "[[integration_credentials]]"]
requirements: ["[[erp-esupl-integration]]", "[[invoice-status-machine]]", "[[fail-closed]]"]
adrs: ["[[ADR-008]]", "[[ADR-016]]", "[[ADR-006]]"]
legacy_refs: ["08 F0.6", 07 Э0]
sources: ["08_PHASE1_SPEC.md F0.6", "APP_OVERVIEW.md §9", "mvp.be app/services/invoice_service.py:177", "mvp.be app/domain/entities.py:106", "mvp.be app/providers/erp/esupl.py:245"]
updated: 2026-07-09
---
# LCOS-F12 · Выбор целевого склада
**Эпик:** [[LCOS-E2-invoice-intake]] · **Статус:** planned · **Фаза:** Phase 1

## Описание

Чек в Esupl всегда постится **на конкретный склад**. Сегодня `warehouse_id` в payload исходящего инвойса берётся **молча** из `Subdivision.esupl_warehouse_id`; если это поле пусто, инвойс просто не может достичь `prepared` (предупреждение «subdivision not linked to an Esupl warehouse» удерживает готовность). Нет реального списка складов и нет явного выбора на момент приёмки. F12 закрывает этот пробел: получить реальный список складов команды из Esupl, дать пользователю выбрать назначение на шаге отправки (с дефолтом на склад subdivision), сохранить выбор и отказаться отправлять чек без выбранного склада (08 F0.6).

На бэкенде это добавляет метод чтения к ERP-провайдеру — `list_warehouses(team_id, api_token) -> list[WarehouseRef]` (маленький DTO из `esupl_warehouse_id: int`, `name: str`) — следуя тому же team-scoped, fail-closed паттерну, что и другие чтения ([[LCOS-F11-esupl-read]]): нет токена → `[]` + предупреждение, толерантный разбор, живая форма подтверждается в браузере. Выбранный `warehouse_id` течёт в существующее поле `EsuplOutgoingInvoice.warehouse_id` вместо молчаливого дефолта, дефолт остаётся `Subdivision.esupl_warehouse_id`, когда установлен, а выбор сохраняется на инвойсе через новый nullable-столбец `target_warehouse_id`. Тот же справочник складов разделяется с уровнями запасов (`stock_levels.warehouse_id`, [[LCOS-E7-stock]]) для консистентности (F0.6 REQ-4, [[ADR-016]]).

На фронтенде селектор склада появляется на шаге отправки (prepare-step / invoice-workbench): он по умолчанию использует склад subdivision, перечисляет значения из `list_warehouses` и **блокирует submit, пока склад не выбран** — явная валидация, которая заменяет сегодняшнее молчаливое поведение not-ready.

## Возможности

- Бэкенд `list_warehouses(team_id, api_token)` → `WarehouseRef[]` (`esupl_warehouse_id`, `name`); team-scoped, толерантный разбор; нет токена → `[]` + предупреждение ([[fail-closed]]).
- Выбранный `warehouse_id` заполняет `EsuplOutgoingInvoice.warehouse_id` (поле уже существует) вместо молчаливого дефолта subdivision.
- Назначение по умолчанию = `Subdivision.esupl_warehouse_id`, когда установлен.
- Сохранение выбора на инвойсе через новый nullable-столбец `invoices.target_warehouse_id`.
- Submit блокируется (not-ready с ясным сообщением), когда никакой склад не разрешён.
- Единый справочник складов, разделяемый с `stock_levels.warehouse_id` ([[LCOS-E7-stock]]).

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Выбирает целевой склад на шаге отправки (по умолчанию склад кофейни) перед постингом чека. |
| [[admin]] | То же, что member; устанавливает/поддерживает дефолтный склад subdivision (`Subdivision.esupl_warehouse_id`). |
| [[superadmin]] | Все арендаторы; может инспектировать/переопределять связи складов. |
| [[sqladmin-operator]] | Не в потоке; токен, который авторизует `list_warehouses`, живёт в `integration_credentials` ([[LCOS-F3-sqladmin-operator]]). |

Со scope арендатора: `team_id` из `Organization.esupl_team_id`, дефолт из активной subdivision (см. [[auth]], [[multitenancy]]).

## Задействованные сущности

- [[invoices]] — получает `target_warehouse_id` (int, nullable) для сохранения выбранного назначения.
- [[subdivisions]] — `esupl_warehouse_id` поставляет дефолтный склад (subdivision ↔ склад, [[ADR-008]]).
- [[organizations]] — `esupl_team_id` ограничивает scope чтения `list_warehouses`.
- [[integration_credentials]] — per-org токен Esupl, авторизующий чтение складов (нет env-фолбэка).

## Зависимости / связи

- **Требования:** [[erp-esupl-integration]] (новое team-scoped чтение + поле payload), [[invoice-status-machine]] (склад становится предусловием готовности для `prepared`), [[fail-closed]] (нет токена → `[]` + предупреждение; нет склада → not-ready).
- **Фичи:** расширяет read-поверхность [[LCOS-F11-esupl-read]]; питает payload/готовность [[LCOS-F10-invoice-status-machine]]; разделяет справочник складов с [[LCOS-F34-stock-levels]] в [[LCOS-E7-stock]]; разблокирует запускаемое владельцем испытание записи (08 F0.4, часть [[LCOS-F10-invoice-status-machine]]).
- **ADR / решения:** [[ADR-008]] (маппинг subdivision ↔ склад), [[ADR-016]] (источник запасов → общий справочник складов), [[ADR-006]] (fail-closed egress).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `ErpProvider.list_warehouses(team_id, api_token) -> list[WarehouseRef]` существует на `Protocol` и в реализации `esupl`; `WarehouseRef` несёт `esupl_warehouse_id: int`, `name: str`.
- [ ] AC-BE-2. `list_warehouses` team-scoped и толерантно разобран; нет токена → `[]` + предупреждение (fail-closed), в соответствии с другими чтениями.
- [ ] AC-BE-3. Выбранный `warehouse_id` заполняет `EsuplOutgoingInvoice.warehouse_id`; дефолт = `Subdivision.esupl_warehouse_id`, когда установлен; нет молчаливого дефолта, когда ни одного не присутствует.
- [ ] AC-BE-4. Новый nullable-столбец `invoices.target_warehouse_id` сохраняет выбор (ревизия Alembic с работающим `downgrade()`).
- [ ] AC-BE-5. Submit без разрешённого `warehouse_id` даёт not-ready инвойс с ясным сообщением (закрывает текущее молчаливое удержание в `invoice_service.py`).
- [ ] AC-BE-6 (тест). respx: `list_warehouses` собирает список; нет токена → `[]` + предупреждение; submit без `warehouse_id` → not-ready.

### Frontend
- [ ] AC-FE-1. Селектор склада появляется на шаге отправки (prepare-step / invoice-workbench), заполняется из `list_warehouses`.
- [ ] AC-FE-2. Селектор по умолчанию использует склад subdivision, когда он настроен.
- [ ] AC-FE-3. Submit отключён/блокирован, пока склад не выбран, с ясным сообщением.

### Прочее (данные / приёмка владельцем)
- [ ] AC-OTHER-1 (отложено, браузер). Список складов совпадает с UI Esupl, и чек, запостенный через испытание записи (08 F0.4), приземляется на выбранный склад.

## Открытые вопросы / гейты

- Путь endpoint-а складов взят толерантно из зеркала API (`warehouse.md` remains/item/warehouses family / `raw/collection.json` `/teams/{id}/warehouses`) и должен быть подтверждён вживую в браузере после сохранения токена.
- Гейт консистентности: Э3 (`stock_levels.warehouse_id`) и F12 должны использовать один справочник складов (F0.6 REQ-4) — см. [[LCOS-E7-stock]].
- Зависит от возможности реально выполнять записи в ERP — гейтирован с [[LCOS-F10-invoice-status-machine]] (`ERP_WRITE_ENABLED`, запуск владельцем).

## Источники

- `08_PHASE1_SPEC.md F0.6` (зачем + REQ-1..4 + AC; метод `list_warehouses`, `target_warehouse_id`, FE-селектор, блок submit).
- `APP_OVERVIEW.md §9` (паттерн чтения Esupl, токен на чтение, `get_esupl_access`).
- `mvp.be/app/services/invoice_service.py:177` (где `team_id`/`warehouse_id` читаются сегодня и предупреждение not-ready), `:180` (молчаливый дефолт `Subdivision.esupl_warehouse_id`), `:203` (сборка payload).
- `mvp.be/app/domain/entities.py:106` (поле `EsuplOutgoingInvoice.warehouse_id` уже существует).
- `mvp.be/app/providers/erp/esupl.py:245` (`write_invoice` — payload, постящийся на `/teams/{id}/outgoing-invoices`).
