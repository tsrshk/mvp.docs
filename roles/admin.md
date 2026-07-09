---
id: role-admin
type: role
title: admin (per-subdivision membership role)
status: built
plane: app-plane (JWT)
identity: memberships.role = Role.admin (per-subdivision)
sources:
  - 01_ARCHITECTURE.md §Auth (Roles), §Data Model (memberships)
  - APP_OVERVIEW.md §Auth
  - db/models.py (Membership.role, Role enum), routes/organizations.py (_authorize)
updated: 2026-07-09
---
# admin

**Plane:** app-plane (application, JWT) · **Identity:** `memberships.role = admin` for a specific `(user_id, subdivision_id)` · **The only value of enum `Role`** in Phase 1.

## Who this is
An application user responsible for a specific subdivision (coffee-shop owner / manager). A row in [[users]] plus a row in [[memberships]] linking the user to a [[subdivisions]] and carrying `role=admin`. Uniqueness is `(user_id, subdivision_id)`. The organization is derived through the subdivision and is not stored in the membership. Seed account: `oter` / `oter` (admin of the coffee-shop subdivision).

## Authentication plane
app-plane: `POST /auth/login`, argon2 password, access-JWT (15 min, HttpOnly `lcos_access`) + refresh ([[refresh_sessions]]). The access-token payload carries `role` (= `admin`), `org`, `sub_div`. Authorization is stateless from the signed token.

This is NOT [[sqladmin-operator]] (env/bcrypt, session-cookie, no row in `users`) — see [[ADR-007]].

## Capabilities
- **Works within its own tenant boundary.** `get_tenant_context` requires an active `organization_id`; the admin acts inside the org/subdivision of its membership. It does NOT cross the tenant boundary (unlike [[superadmin]]).
- **Organization POS config**: `PUT /organizations/{org_id}/pos-config` — `_authorize()` admits the superadmin OR the admin of this org. Entering a plaintext Esupl token → `encrypt()` → a new active [[integration_credentials]] (scope=org, provider=esupl), deactivating the previously active one. `GET` returns `PosConfigOut { esupl_team_id, esupl_api_token: {is_set, last4} }` — plaintext is never returned.
- **Operational work** in its subdivision: invoice intake, SKU catalog/mappings, supplier cards — everything that membership access to the subdivision's data grants (full set — see features below; at the data level admin and member differ little, there is no RBAC matrix).

## Difference from other roles
- **member** — any user with a membership; baseline access to the subdivision's data. The `Role` enum in Phase 1 carries **only** the value `admin`, so "member" is more like "a participant with a membership", while `admin` is an explicitly set role. See [[member]].
- **superadmin** — a global flag, treated as admin across all subdivisions. See [[superadmin]].
- A user **without a membership and not a superadmin** can log in but has **no active context** → tenant data is closed (`403` from `get_tenant_context`), the FE shows "no available subdivisions".

There is no permissions matrix — an explicit non-goal. There are two authorization levels: `superadmin` (flag) and `admin` (membership role).

## Features granting/using the role
- [[LCOS-F2-app-auth]] — membership → `role` in the JWT, `/auth/me` only your subdivisions.
- [[LCOS-F1-multitenancy]] — admin as a subject inside the tenant boundary.
- [[LCOS-F4-config-secrets]] — organization POS config (`pos-config`), org-scope Esupl secret.
- [[LCOS-F17-supplier-cards]] — supplier cards and delivery terms within its scope.
- Intake features of epic [[LCOS-E2-invoice-intake]] and SKU features of [[LCOS-E3-sku-identity]] run in the admin/member context.

## Relations / requirements
[[auth]] · [[multitenancy]] · [[config-secrets]] · [[ADR-007]] · [[users]] · [[memberships]] · [[subdivisions]] · [[organizations]]

## Sources
- `01_ARCHITECTURE.md` §Auth — Roles (`Role` enum single value `admin`, line ~434), §Data Model `memberships` (~245).
- `APP_OVERVIEW.md` §Auth (roles: superadmin / admin).
- Code: `db/models.py` (`Role`, `Membership.role`), `routes/organizations.py` (`_authorize`, `pos-config`), `app/auth/dependencies.py` (`get_tenant_context`).
