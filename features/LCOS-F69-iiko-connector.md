---
id: LCOS-F69
type: feature
title: Второй ERP-коннектор (iiko)
epic: "[[LCOS-E15-saas]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin, sqladmin-operator]
entities: ["[[organizations]]", "[[integration_credentials]]", "[[system_settings]]", "[[invoices]]"]
requirements: ["[[provider-abstraction]]", "[[erp-esupl-integration]]", "[[fail-closed]]", "[[secret-encryption]]"]
adrs: ["[[ADR-009]]"]
legacy_refs: [plan P2-D]
sources: ["plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-D", "Local_OS_About.md Phase 2"]
updated: 2026-07-09
---
# LCOS-F69 · Второй ERP-коннектор (iiko)

**Epic:** [[LCOS-E15-saas]] · **Status:** future · **Phase:** Phase 2

## Описание

Добавляет iiko как второй бэкенд ERP/POS наряду с Esupl. Это триггер, который наконец задействует шов ERP-провайдера: [[ADR-009]] разрешает вторую реализацию *только* здесь (никакой спекулятивной multi-provider сборки в течение Phase 1). Новый `IikoErpProvider` реализует существующий Protocol `ErpProvider`, так что потоки распознавания, prepare/submit и чтения работают против iiko без переписывания какого-либо сервиса.

Ключевое изменение — *где* живёт выбор провайдера: сегодня это env-переменная уровня деплоя `ERP_PROVIDER` (один POS на деплой); обслуживание нескольких тенантов требует перемещения выбора на уровень org (столбец/настройка организации). Это настоящий архитектурный сдвиг, и он должен быть зафиксирован в собственном ADR при построении.

## Возможности

- `IikoErpProvider` за существующим Protocol `ErpProvider` — drop-in вторая реализация, сервисы без изменений.
- Выбор провайдера переезжает с уровня деплоя (`ERP_PROVIDER` env) на уровень org (столбец/настройка организации).
- Аутентификация/учётные данные iiko через существующий пер-org паттерн зашифрованных учётных данных.
- Та же поза «только чтение плюс закрытая гейтом запись», что и у коннектора Esupl (шов не вводит новой семантики записи).

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[admin]] | Для тенанта, чей POS — iiko, использует обычные потоки накладных/чтения прозрачно. |
| [[superadmin]] | Задаёт пер-org ERP-провайдера; управляет учётными данными iiko по тенантам. |
| [[sqladmin-operator]] | Настраивает выбор провайдера уровня org + учётные данные в плоскости SQLAdmin (см. [[LCOS-F3-sqladmin-operator]]). |
| [[member]] | Использует потоки накладных, не зная, какой ERP-бэкенд активен. |

## Задействованные сущности

- [[organizations]] — получает выбор ERP-провайдера уровня org (мигрированный с env-переменной деплоя).
- [[integration_credentials]] — пер-org токен/учётные данные iiko (зашифрованы Fernet, только на бэкенде).
- [[system_settings]] — поверхность разрешения провайдера/флагов.
- [[invoices]] — домен, чей путь prepare/submit теперь нацелен на iiko при выборе.

## Зависимости / связи

- **Requirements:** [[provider-abstraction]] (вторая реализация `ErpProvider`, вся цель шва), [[erp-esupl-integration]] (первый коннектор, который это зеркалирует; поза «только чтение + закрытая гейтом запись» сохранена), [[fail-closed]] (egress iiko остаётся fail-closed), [[secret-encryption]] (учётные данные iiko зашифрованы).
- **Features:** реализует шов из [[LCOS-F5-provider-seams]]; переиспользует потоки в [[LCOS-F10-invoice-status-machine]] и [[LCOS-F11-esupl-read]] без изменений.
- **Epics:** часть [[LCOS-E15-saas]]; управляемый спросом, строится после [[LCOS-F68-billing]], когда платящему тенанту нужен iiko.
- **ADR:** [[ADR-009]] (вторая реализация разрешена только на этом триггере); новый ADR фиксирует перемещение выбора провайдера уровень-деплоя → уровень-org.

## Критерии приёмки

- Критерии приёмки: TBD (Phase 2 — детализируются при активации). Раскладываются в выделенный файл `PHASE_P2_D`; новый ADR для выбора провайдера уровня org — deliverable этой декомпозиции.

## Sources

- `plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-D` (`IikoErpProvider` за Protocol `ErpProvider`; выбор провайдера деплой → уровень org; ADR к написанию).
- `Local_OS_About.md` Phase 2 (поддержка iiko в дополнение к Esupl).
