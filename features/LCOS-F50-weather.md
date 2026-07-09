---
id: LCOS-F50
type: feature
title: Провайдер погоды + хранение
epic: "[[LCOS-E10-local-context]]"
status: future
phase: "Phase 2"
roles: [member, admin, superadmin, sqladmin-operator]
entities: ["[[subdivisions]]", "[[integration_credentials]]", "[[system_settings]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[config-secrets]]", "[[secret-encryption]]"]
adrs: ["[[ADR-009]]", "[[ADR-006]]"]
legacy_refs: [plan F6, "plan F6-B1", "plan F6-B3"]
sources: ["plan/PHASE_F6_LOCAL_CONTEXT.md §1 (F6-B1, F6-B3)", "plan/00_IMPLEMENTATION_PLAN.md F6"]
updated: 2026-07-09
---
# LCOS-F50 · Провайдер погоды + хранение
**Epic:** [[LCOS-E10-local-context]] · **Status:** future · **Phase:** Phase 2

## Описание

Загружает суточную погоду (факт + короткий прогноз) для каждого подразделения, чтобы аномалии продаж позднее можно было объяснить внешними факторами, а не оставлять на догадки. Новый шов провайдера `WeatherProvider` (одна реализация, `openweather`) повторяет паттерн реестра OCR/ERP из [[LCOS-E1-platform]]: доменный DTO `WeatherDay` несёт `date`, `temp_min/max`, `precipitation_mm`, `condition` и опциональный `wind`. Исходящий трафик — прямой вызов клиента (API погоды не является AI-провайдером, поэтому `requires_vpn=False`), регулируемый платформенной политикой egress ([[vpn-egress]]).

Ежедневное задание синхронизации (размещённое в планировщике [[LCOS-E9-sales-analytics]]) забирает вчерашний факт плюс прогноз на 7–14 дней в `weather_days`; строки прогноза позже перезаписываются фактом. Задание закрыто флагом REGISTRY (`weather_sync_enabled`, по умолчанию выключено, пока не настроен ключ) и потребляет координаты подразделения из [[LCOS-F51-coordinates]]. API-ключ хранится как секрет `integration_credentials` со скоупом платформы (зашифрован `enc:v2:*`); без ключа синхронизация проваливается с явной ошибкой `sync_run` (fail-closed), а приложение остаётся работать.

## Возможности

- Протокол `WeatherProvider` + реализация `openweather` за реестром (только одна реализация — см. [[provider-abstraction]]).
- Ежедневная синхронизация: факт за вчера + прогноз на 7–14 дней, идемпотентно по `(subdivision_id, date)`, строки прогноза перезаписываются фактом.
- Хранилище `weather_days` (скоуп подразделения): `date`, `temp_min/max`, `precipitation_mm`, `condition`, `is_forecast`.
- Fail-closed при отсутствии ключа/учётных данных: явная ошибка в `sync_run`, без тихого фолбэка на env.
- Настраиваемое в рантайме расписание/включение через config-реестр (`weather_sync_enabled`), без редеплоя.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Потребляет погодный контекст косвенно через дайджест ([[LCOS-F53-digest-enrichment]]); прямого управления нет. |
| [[admin]] | То же; следит, чтобы координаты подразделения были заданы, чтобы синхронизация работала ([[LCOS-F51-coordinates]]). |
| [[superadmin]] | Задаёт ключ OpenWeather и переключает `weather_sync_enabled` через config-API по тенантам. |
| [[sqladmin-operator]] | Хранит/ротирует учётные данные OpenWeather и редактирует флаги синхронизации в плоскости SQLAdmin (см. [[LCOS-F3-sqladmin-operator]]). |

Тенант-скоуп: `weather_days` изолирована по подразделению ([[multitenancy]]).

## Задействованные сущности

- [[subdivisions]] — поставляет `lat`/`lon` для загрузки; подразделение без координат пропускается с явной пометкой в `sync_run`.
- [[integration_credentials]] — ключ `openweather` со скоупом платформы, зашифрован Fernet (`enc:v2:*`); читается только на бэкенде.
- [[system_settings]] — флаги/расписание реестра (`weather_sync_enabled`), разрешаемые в рантайме.
- `weather_days` (будущая таблица со скоупом подразделения) — хранилище погоды; документ-сущность создаётся при активации.

## Зависимости / связи

- **Requirements:** [[provider-abstraction]] (шов погоды + реестр, одна реализация), [[fail-closed]] (нет ключа → явная ошибка `sync_run`, приложение остаётся работать), [[config-secrets]] + [[secret-encryption]] (ключ хранится зашифрованным, без фолбэка на env).
- **Features:** питает [[LCOS-F53-digest-enrichment]]; потребляет координаты из [[LCOS-F51-coordinates]]; синхронизация выполняется внутри задания [[LCOS-F47-scheduler]].
- **ADR:** [[ADR-009]] (шов провайдера, одна реализация), [[ADR-006]] (политика egress / fail-closed).

## Критерии приёмки

Критерии приёмки: TBD (Phase 2 — детализируются при активации).

## Sources

- `plan/PHASE_F6_LOCAL_CONTEXT.md §1` — F6-B1 (шов провайдера погоды, `openweather`, ключ + fail-closed), F6-B3 (хранилище `weather_days` + задание синхронизации).
- `plan/00_IMPLEMENTATION_PLAN.md F6`.
