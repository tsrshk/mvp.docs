---
id: role-superadmin
type: role
title: superadmin (глобальный флаг приложения)
status: built
plane: app-plane (JWT)
identity: users.is_superadmin (глобальный boolean на User)
sources:
  - 01_ARCHITECTURE.md §Auth (Roles / Sessions / Endpoints)
  - APP_OVERVIEW.md §Auth
  - db/models.py (User.is_superadmin), app/auth/dependencies.py (require_superadmin), app/auth/service.py (AuthService._role_for)
updated: 2026-07-09
---
# superadmin

**Plane:** app-plane (приложение, JWT) · **Identity:** `users.is_superadmin` (boolean, default `false`) · **Не роль в enum** — это глобальный флаг на строке `User`.

## Кто это
Владелец/оператор системы на стороне LCOS — пользователь приложения в режиме «god-mode». Реальная строка в глобальной таблице `users` (см. [[users]]), но **без обязательного membership** ([[memberships]]) в каком-либо подразделении. Seed-аккаунт: `iter` / `iter` (глобальный superadmin, без membership).

## Плоскость аутентификации
Это **app-plane**: вход через auth приложения (`POST /auth/login`), argon2-хеш пароля в `users.password_hash`, access-JWT (HS256, TTL 15 мин, HttpOnly cookie `lcos_access`) + opaque refresh-сессия (30 мин, ротация, reuse detection) в [[refresh_sessions]]. Флаг `is_superadmin` попадает в payload access-токена, поэтому авторизация superadmin разрешается **stateless** из подписанного токена, без обращения к БД (`decode_access_token → AccessClaims`).

Это НЕ плоскость [[sqladmin-operator]]: SQLAdmin operator — отдельная плоскость (env-креды + bcrypt, session-cookie, без строки в `users`). Две плоскости никогда не смешиваются ([[ADR-007]]).

## Возможности
- **Пересекает границу тенанта.** Видит и может переключиться (`POST /auth/switch-context`) в **любую** организацию/подразделение вне зависимости от membership. `AuthService._role_for` трактует superadmin как `admin` в каждом подразделении.
- **`GET /auth/me` возвращает полное дерево** org/subdivision (обычный пользователь — только свои подразделения). Это единственный источник данных для сайдбара FE и активного scope.
- **`switch-context`** без утечки существования: для superadmin возможен `404` (для обычного пользователя — только `403`, чтобы не раскрывать существование чужих scope).
- **Runtime-управление конфигурацией** через SQLAdmin: редактирует `system_settings` ([[system_settings]]) — выбор AI/OCR provider, имена моделей, VPN toggle, module toggles, `erp_write_enabled`. Переключение активного OCR/LLM provider в runtime без redeploy (`resolve_ai_provider` читает `system_settings.ai_provider`).
- **Управление секретами**: `integration_credentials` ([[integration_credentials]]) — AI-ключи и токены Esupl, Fernet-шифрование. Может записать POS-конфигурацию любой организации (`PUT /organizations/{id}/pos-config`, `_authorize()` допускает superadmin ИЛИ admin данной организации).
- **Гейтинг маршрутов**: `require_superadmin` (`app/auth/dependencies.py`) закрывает superadmin-only обработчики, включая `admin_system` (config API суперадмина).

> Замечание по коду: на UI-плоскости управление `system_settings`/секретами на практике идёт через **плоскость SQLAdmin operator** ([[sqladmin-operator]]), а не через app-JWT. Маршруты `admin_system` гейтятся `require_superadmin` (app-plane); правки тех же таблиц оператором идут через SQLAdmin. Не путать два входа к одним данным.

## Отличие от [[admin]] и [[member]]
- **admin** — значение `Role.admin` в [[memberships]], на уровне подразделения; НЕ пересекает тенант.
- **member** — любой пользователь с membership; базовый доступ к данным своего подразделения.
- **superadmin** — глобальный флаг, над обоими; эквивалентен admin во всех подразделениях сразу.

RBAC-матрицы нет — это явный non-goal Phase 1. Есть ровно два уровня авторизации: `superadmin` (флаг) и `admin` (роль в membership).

## Features, предоставляющие/использующие роль
- [[LCOS-F2-app-auth]] — выдаёт `is_superadmin` в JWT, `/auth/me` полное дерево, `switch-context` без утечки.
- [[LCOS-F1-multitenancy]] — superadmin как единственный субъект, легально пересекающий границу тенанта.
- [[LCOS-F3-sqladmin-operator]] — config API `admin_system` под `require_superadmin`.
- [[LCOS-F4-config-secrets]] — редактирование `system_settings` и `integration_credentials`.
- [[LCOS-F5-provider-seams]] — runtime-переключение AI/OCR provider и VPN toggle.
- [[LCOS-F6-module-gates]] — module toggles.

## Связи / требования
[[auth]] · [[multitenancy]] · [[config-secrets]] · [[secret-encryption]] · [[ADR-007]] · [[users]] · [[memberships]] · [[refresh_sessions]]

## Источники
- `01_ARCHITECTURE.md` §Auth — Roles (строка ~433), Sessions/JWT (~440), Endpoints `/auth/me` `/auth/switch-context` (~447–448), `require_superadmin` (~454).
- `APP_OVERVIEW.md` §Auth (две плоскости, роли).
- Код: `app/auth/dependencies.py` (`require_superadmin`, `get_tenant_context`), `app/auth/service.py` (`_role_for`), `db/models.py` (`User.is_superadmin`).
