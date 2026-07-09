---
id: LCOS-F5
type: feature
title: Швы провайдеров + fail-closed egress
epic: "[[LCOS-E1-platform]]"
status: built
phase: "Phase 1"
roles: [superadmin, sqladmin-operator]
entities: ["[[system_settings]]", "[[integration_credentials]]", "[[invoices]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[vpn-egress]]", "[[erp-esupl-integration]]", "[[global-requirements]]"]
adrs: ["[[ADR-009]]", "[[ADR-006]]", "[[ADR-012]]"]
legacy_refs: [plan/00 G1 G5, LCOS_Conformance R7 R8, APP_OVERVIEW §3 §5]
sources: ["APP_OVERVIEW.md §3 §5", "01_ARCHITECTURE.md (Provider abstraction, Failure handling)", "LCOS_Conformance_Alignment_GlobalRequirements.md R7 R8", "mvp.be app/providers/base.py:16", "mvp.be app/providers/context.py", "mvp.be app/providers/http.py:42", "mvp.be app/providers/ai.py", "mvp.be app/services/invoice_service.py"]
updated: 2026-07-09
---
# LCOS-F5 · Швы провайдеров + fail-closed egress
**Эпик:** [[LCOS-E1-platform]] · **Статус:** built · **Фаза:** Phase 1

## Описание

Слой абстракции и egress, который изолирует каждую интеграцию с внешним сервисом (OCR/LLM, ERP) за интерфейсами `Protocol` + реестром на декораторах и маршрутизирует весь исходящий трафик fail-closed. Правило дизайна: **`services` зависят только от `providers/*/base.py`, никогда от конкретных классов**; сегодня ровно **одна реальная реализация на шов** (OCR = `claude`, ERP = `esupl`), швы присутствуют, но альтернативы не пишутся, пока не будет триггера ([[ADR-009]]).

Выбор намеренно разделён между двумя плоскостями конфига: **ERP-провайдер — статический** deploy-конфиг (`settings.erp_provider`, env `ERP_PROVIDER`), тогда как **OCR/AI-провайдер — runtime-настройка в БД** (`system_settings.ai_provider`, дефолт `claude`), которую superadmin может переключить без редеплоя. Общая сквозная инфраструктура (два долгоживущих httpx-клиента, VPN-тумблер, фабрика сессий) внедряется через процесс-глобальный **`ProviderContext`**, так что она никогда не засоряет сигнатуры `Protocol`, а провайдеры никогда не импортируют слой `services`.

Egress fail-closed по двум осям. **AI-вызовы** (OCR + матчинг) маршрутизируются через VPN-сайдкар gluetun, когда `ai_vpn_enabled` (дефолт on): `get_client(via_vpn=True)` бросает `VpnUnavailableError`, если VPN-клиента нет — **никогда молчаливый фолбэк на прямой**, — а `guard_vpn` конвертирует сбои транспорта в ту же ошибку. Отсутствующий AI-ключ → `AiUnavailableError` (503). **Записи ERP** идут в Esupl и по умолчанию отключены (`erp_write_enabled=False`): пока отключено, `write_invoice` возвращает синтетический `esupl-prepared-<number>` без обращения к Esupl; тот же путь кода становится реальной записью при включении. Ни один секрет никогда не достигает браузера — живые пути провайдеров работают только на стороне бэкенда ([[ADR-012]]).

## Возможности

- `@runtime_checkable` `Protocol`ы: `OcrProvider.extract_invoice(...)`, `ErpProvider.{list_suppliers,list_ingredients,write_invoice}`; структурная типизация — реализациям не нужно наследоваться.
- Реестр на декораторах (`@register_ocr`, `@register_erp`) → `get_ocr_provider`/`get_erp_provider` делают `cls()` без аргументов, бросают описательный `ValueError` со списком зарегистрированных имён при промахе; `import_providers()` запускает регистрацию декораторов в lifespan.
- Раздельный выбор: **ERP статически** из env (`ERP_PROVIDER=esupl`); **OCR/AI в runtime** из `system_settings.ai_provider` (дефолт `claude`), разрешается лениво, чтобы пути записи не платили за чтение выбора OCR-провайдера из БД.
- `ProviderContext` (модуль-глобальный `_CTX`) внедряет `egress` (прямой + VPN httpx-клиенты), тумблер `ai_vpn` и `session_scope`; устанавливается в lifespan, очищается при завершении; тесты подменяют fake-объекты.
- Единая точка входа транспорта LLM `ai_complete()` (диспетчеризация `claude`/`gemini`) — намеренно **не** за Protocol; OCR-провайдеры — тонкие адаптеры над ней.
- **Fail-closed egress:** `get_client(via_vpn=True)` без VPN-клиента → `VpnUnavailableError`; `guard_vpn` отображает `ProxyError`/`ConnectError`/`TimeoutException` в неё; отсутствующий AI-ключ → `AiUnavailableError`; оба отображаются в 503 в едином конверте ошибок.
- **Гейт записи ERP:** `erp_write_enabled` дефолт False → `write_invoice` короткозамыкается на `esupl-prepared-<number>` без egress; ON → реальный POST на `/teams/{id}/outgoing-invoices` с per-org токеном — тот же путь кода.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[superadmin]] | Переключает активный OCR/AI-провайдер (`ai_provider`), VPN-тумблер (`ai_vpn_enabled`) и `erp_write_enabled` в runtime через config API / SQLAdmin — без редеплоя. |
| [[sqladmin-operator]] | Те же runtime-настройки через SQLAdmin ModelViews; устанавливает AI-ключ / POS-токен, которые потребляют эти швы. |
| [[admin]] / [[member]] | Не выбирают провайдеров; прозрачно потребляют разрешённые швы через поток инвойсов. |

## Задействованные сущности

- [[system_settings]] — runtime-выбор/тумблеры: `ai_provider`, `ai_vpn_enabled`, `erp_write_enabled`, имена моделей.
- [[integration_credentials]] — AI-ключ (`scope=platform`) и per-org токен Esupl, потребляемые во время вызова (без кэша).
- [[invoices]] — гейт записи ERP срабатывает при submit; `esupl_payload`/status отражают результат гейтинга (детали в [[LCOS-F10-invoice-status-machine]]).

## Зависимости / связи

- **Требования:** [[provider-abstraction]] (Protocol + реестр, одна реализация на шов, `ProviderContext`), [[fail-closed]] (поведение VPN/ключа/гейта записи), [[vpn-egress]] (маршрутизация gluetun, нет молчаливого прямого фолбэка), [[erp-esupl-integration]] (Esupl read-only + гейтированная запись), [[global-requirements]] (R7/R8).
- **Фичи:** выбор провайдера/ключи приходят из [[LCOS-F4-config-secrets]]; OCR-шов питает [[LCOS-F8-ocr-recognition]]; ERP-шов + гейт записи питают [[LCOS-F10-invoice-status-machine]] и [[LCOS-F11-esupl-read]]; зеркало паттерна шва на FE — [[LCOS-F7-frontend-platform]].
- **ADR:** [[ADR-009]] (одна реализация на шов), [[ADR-006]] (fail-closed egress), [[ADR-012]] (живые пути провайдеров только на бэкенде, нет секретов в браузере).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `services` ссылаются только на `Protocol`ы из `providers/*/base.py`; направление зависимостей `api → services → providers/repositories` соблюдается (ни один сервис не импортирует конкретный класс провайдера).
- [ ] AC-BE-2. `get_ocr_provider`/`get_erp_provider` разрешаются через реестр на декораторах и бросают описательный `ValueError` (со списком зарегистрированных имён) на неизвестном имени.
- [ ] AC-BE-3. ERP-провайдер выбирается статически из `ERP_PROVIDER`; OCR/AI-провайдер из `system_settings.ai_provider` (дефолт `claude`), разрешается лениво (пути записи его не читают).
- [ ] AC-BE-4. Сквозная инфраструктура внедряется через `ProviderContext`; сигнатуры `Protocol` провайдеров не несут аргументов egress/VPN/session; `get_provider_context()` бросает исключение, если не установлен.
- [ ] AC-BE-5. **Fail-closed VPN:** при `ai_vpn_enabled=ON` и отсутствующем/мёртвом VPN-клиенте AI-вызов бросает `VpnUnavailableError` (503) — нет молчаливого прямого egress (незыблемое требование под merge-gate).
- [ ] AC-BE-6. Отсутствующий AI-ключ → `AiUnavailableError` (503) без env-фолбэка; отсутствующий токен Esupl → неаутентифицированный вызов → Esupl 401.
- [ ] AC-BE-7. **Гейт записи ERP:** `erp_write_enabled=False` → `write_invoice` возвращает `esupl-prepared-<number>` без обращения к Esupl; ON → реальный POST через тот же путь кода (под merge-gate).
- [ ] AC-BE-8. Новые реализации на шве не пишутся без явного триггера (R7.5); ровно одна активная реализация на шов.

## Открытые вопросы / гейты

- **D-a (решить):** `gemini` зарегистрирован как вторая OCR/AI-реализация, а транспорт LLM — это функции модуля (не Protocol). Рекомендация = **только-claude** (удалить gemini + резолвер двойной роли), чтобы соблюсти «одна реализация на шов»; альтернатива = поместить LLM за Protocol+реестр и протестировать инвариант «имя OCR ≡ enum `ai_provider`». Отслеживается в [[LCOS-E5-stabilization]].
- **V-c:** подтвердить, что нельзя зарегистрировать имя OCR, которое не является валидным значением enum `ai_provider` (двойное назначение резолвера).
- **D-f:** `esupl.list_suppliers`/`list_ingredients` вызывают `_auth_headers()` без токена (вне критического пути) — закрыть/защитить как недостижимые в Phase 1, чтобы не выжил ни один неаутентифицированный путь egress.
- **VER-021 (открыто, запуск владельцем):** модель долговечных id за записями ERP предполагает, что `pos_ingredient_id` переживает правку в Esupl — пока не подтверждено (нужен доступ на запись); merge остаётся гейтированным. См. [[LCOS-E3-sku-identity]].

## Источники

- `APP_OVERVIEW.md §3` (слои, выбор провайдера), `§5` (fail-closed, провайдеры только на бэкенде).
- `01_ARCHITECTURE.md` — «Backend provider abstraction», «Failure handling (fail-closed VPN, error mapping)».
- `LCOS_Conformance_Alignment_GlobalRequirements.md` R7/R8 + Part 2 D-a/D-f.
- `mvp.be/app/providers/base.py:16` (`register_ocr`), `:24` (`register_erp`), `:32`/`:42` (`get_*_provider`), `:52` (`import_providers`).
- `mvp.be/app/providers/context.py` (`ProviderContext`, `_CTX`, `get_provider_context`).
- `mvp.be/app/providers/http.py:42` (`Egress.get_client`), `:26` (`VpnUnavailableError`), `guard_vpn`.
- `mvp.be/app/providers/ai.py` (`ai_complete`, `claude_complete`, `_resolve_via_vpn`), `mvp.be/app/services/invoice_service.py` (гейт записи ERP).
