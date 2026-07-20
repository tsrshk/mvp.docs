---
id: role-sqladmin-operator
type: role
title: SQLAdmin operator (отдельная операторская плоскость)
status: built
plane: operator-plane (SQLAdmin, env-creds)
identity: env ADMIN_USERNAME + ADMIN_PASSWORD_HASH (bcrypt) — БЕЗ строки в users
sources:
  - 01_ARCHITECTURE.md §Auth (SQLAdmin operator login, Admin panel)
  - APP_OVERVIEW.md §Auth
  - app/core/security.py (AdminAuth, authenticate_admin), app/admin/setup.py (ModelViews)
updated: 2026-07-09
---
# sqladmin-operator

**Plane:** operator-plane (SQLAdmin) — **ОТДЕЛЬНАЯ** от app-plane · **Identity:** env-креды `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` (**bcrypt**) · **Без строки в [[users]]** · session-cookie.

## Кто это
Единственный dev/operator «backdoor» из переменных окружения — оператор инфраструктуры LCOS (обычно сам разработчик). Живёт в `app/core/security.py` (`AdminAuth` + `authenticate_admin`) и `app/admin/setup.py`. Seed-логин: `admin` / `admin` — **намеренно НЕ заведён в `users`**.

## Плоскость аутентификации (ключевой момент)
Это **вторая, независимая** плоскость авторизации, которую нельзя смешивать с прикладной ([[ADR-007]]):

| | app-plane | operator-plane (эта) |
|---|---|---|
| Субъекты | [[superadmin]] / [[admin]] / [[member]] | SQLAdmin operator |
| Хранилище identity | таблица `users` ([[users]]) + `memberships` | переменные окружения, без строки в БД |
| Пароль | argon2 (`app/auth/password.py`) | **bcrypt** (`app/core/security.py`, `bcrypt.checkpw`) |
| Сессия | access-JWT 15 мин (HttpOnly `lcos_access`) + refresh | Starlette session-cookie (`admin_authenticated=True`, `SessionMiddleware`, `session_secret`) |
| Вход | `POST /auth/login` | форма SQLAdmin на `/admin` |

`hash_password`/`verify_password` определены **дважды** (argon2 для users, bcrypt для оператора) — не путать их.

## Возможности
Вход по форме проверяет `authenticate_admin` (`username == settings.admin_username`, bcrypt-verify `settings.admin_password_hash`), выставляет `admin_authenticated=True` в сессии. Это даёт доступ к панели SQLAdmin на `/admin` с ModelViews:
Organization ([[organizations]]), Subdivision ([[subdivisions]]), User ([[users]]), Membership ([[memberships]]), Supplier ([[suppliers]]), Invoice, InvoiceLine, SystemSetting ([[system_settings]]), IntegrationCredential ([[integration_credentials]]), RefreshSession ([[refresh_sessions]]).

Заметные операции:
- **`UserAdmin.on_model_change`** — поле `password_hash` принимает **plaintext** и argon2-хеширует его при сохранении (пропускает, если уже `$argon2`). Так оператор **создаёт реальных пользователей приложения** (включая первого superadmin). Пошаговый how-to (порядок org→subdivision→user→membership) — [[creating-users]].
- **`IntegrationCredentialAdmin.on_model_change`** — plaintext на входе → `encrypt()` (Fernet, идемпотентно) перед сохранением, выставляет `rotated_at`, держит инвариант single-active (деактивирует другие активные строки той же `(scope, provider, org, subdivision)`); списки/детали маскируют значение до last-4 (`_cred_last4`). Поле write-only-plaintext / read-masked.
- **`SystemSetting`** — редактирование whitelisted несекретного KV (AI provider, models, VPN toggle, module toggles, `erp_write_enabled`). Ключи выбираются из `REGISTRY` (`SETTING_TYPES` наполняет dropdown), не вводятся свободно.
- **`RefreshSessionAdmin`** — read-only (только просмотр).

> Корректность (doc↔code): маршруты `admin_system` (config API суперадмина) гейтятся **app-JWT `require_superadmin`**, а не этой плоскостью. Но фактическое администрирование `system_settings`/секретов на практике идёт через **плоскость SQLAdmin operator**. Это два разных входа к одним и тем же таблицам — оператор редактирует их напрямую в SQLAdmin, [[superadmin]] — через API/UI под `require_superadmin`. Не смешивать.

## Отличие от [[superadmin]]
superadmin — субъект приложения с флагом `is_superadmin` в `users`, действует через app-JWT и `/api`. SQLAdmin operator — инфраструктурная роль без строки в `users`, действует только в `/admin` через session-cookie. Оператор может **создать** superadmin (через `UserAdmin`), но сам им не является.

## Features, предоставляющие/использующие роль
- [[LCOS-F3-sqladmin-operator]] — сама эта плоскость (mount SQLAdmin + AdminAuth + config API).
- [[LCOS-F4-config-secrets]] — редактирование `system_settings` и Fernet-секретов через ModelViews.
- [[LCOS-F2-app-auth]] — оператор бутстрапит пользователей приложения (create/reset через `UserAdmin`).
- [[LCOS-F5-provider-seams]] — runtime-переключение provider/VPN через `SystemSetting`.

## Связи / требования
[[auth]] · [[config-secrets]] · [[secret-encryption]] · [[ADR-007]] · [[users]] · [[integration_credentials]] · [[system_settings]]

## Источники
- `01_ARCHITECTURE.md` §Auth — "SQLAdmin operator login" (строка ~423, без строки в `users`), "Admin panel (SQLAdmin)" (~457–462), пароли argon2 vs bcrypt (~545), "Separate auth planes" (~771).
- `APP_OVERVIEW.md` §Auth (две независимые плоскости).
- Код: `app/core/security.py` (`AdminAuth`, `authenticate_admin`), `app/admin/setup.py` (ModelViews, `on_model_change`).
