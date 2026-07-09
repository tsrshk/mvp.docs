---
id: role-admin
type: role
title: admin (роль на уровне подразделения через membership)
status: built
plane: app-plane (JWT)
identity: memberships.role = Role.admin (на уровне подразделения)
sources:
  - 01_ARCHITECTURE.md §Auth (Roles), §Data Model (memberships)
  - APP_OVERVIEW.md §Auth
  - db/models.py (Membership.role, Role enum), routes/organizations.py (_authorize)
updated: 2026-07-09
---
# admin

**Plane:** app-plane (приложение, JWT) · **Identity:** `memberships.role = admin` для конкретной пары `(user_id, subdivision_id)` · **Единственное значение enum `Role`** в Phase 1.

## Кто это
Пользователь приложения, отвечающий за конкретное подразделение (владелец / управляющий кофейни). Строка в [[users]] плюс строка в [[memberships]], связывающая пользователя с [[subdivisions]] и несущая `role=admin`. Уникальность — `(user_id, subdivision_id)`. Организация выводится через подразделение и в membership не хранится. Seed-аккаунт: `oter` / `oter` (admin подразделения-кофейни).

## Плоскость аутентификации
app-plane: `POST /auth/login`, пароль argon2, access-JWT (15 мин, HttpOnly `lcos_access`) + refresh ([[refresh_sessions]]). Payload access-токена несёт `role` (= `admin`), `org`, `sub_div`. Авторизация — stateless из подписанного токена.

Это НЕ [[sqladmin-operator]] (env/bcrypt, session-cookie, без строки в `users`) — см. [[ADR-007]].

## Возможности
- **Работает в границах собственного тенанта.** `get_tenant_context` требует активного `organization_id`; admin действует внутри org/подразделения своего membership. Он НЕ пересекает границу тенанта (в отличие от [[superadmin]]).
- **POS-конфигурация организации**: `PUT /organizations/{org_id}/pos-config` — `_authorize()` допускает superadmin ИЛИ admin данной организации. Ввод plaintext-токена Esupl → `encrypt()` → новая активная запись [[integration_credentials]] (scope=org, provider=esupl), деактивируя ранее активную. `GET` возвращает `PosConfigOut { esupl_team_id, esupl_api_token: {is_set, last4} }` — plaintext никогда не возвращается.
- **Операционная работа** в своём подразделении: приём накладных, каталог/маппинги SKU, карточки поставщиков — всё, что даёт доступ membership к данным подразделения (полный набор — см. features ниже; на уровне данных admin и member различаются мало, RBAC-матрицы нет).

## Отличие от других ролей
- **member** — любой пользователь с membership; базовый доступ к данным подразделения. Enum `Role` в Phase 1 несёт **только** значение `admin`, поэтому «member» — это скорее «участник с membership», тогда как `admin` — явно заданная роль. См. [[member]].
- **superadmin** — глобальный флаг, трактуется как admin во всех подразделениях. См. [[superadmin]].
- Пользователь **без membership и не superadmin** может войти, но у него **нет активного контекста** → данные тенанта закрыты (`403` из `get_tenant_context`), FE показывает «нет доступных подразделений».

Матрицы прав нет — это явный non-goal. Есть два уровня авторизации: `superadmin` (флаг) и `admin` (роль в membership).

## Features, предоставляющие/использующие роль
- [[LCOS-F2-app-auth]] — membership → `role` в JWT, `/auth/me` только ваши подразделения.
- [[LCOS-F1-multitenancy]] — admin как субъект внутри границы тенанта.
- [[LCOS-F4-config-secrets]] — POS-конфигурация организации (`pos-config`), секрет Esupl в scope org.
- [[LCOS-F17-supplier-cards]] — карточки поставщиков и условия поставки в его scope.
- Features приёма эпика [[LCOS-E2-invoice-intake]] и SKU-features [[LCOS-E3-sku-identity]] выполняются в контексте admin/member.

## Связи / требования
[[auth]] · [[multitenancy]] · [[config-secrets]] · [[ADR-007]] · [[users]] · [[memberships]] · [[subdivisions]] · [[organizations]]

## Источники
- `01_ARCHITECTURE.md` §Auth — Roles (enum `Role` с единственным значением `admin`, строка ~434), §Data Model `memberships` (~245).
- `APP_OVERVIEW.md` §Auth (roles: superadmin / admin).
- Код: `db/models.py` (`Role`, `Membership.role`), `routes/organizations.py` (`_authorize`, `pos-config`), `app/auth/dependencies.py` (`get_tenant_context`).
