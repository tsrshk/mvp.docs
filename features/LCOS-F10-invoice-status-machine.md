---
id: LCOS-F10
type: feature
title: Машина статусов инвойса + Esupl payload + гейтированная запись
epic: "[[LCOS-E2-invoice-intake]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]", "[[invoice_lines]]", "[[sku_mapping]]", "[[integration_credentials]]", "[[suppliers]]"]
requirements: ["[[invoice-status-machine]]", "[[fail-closed]]", "[[erp-esupl-integration]]", "[[sku-identity-resolver]]"]
adrs: ["[[ADR-006]]", "[[ADR-012]]", "[[DEC-0011]]", "[[DEC-0013]]", "[[ADR-020]]"]
legacy_refs: [07 Э1, plan F1, "08 F0.4"]
sources: ["APP_OVERVIEW.md §6", "mvp.be app/services/invoice_service.py:54", "mvp.be app/services/invoice_service.py:130", "mvp.be app/services/invoice_service.py:215", "mvp.be app/providers/erp/esupl.py:245", "mvp.be app/api/v1/routes/invoices.py:55"]
updated: 2026-07-09
---
# LCOS-F10 · Машина статусов инвойса + Esupl payload + гейтированная запись
**Эпик:** [[LCOS-E2-invoice-intake]] · **Статус:** built · **Фаза:** Phase 1

## Описание

F10 — коммит-хребет клина инвойсов: он превращает отредактированный `InvoiceDraft` в сохранённый `Invoice` с определённым терминальным статусом, строит Esupl-payload `outgoing-invoice` и — только за runtime-тумблером — пишет чек в ERP. Это **fail-closed-контекст коммита**, аналог толерантного draft-resolve из [[LCOS-F9-line-matching]] (APP_OVERVIEW §6).

`submit()` выполняет фиксированный конвейер: `validate_draft` (арифметика — номер присутствует, положительный итог, непустые строки и сумма строк vs заявленный итог в пределах допуска `Decimal("0.05")`) → `prepare()` (разрешить поставщика, строки, команду и склад в payload) → разрешение долговечной идентичности и live POS-валидация Phase-2 → назначение статуса. Пять терминальных статусов: **rejected** (сбой арифметики или идентичности/валидации), **validated** (распознан и сохранён, но не POS-ready — нужен маппинг/правки), **prepared** (payload построен, запись отключена), **written** (реально запостен в Esupl), **failed** (попытка записи бросила исключение). Каждый путь сохраняет инвойс и его строки, так что ничего распознанного не теряется.

Реальная запись в ERP гейтируется `ERP_WRITE_ENABLED`, разрешается в runtime из `system_settings` с дефолтом реестра **False** — по умолчанию проект только для чтения. Когда отключено, `write_invoice` короткозамыкается и возвращает синтетический id `esupl-prepared-<number>` без обращения к Esupl; инвойс остаётся `prepared`. Когда включено, payload постится на `POST /teams/{id}/outgoing-invoices` с Bearer-токеном арендатора (нет env-фолбэка — отсутствующий токен даёт 401, [[fail-closed]]). Любое исключение записи фиксируется как `failed` и логируется, никогда не роняя запрос. Живые пути провайдеров работают только на бэкенде ([[ADR-012]]).

## Возможности

- Арифметическая валидация (`validate_draft`): отсутствующий номер, отсутствующий/неположительный итог, нет строк или сумма строк ≠ заявленный итог за пределами `±0.05` → собранные строки ошибок.
- Сборка payload (`prepare` → `EsuplOutgoingInvoice`): разрешённые `team_id` (из `Organization.esupl_team_id`), `warehouse_id` (из `Subdivision.esupl_warehouse_id`), числовой `supplier_id`, номер/дата инвойса и разрешённые `EsuplLineItem`; готовность требует всех — команды, склада, номера поставщика и готовности каждой строки.
- Машина терминальных статусов: `rejected` / `validated` / `prepared` / `written` / `failed`, каждый сохраняется с контекстом `validation_errors`, где релевантно.
- Долговечная идентичность на момент коммита + live POS-валидация гейтируют переход `prepared` (fail-closed): неразрешённый SKU, отсутствующая команда, POS недоступен или несовпадение единиц → `rejected` (детали в [[LCOS-F13-sku-identity-resolver]]).
- Provenance сохраняется: `ocr_provider` / `ocr_raw` из черновика; снимок долговечного `pos_ingredient_id` на строку проставляется при `prepared`.
- Гейтированная запись: `ERP_WRITE_ENABLED` (runtime, дефолт False) — отключено → `prepared` + синтетический id, включено → реальный POST, исключение → `failed`.
- `esupl_payload` хранится на инвойсе (как JSON) после `prepared`.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Отправляет отредактированный черновик; видит итоговый статус и любые ошибки валидации внутри своей subdivision. |
| [[admin]] | То же, что member, внутри своей subdivision. |
| [[superadmin]] | Все арендаторы; через config API может переключать `ERP_WRITE_ENABLED` и инспектировать любой инвойс. |
| [[sqladmin-operator]] | Не в потоке; переключает `ERP_WRITE_ENABLED` в плоскости SQLAdmin для запускаемого владельцем испытания записи ([[LCOS-F3-sqladmin-operator]]). |

`POST /invoices` — со scope арендатора через активный контекст JWT (см. [[auth]], [[multitenancy]]).

## Задействованные сущности

- [[invoices]] — сохранённая цель; держит `status`, `validation_errors`, `external_id`, `esupl_payload`, `ocr_provider`/`ocr_raw`.
- [[invoice_lines]] — сохранённые строки черновика; каждая несёт снимок долговечного `pos_ingredient_id` после prepared.
- [[sku_mapping]] — читается (не пишется) на пути коммита для долговечной идентичности; учитываются только подтверждённые строки (`method=manual` ИЛИ установлен `confirmed_by`).
- [[integration_credentials]] — per-org Bearer-токен Esupl (Fernet), разрешается через `get_esupl_access`; нет env-фолбэка.
- [[suppliers]] — разрешённый поставщик поставляет числовой `supplier_id` для payload.

## Зависимости / связи

- **Требования:** [[invoice-status-machine]] (нормативный SSOT пяти статусов и переходов), [[fail-closed]] (`ERP_WRITE_ENABLED` дефолт OFF, нет-токена → 401, POS недоступен → блок), [[erp-esupl-integration]] (путь записи + форма payload), [[sku-identity-resolver]] (гейт идентичности коммита).
- **Фичи:** потребляет разрешённые строки из [[LCOS-F9-line-matching]]; идентичность коммита из [[LCOS-F13-sku-identity-resolver]]; порядок persist-then-commit «рва» — [[LCOS-F14-learning-loop]]; выбор целевого склада, который будет питать payload — [[LCOS-F12-warehouse-target]]; сторона чтения (`GET /invoices`) — [[LCOS-F11-esupl-read]].
- **ADR / решения:** [[ADR-006]] (fail-closed egress + тумблер записи), [[ADR-012]] (живые пути провайдеров только на бэкенде), [[DEC-0011]]/[[DEC-0013]] (идентичность коммита — только подтверждённая, без кэша/нечёткости/AI), [[ADR-020]] («ров» сохраняется до отправки, переживает reject).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `validate_draft` помечает отсутствующий номер, отсутствующий/неположительный итог, нет строк и расхождение суммы строк vs итог за пределами `Decimal("0.05")`.
- [ ] AC-BE-2. `submit()` назначает ровно один терминальный статус — `rejected` / `validated` / `prepared` / `written` / `failed` — и сохраняет инвойс + строки на каждом пути.
- [ ] AC-BE-3. Арифметические ошибки → `rejected` с объединёнными `validation_errors`, payload не строится.
- [ ] AC-BE-4. Распознан, но не POS-ready (неразрешённый поставщик/строки/команда/склад) → `validated` с предупреждениями, без записи.
- [ ] AC-BE-5. Полностью разрешён и валидирован → `prepared`; `esupl_payload` сохранён и проставлен снимок `pos_ingredient_id` на строку.
- [ ] AC-BE-6. `ERP_WRITE_ENABLED` читается в runtime из `system_settings` (дефолт реестра False); когда отключено, `write_invoice` возвращает `esupl-prepared-<number>` и НЕ обращается к Esupl.
- [ ] AC-BE-7. Когда включено, успешный `POST /teams/{id}/outgoing-invoices` устанавливает `status=written` и `external_id` из ответа; брошенная запись → `status=failed` с зафиксированной ошибкой, запрос не падает.
- [ ] AC-BE-8. Запись использует per-org токен из `integration_credentials` (через `get_esupl_access`); отсутствующий токен означает Esupl 401 (нет env-фолбэка), а токены никогда не логируются.

### Frontend
- [ ] AC-FE-1. `POST /invoices` вызывается с отредактированным черновиком; возвращённый статус показывается пользователю.
- [ ] AC-FE-2. `rejected` / `validated` показывают конкретные `validation_errors` / предупреждения инлайн (на строку, где применимо), чтобы пользователь знал, что чинить.
- [ ] AC-FE-3. `prepared` vs `written` визуально различимы (запись отключена vs реально запостено), соответствуя дефолту только-чтения.
- [ ] AC-FE-4. Клиентский guard отправки блокирует случайную повторную отправку того же инвойса с того же устройства (идемпотентность на стороне сервера отложена — см. [[LCOS-F43-idempotency]]).

## Открытые вопросы / гейты

- **`ERP_WRITE_ENABLED` = OFF по умолчанию:** включение реальных записей — намеренный шаг Customer-Zero (запускаемое владельцем испытание записи, 08 F0.4); вернуть в OFF после испытания.
- **`VER-021` долговечность (открыто, запуск владельцем):** стабильность `pos_ingredient_id` при edit/delete-recreate эмпирически не подтверждена; merge остаётся гейтированным — см. [[LCOS-E5-stabilization]].
- **Идемпотентность на стороне сервера:** отсутствует до F5.2 — `submit` всегда создаёт новую строку, так что тот же инвойс нельзя пере-постить через API, пока гейт записи включён ([[LCOS-F43-idempotency]]).

## Источники

- `APP_OVERVIEW.md §6` (конвейер recognize → prepare → submit → write; список статусов).
- `mvp.be/app/services/invoice_service.py:54` (`validate_draft` + допуск), `:130` (`prepare` → payload + готовность), `:215` (`submit` машина статусов + гейтированная запись).
- `mvp.be/app/providers/erp/esupl.py:245` (`write_invoice` — короткое замыкание тумблера, POST, токен, разбор doc-id).
- `mvp.be/app/api/v1/routes/invoices.py:55` (`POST /invoices` = submit), `:48` (`POST /prepare` предпросмотр).
