---
id: LCOS-F66
type: feature
title: Production-упрочнение и деплой
epic: "[[LCOS-E15-saas]]"
status: future
phase: "Phase 2"
roles: [superadmin, sqladmin-operator]
entities: ["[[integration_credentials]]", "[[system_settings]]", "[[refresh_sessions]]", "[[invoices]]"]
requirements: ["[[secret-encryption]]", "[[config-secrets]]", "[[fail-closed]]", "[[auth]]", "[[global-requirements]]"]
adrs: ["[[ADR-008]]", "[[ADR-009]]"]
legacy_refs: [plan P2-A, "DEFER-01", "DEFER-02", "DEFER-04", "DEC-04", R-Deploy]
sources: ["plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-A", "plan/PHASE_P2_SAAS_OUTLINE.md §3", "Local_OS_About.md Phase 2"]
updated: 2026-07-09
---
# LCOS-F66 · Production-упрочнение и деплой

**Epic:** [[LCOS-E15-saas]] · **Status:** future · **Phase:** Phase 2

## Описание

Первый рабочий элемент Phase 2 и жёсткое предусловие для каждого из остальных: никто вне Customer Zero не может касаться продукта, пока не завершено production-упрочнение. Оно переводит LCOS с локальной установки Docker Compose на хостинговый деплой (цель — Hetzner) и закрывает пробелы безопасности/эксплуатации, намеренно отложенные в течение Phase 1 (элементы бэклога `DEFER-*` и чек-лист соответствия R-Deploy).

Объём охватывает многостадийный `Dockerfile.prod`, инфраструктуру/деплой для бэкенда + хостинг статического фронтенда, реальные production-секреты (`SECRETS_ENC_KEY` с ротацией, `JWT_SECRET`, `SESSION_SECRET`), упрочнение транспорта (`COOKIE_SECURE=true`, `CSRF_ENABLED=true` с изменением `backendRequest.ts`, читающим cookie `lcos_csrf` в заголовок `X-CSRF-Token` — DEC-04), контроль злоупотреблений (rate-limiting `/auth/login`, серверная идемпотентность отправки накладной, заменяющая пер-браузерный `sentRegistry` — DEFER-04), CI-пайплайн (непреложные merge-gate pytest, ruff, сборка фронтенда), бэкапы Postgres и минимальную наблюдаемость (структурированные логи + проверка uptime + алертинг об ошибках).

Мультитенантность, шифрование секретов и разделённые основы плоскости auth уже существуют с первого дня ([[LCOS-E1-platform]]); эта фича не перепроектирует их, она делает их безопасными для production.

## Возможности

- Production-контейнер/сборка (`Dockerfile.prod`, многостадийный) и хостинговый деплой для бэкенда + статического фронтенда.
- Реальные production-секреты с ротацией для Fernet KEK (`SECRETS_ENC_KEY`), `JWT_SECRET`, `SESSION_SECRET`.
- Защищённые cookie + CSRF от начала до конца (`COOKIE_SECURE`, `CSRF_ENABLED`, `lcos_csrf` → `X-CSRF-Token`).
- Rate-limiting логина и серверная идемпотентность отправки накладной (заменяющая пер-браузерную защиту).
- CI: pytest (непреложные merge-gate), ruff, сборка фронтенда; автоматические бэкапы Postgres.
- Минимальный мониторинг: структурированные логи, проверка uptime, алертинг об ошибках.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[superadmin]] | Владеет деплоем/ротацией секретов и читает production-чек-лист R-Deploy; новой поверхности для конечного пользователя нет. |
| [[sqladmin-operator]] | Эксплуатирует развёрнутый инстанс через плоскость SQLAdmin (см. [[LCOS-F3-sqladmin-operator]]); управляет рантайм-конфигом/секретами. |
| [[admin]] | Прямого взаимодействия нет; выигрывает от упрочнённой хостинговой платформы. |
| [[member]] | Прямого взаимодействия нет. |

## Задействованные сущности

- [[integration_credentials]] — зашифрованные секреты, чья production-ротация KEK является частью упрочнения.
- [[system_settings]] — рантайм-конфиг/флаги, которые должны быть выставлены для production (не dev-дефолты).
- [[refresh_sessions]] — auth-сессии, затрагиваемые упрочнением защищённых cookie / CSRF.
- [[invoices]] — путь отправки, получающий серверную идемпотентность (DEFER-04).

## Зависимости / связи

- **Requirements:** [[secret-encryption]] и [[config-secrets]] (production KEK + ротация, реальные секреты), [[fail-closed]] (egress остаётся fail-closed в production), [[auth]] (защищённые cookie, CSRF, rate-limit логина), [[global-requirements]] (чек-лист R-Deploy должен быть полностью зелёным).
- **Features:** упрочняет платформу, построенную в [[LCOS-E1-platform]] ([[LCOS-F2-app-auth]], [[LCOS-F4-config-secrets]], [[LCOS-F3-sqladmin-operator]]); открывает [[LCOS-F67-onboarding]] (нет внешних пользователей до его завершения).
- **Epics:** первый рабочий блок [[LCOS-E15-saas]]; блокирует все родственные фичи Phase 2.
- **ADR:** [[ADR-008]] (переиспользование multi-tenant-ready основ), [[ADR-009]] (никакой спекулятивной сборки до гейта).

## Критерии приёмки

- Критерии приёмки: TBD (Phase 2 — детализируются при активации). Раскладываются в выделенный файл `PHASE_P2_A` со своими AC при старте Phase 2; production-чек-лист R-Deploy должен быть полностью зелёным до первого внешнего пользователя.

## Sources

- `plan/PHASE_P2_SAAS_OUTLINE.md §2 P2-A` (Dockerfile.prod, IaC, секреты, cookie/CSRF, rate-limiting, идемпотентность, CI, бэкапы, мониторинг).
- `plan/PHASE_P2_SAAS_OUTLINE.md §3` (порядок: Pilot-Gate → P2-A первым), `§4 AC-3` (P2-A завершён до первого внешнего пользователя).
- `Local_OS_About.md` Phase 2 (Docker Compose локально → Hetzner в Phase 2).
