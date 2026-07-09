---
id: LCOS-F57
type: feature
title: Prefill из Google Places (опционально)
epic: "[[LCOS-E11-competitor-menu]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin, sqladmin-operator]
entities: ["[[integration_credentials]]", "[[subdivisions]]", "[[system_settings]]"]
requirements: ["[[provider-abstraction]]", "[[config-secrets]]", "[[secret-encryption]]", "[[vpn-egress]]"]
adrs: ["[[ADR-009]]", "[[ADR-006]]"]
legacy_refs: [plan F7, "plan F7-B4"]
sources: ["plan/PHASE_F7_COMPETITORS_MENU.md §1 (F7-B4)", "07_PHASES.md Э7", "plan/00_IMPLEMENTATION_PLAN.md F7"]
updated: 2026-07-09
---
# LCOS-F57 · Prefill из Google Places (опционально)
**Epic:** [[LCOS-E11-competitor-menu]] · **Status:** future · **Phase:** Phase 2

## Описание

Опциональное удобство для заполнения [[LCOS-F54-competitor-directory]]: если настроен ключ Google Places бесплатного уровня, искать кофейни в радиусе от координат подразделения и предзаполнять карточки конкурентов (название, адрес, рейтинг, `google_place_id`). Это строго вспомогательный инструмент — основной, всегда доступный путь — ручное создание карточек. Без ключа или при недоступном бесплатном уровне фича просто деградирует до ручного ввода.

Ключ Places — секрет `integration_credentials` со скоупом платформы (`platform, google_places`), зашифрован Fernet (`enc:v2:*`) и читается только на бэкенде; egress следует платформенной политике ([[vpn-egress]]). Доступ — за швом провайдера, согласованным с остальной платформой ([[provider-abstraction]], [[ADR-009]]), и вся секция под `module_competitors_enabled`.

## Возможности

- Радиусный поиск ближайших мест от `lat`/`lon` подразделения, закрытый настроенным ключом `google_places`.
- Предзаполнение карточек конкурентов названием, адресом, рейтингом, `google_place_id` (пользователь подтверждает перед сохранением).
- Грациозная деградация: нет ключа / недоступен бесплатный уровень → ручное создание карточек (основной путь) остаётся полностью работоспособным.
- Ключ хранится со скоупом платформы и зашифрован (`enc:v2:*`), читается только на бэкенде; без экспонирования браузеру.
- За модульным гейтом `module_competitors_enabled`.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[admin]] | Запускает поиск Places и подтверждает предзаполненные карточки конкурентов для организации. |
| [[superadmin]] | Задаёт ключ Google Places и переключает фичу через config-API по тенантам. |
| [[sqladmin-operator]] | Хранит/ротирует учётные данные `google_places` в плоскости SQLAdmin (см. [[LCOS-F3-sqladmin-operator]]). |
| [[member]] | Не участвует (ведение справочника — задача admin). |

Тенант-скоуп: предзаполненные карточки пишутся в собственный [[LCOS-F54-competitor-directory]] организации ([[multitenancy]]).

## Задействованные сущности

- [[integration_credentials]] — ключ `google_places` со скоупом платформы, зашифрован Fernet (`enc:v2:*`), только на бэкенде.
- [[subdivisions]] — поставляет `lat`/`lon` для радиусного поиска.
- [[system_settings]] — гейт `module_competitors_enabled` и любые связанные с Places флаги, разрешаемые в рантайме.
- `competitors` (будущая таблица со скоупом org) — цель prefill (см. [[LCOS-F54-competitor-directory]]).

## Зависимости / связи

- **Requirements:** [[provider-abstraction]] (Places за швом, согласованно с другими интеграциями), [[config-secrets]] + [[secret-encryption]] (ключ хранится зашифрованным, без фолбэка на env), [[vpn-egress]] (egress регулируется платформенной политикой).
- **Features:** предзаполняет карточки для [[LCOS-F54-competitor-directory]]; гейтится [[LCOS-F6-module-gates]]; дополняет ручной обход за [[LCOS-F55-menu-ocr]].
- **ADR:** [[ADR-009]] (шов провайдера), [[ADR-006]] (политика egress).

## Критерии приёмки

Критерии приёмки: TBD (Phase 2 — детализируются при активации).

## Sources

- `plan/PHASE_F7_COMPETITORS_MENU.md §1` — F7-B4 (опциональный Google Places для начального списка; ключ в `integration_credentials(platform, google_places)`; ручное создание — основной путь).
- `07_PHASES.md Э7` (заполнение справочника конкурентов).
- `plan/00_IMPLEMENTATION_PLAN.md F7`.
