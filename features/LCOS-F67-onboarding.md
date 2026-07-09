---
id: LCOS-F67
type: feature
title: Self-service онбординг
epic: "[[LCOS-E15-saas]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin]
entities: ["[[organizations]]", "[[subdivisions]]", "[[users]]", "[[memberships]]", "[[integration_credentials]]", "[[sku_mapping]]", "[[packings]]"]
requirements: ["[[multitenancy]]", "[[auth]]", "[[erp-esupl-integration]]", "[[secret-encryption]]"]
adrs: ["[[ADR-008]]"]
legacy_refs: [plan P2-B, "DEC-08"]
sources: ["plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-B", "plan/PHASE_P2_SAAS_OUTLINE.md §1", "Local_OS_About.md Phase 2"]
updated: 2026-07-09
---
# LCOS-F67 · Self-service онбординг

**Epic:** [[LCOS-E15-saas]] · **Status:** future · **Phase:** Phase 2

## Описание

Позволяет новому владельцу кофейни начать пользоваться LCOS без того, чтобы основатель вручную создавал его тенант. Self-service регистрация создаёт организацию + подразделение + admin-пользователя в одном потоке — первый публичный эндпоинт записи, работающий *вне* существующего тенанта, что как раз и есть причина, почему ему нужен собственный выделенный security review перед выпуском.

После регистрации визард подключения проводит владельца через связывание Esupl (ввод `team_id` / `warehouse_id` / API-токена через существующий пер-org pos-config, DEC-08), запуск начального импорта каталога (SKU/packings) и прохождение туториала первой накладной. Он также закрывает два пробела auth, которые никогда не были нужны single-tenant Phase 1: подтверждение email и сброс пароля.

Иерархию тенантов и пер-org POS-учётные данные, которые наполняет эта фича, уже существуют ([[LCOS-F1-multitenancy]], [[ADR-008]]); онбординг — управляемый, неприсматриваемый путь в них.

## Возможности

- Self-service регистрация: создаёт [[organizations]] + [[subdivisions]] + запись admin [[users]] с её связью [[memberships]] (публичный, не-тенант-скоупный эндпоинт — выделенный security review).
- Визард подключения Esupl: ввод `team_id` / `warehouse_id` / токена в существующий пер-org pos-config (DEC-08).
- Начальный импорт каталога SKU и packings; туториал первой накладной.
- Подтверждение email и сброс пароля (отсутствующие в Phase 1).

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[admin]] | Самозарегистрировавшийся владелец кофейни: завершает регистрацию, подключает Esupl, импортирует каталог, проходит туториал. |
| [[superadmin]] | Надзирает за новыми тенантами по платформе; может ассистировать онбордингу. |
| [[member]] | Приглашён в уже онбордированный тенант; не запускает онбординг. |
| [[sqladmin-operator]] | Может инспектировать/чинить pos-config тенанта в плоскости SQLAdmin (см. [[LCOS-F3-sqladmin-operator]]). |

## Задействованные сущности

- [[organizations]], [[subdivisions]], [[users]], [[memberships]] — тенант + первый admin, создаваемые self-service регистрацией.
- [[integration_credentials]] — пер-org токен Esupl, захватываемый визардом подключения (зашифрован Fernet, только на бэкенде).
- [[sku_mapping]], [[packings]] — наполняются начальным импортом каталога.

## Зависимости / связи

- **Requirements:** [[multitenancy]] (создаёт полностью изолированный тенант; публичный эндпоинт не должен утекать между `organization_id`), [[auth]] (подтверждение email + сброс пароля + учётные данные первого admin), [[erp-esupl-integration]] (pos-config + импорт каталога только на чтение), [[secret-encryption]] (токен хранится зашифрованным).
- **Features:** требует сначала [[LCOS-F66-prod-hardening]] (нет внешних пользователей до упрочнения); строится на [[LCOS-F1-multitenancy]] и пути pos-config в [[LCOS-F11-esupl-read]]; импорт каталога переиспользует [[LCOS-F15-sku-catalog]].
- **Epics:** часть [[LCOS-E15-saas]]; предшествует [[LCOS-F68-billing]] (пилотированный онбординг доказывает готовность платить до того, как построен биллинг).
- **ADR:** [[ADR-008]] (переиспользование multi-tenant-ready иерархии).

## Критерии приёмки

- Критерии приёмки: TBD (Phase 2 — детализируются при активации). Раскладываются в выделенный файл `PHASE_P2_B`; публичный эндпоинт регистрации требует отдельного security review как часть его AC.

## Sources

- `plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-B` (self-service регистрация, визард Esupl, импорт каталога, подтверждение email/сброс).
- `plan/PHASE_P2_SAAS_OUTLINE.md §1` (существующий пер-org pos-config, DEC-08).
- `Local_OS_About.md` Phase 2 (self-service онбординг для других владельцев).
