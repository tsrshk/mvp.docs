---
id: role-member
type: role
title: member (участник подразделения)
status: built
plane: app-plane (JWT)
identity: наличие строки в memberships (любой user↔subdivision)
sources:
  - 01_ARCHITECTURE.md §Auth (Roles), §Data Model (memberships)
  - APP_OVERVIEW.md §Auth
  - db/models.py (Membership), app/auth/service.py (_role_for), app/auth/dependencies.py
updated: 2026-07-09
---
# member

**Plane:** app-plane (приложение, JWT) · **Identity:** наличие строки в [[memberships]] (org-level или subdivision-level) · **«member» — зонтичный термин** (любой пользователь с membership), а не значение enum. enum `role` = `{admin, manager}` (ADR-023).

## Кто это
Любой пользователь приложения ([[users]]), у которого есть membership — то есть он получает
активный контекст тенанта и доступ к операционным данным. «member» — зонтичное название для
«участник с membership»; конкретная роль в membership — `admin` либо `manager` (ADR-023). См.
[[admin]] (управляет орг), [[manager]] (прикладные фичи без управления).

> **Обновление 2026-07-21 ([[ADR-023]]):** введена 3-ролевая модель. enum `role` = `{admin,
> manager}`; «member» остаётся общим термином для наличия membership, а не значением enum.

## Плоскость аутентификации
app-plane: `POST /auth/login`, argon2, access-JWT (15 мин, HttpOnly `lcos_access`) + refresh ([[refresh_sessions]]). Payload несёт `org`, `sub_div`, `role`. Авторизация — stateless из подписанного токена. НЕ плоскость [[sqladmin-operator]] ([[ADR-007]]).

## Возможности
- **Активный контекст только в рамках своего membership.** `GET /auth/me` возвращает только подразделения, где у пользователя есть строка в `memberships` (полное дерево — привилегия [[superadmin]]).
- **`switch-context`** только в подразделения своего membership; иначе `403` (без утечки существования чужих scope — `404` доступен только superadmin).
- **Операционная работа** в своём подразделении: приём накладных, каталог/маппинги SKU, поставщики — доступ к данным подразделения через `get_tenant_context` (требует активного `organization_id`).
- **Fail-closed для не-участника.** Пользователь без membership и не superadmin может войти, но у него **нет активного контекста** → `get_tenant_context` возвращает `403 "no active organization context"`, FE показывает «нет доступных подразделений».

## Отличие от других ролей
- **admin** — membership с `role=admin`: управляет своей организацией и подразделениями «сверху вниз» (сотрудники/настройки), плюс POS-конфигурация. См. [[admin]].
- **manager** — membership с `role=manager`: прикладные фичи без управления сотрудниками/настройками. См. [[manager]].
- **superadmin** — глобальный флаг, трактуется как admin во всех подразделениях, пересекает границу тенанта. См. [[superadmin]].

RBAC — 3 роли (ADR-023): `superadmin` (флаг) + enum `{admin, manager}` на membership; «member» — факт наличия membership. Энфорсмент — SSOT `app/auth/rbac.py`.

## Features, предоставляющие/использующие роль
- [[LCOS-F2-app-auth]] — membership → активный контекст, `/auth/me` только ваши подразделения, `switch-context`.
- [[LCOS-F1-multitenancy]] — membership как ключ к scope тенанта; нет membership = данные закрыты.
- Приём [[LCOS-E2-invoice-intake]] и SKU-identity [[LCOS-E3-sku-identity]] выполняются в контексте member/admin.

## Связи / требования
[[auth]] · [[multitenancy]] · [[ADR-007]] · [[users]] · [[memberships]] · [[subdivisions]] · [[refresh_sessions]]

## Источники
- `01_ARCHITECTURE.md` §Auth — Roles (no-membership → закрытый тенант, строка ~434), Endpoints `/auth/me` `/auth/switch-context` (~447–448), `get_tenant_context` (~454).
- `APP_OVERVIEW.md` §Auth.
- Код: `db/models.py` (`Membership`), `app/auth/service.py` (`_role_for`), `app/auth/dependencies.py` (`get_current_context`, `get_tenant_context`).
