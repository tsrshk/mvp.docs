---
id: role-member
type: role
title: member (subdivision participant)
status: built
plane: app-plane (JWT)
identity: presence of a row in memberships (any user↔subdivision)
sources:
  - 01_ARCHITECTURE.md §Auth (Roles), §Data Model (memberships)
  - APP_OVERVIEW.md §Auth
  - db/models.py (Membership), app/auth/service.py (_role_for), app/auth/dependencies.py
updated: 2026-07-09
---
# member

**Plane:** app-plane (application, JWT) · **Identity:** presence of a row in [[memberships]] for `(user_id, subdivision_id)` · **Not a separate enum value** — `Role` in Phase 1 carries only `admin`.

## Who this is
Any application user ([[users]]) who has a membership in a [[subdivisions]] — i.e. they receive an active tenant context and access to that subdivision's operational data. "member" is a general name for "a participant with a membership"; the concrete role in the membership in Phase 1 is always `admin` (the only enum value), so in the current code "just a member without the admin role" practically coincides with [[admin]] at the data level. The distinction matters as a **semantic seam**: when the `Role` enum is extended, member will become a separate level.

## Authentication plane
app-plane: `POST /auth/login`, argon2, access-JWT (15 min, HttpOnly `lcos_access`) + refresh ([[refresh_sessions]]). The payload carries `org`, `sub_div`, `role`. Authorization is stateless from the signed token. NOT the [[sqladmin-operator]] plane ([[ADR-007]]).

## Capabilities
- **Active context only within its own membership.** `GET /auth/me` returns only the subdivisions where the user has a row in `memberships` (the full tree is a [[superadmin]] privilege).
- **`switch-context`** only into subdivisions of its own membership; otherwise `403` (without leaking the existence of others' scopes — `404` is available only to the superadmin).
- **Operational work** within its subdivision: invoice intake, SKU catalog/mappings, suppliers — access to the subdivision's data via `get_tenant_context` (requires an active `organization_id`).
- **Fail-closed for a non-participant.** A user without a membership and not a superadmin can log in but has **no active context** → `get_tenant_context` returns `403 "no active organization context"`, the FE shows "no available subdivisions".

## Difference from other roles
- **admin** — the same membership, but with an explicit `role=admin` (the only enum value right now); plus the right to the organization POS config. See [[admin]].
- **superadmin** — a global flag, treated as admin across all subdivisions, crosses the tenant boundary. See [[superadmin]].

There is no RBAC matrix (an explicit non-goal). There are two authorization levels: `superadmin` (flag) and `admin` (membership role); "member" is the fact of having a membership.

## Features granting/using the role
- [[LCOS-F2-app-auth]] — membership → active context, `/auth/me` only your subdivisions, `switch-context`.
- [[LCOS-F1-multitenancy]] — membership as the key to the tenant scope; no membership = closed data.
- Intake [[LCOS-E2-invoice-intake]] and SKU identity [[LCOS-E3-sku-identity]] run in the member/admin context.

## Relations / requirements
[[auth]] · [[multitenancy]] · [[ADR-007]] · [[users]] · [[memberships]] · [[subdivisions]] · [[refresh_sessions]]

## Sources
- `01_ARCHITECTURE.md` §Auth — Roles (no-membership → closed tenant, line ~434), Endpoints `/auth/me` `/auth/switch-context` (~447–448), `get_tenant_context` (~454).
- `APP_OVERVIEW.md` §Auth.
- Code: `db/models.py` (`Membership`), `app/auth/service.py` (`_role_for`), `app/auth/dependencies.py` (`get_current_context`, `get_tenant_context`).
