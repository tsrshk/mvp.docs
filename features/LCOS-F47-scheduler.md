---
id: LCOS-F47
type: feature
title: Планировщик + задание синхронизации
epic: "[[LCOS-E9-sales-analytics]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin]
entities: ["[[system_settings]]", "[[integration_credentials]]", "[[organizations]]", "[[subdivisions]]"]
requirements: ["[[config-secrets]]", "[[fail-closed]]", "[[provider-abstraction]]"]
adrs: []
legacy_refs: [plan F5-B3, 07 Э6, plan §6 Q3]
sources: ["plan/PHASE_F5_SALES_ANALYTICS.md §1 F5-B3", "07_PHASES.md Э6"]
updated: 2026-07-09
---
# LCOS-F47 · Планировщик + задание синхронизации
**Epic:** [[LCOS-E9-sales-analytics]] · **Status:** future · **Phase:** Phase 2

## Описание

Фоновый костяк планирования для аналитики — первое повторяющееся задание в продукте (batch/очереди не являются целью в Phase 1, они появляются здесь). Внутрипроцессный планировщик (планируется: APScheduler `AsyncIOScheduler`, запускаемый в FastAPI `lifespan`, один процесс для Phase 1 — будет зафиксировано в отдельном ADR, plan §6 Q3) запускает `SalesSyncService.sync(organization, subdivision)` с настраиваемым интервалом и управляет генерацией дайджеста.

Все расписания и флаги включения живут в реестре `system_settings`, так что меняются без редеплоя: `sales_sync_enabled` (bool, default `False` — включается только после настройки токена POS), `sales_sync_interval_hours` (default 6), `digest_weekday`/`digest_hour` (default Mon/9). Синхронизация инкрементальна от последней успешной точки с окном перекрытия в 1 день, делает upsert по `external_id` и пересчитывает `daily_aggregates`. Журнал `sync_runs` (org-скоуп: `kind`, `started_at`, `finished_at`, `status`, `error?`, `records_upserted`) даёт видимость «жива ли синхронизация» в SQLAdmin.

## Возможности

- Внутрипроцессный планировщик в `lifespan` (APScheduler, один процесс; ADR ожидается), управляющий заданиями синхронизации продаж и дайджеста.
- Расписания/флаги в REGISTRY `system_settings`, редактируемые из SQLAdmin без редеплоя.
- `SalesSyncService.sync`: инкрементально от последнего успеха (перекрытие в 1 день), upsert по `external_id`, пересчёт затронутых `daily_aggregates`.
- Журнал `sync_runs` для видимости прогонов (статус, текст ошибки, число апсертнутых строк).
- Fail-closed: нет токена POS / Esupl недоступен → `sync_run` помечается `failed` с текстом ошибки; приложение остаётся работать; повторы не чаще расписания; следующая попытка по расписанию.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[admin]] | Запускает «синхронизировать сейчас» для своего подразделения (`POST /api/v1/sales/sync`, требуется admin подразделения). |
| [[superadmin]] | То же по тенантам; настраивает токен POS, который открывает включение синхронизации. |
| [[member]] | Нет управления; потребляет синхронизированные данные далее по цепочке. |
| [[sqladmin-operator]] | Редактирует флаги расписания/включения в `system_settings` и инспектирует `sync_runs` в плоскости SQLAdmin (см. [[LCOS-F3-sqladmin-operator]]). |

## Задействованные сущности

- [[system_settings]] — реестр, содержащий `sales_sync_enabled`, `sales_sync_interval_hours`, `digest_weekday`/`digest_hour` (читаются резолвером, без редеплоя).
- [[integration_credentials]] — токен POS, требуемый синхронизацией; отсутствует → fail-closed проваленный прогон.
- [[organizations]] / [[subdivisions]] — журнал `sync_runs` имеет org-скоуп; синхронизация выполняется по подразделению.
- Новая таблица `sync_runs` определяется здесь (заготовка Phase 2, отдельного документа-сущности пока нет).

## Зависимости / связи

- **Requirements:** [[config-secrets]] (трёхуровневое чтение конфига/реестра без редеплоя), [[fail-closed]] (нет токена / ERP лежит → проваленный прогон, без тихого пропуска, без плотных повторов), [[provider-abstraction]] (синхронизация вызывает чтения `ErpProvider` из [[LCOS-F45-sales-read]]).
- **Features:** планирует [[LCOS-F45-sales-read]] → [[LCOS-F46-sales-storage]] и запускает генерацию [[LCOS-F48-weekly-digest]].
- **Epics:** [[LCOS-E9-sales-analytics]]. Новый ADR планировщика (Q3) будет добавлен под [[index]] при активации.

## Критерии приёмки

- Критерии приёмки: TBD (Phase 2 — детализируются при активации). ADR планировщика, «флаги меняются без редеплоя» и fail-closed поведение прогонов прорабатываются при активации.

## Sources

- `plan/PHASE_F5_SALES_ANALYTICS.md §1 F5-B3` (планировщик, флаги реестра, `sync_runs`, fail-closed).
- `07_PHASES.md Э6` (курсор `sync_state`, инкремент + ручной триггер).
