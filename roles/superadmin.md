---
id: role-superadmin
type: role
title: superadmin (global application flag)
status: built
plane: app-plane (JWT)
identity: users.is_superadmin (global boolean on User)
sources:
  - 01_ARCHITECTURE.md §Auth (Roles / Sessions / Endpoints)
  - APP_OVERVIEW.md §Auth
  - db/models.py (User.is_superadmin), app/auth/dependencies.py (require_superadmin), app/auth/service.py (AuthService._role_for)
updated: 2026-07-09
---
# superadmin

**Plane:** app-plane (application, JWT) · **Identity:** `users.is_superadmin` (boolean, default `false`) · **Not a role in the enum** — it is a global flag on the `User` row.

## Who this is
The system owner/operator on the LCOS side — a "god-mode" application user. A real row in the global `users` table (see [[users]]), but **without a required membership** ([[memberships]]) in any subdivision. Seed account: `iter` / `iter` (global superadmin, no membership).

## Authentication plane
This is the **app-plane**: login via the application auth (`POST /auth/login`), argon2 password hash in `users.password_hash`, access-JWT (HS256, TTL 15 min, HttpOnly cookie `lcos_access`) + opaque refresh session (30 min, rotation, reuse detection) in [[refresh_sessions]]. The `is_superadmin` flag lands in the access-token payload, so superadmin authorization is resolved **stateless** from the signed token, without a DB lookup (`decode_access_token → AccessClaims`).

This is NOT the [[sqladmin-operator]] plane: the SQLAdmin operator is a separate plane (env creds + bcrypt, session-cookie, no row in `users`). The two planes are never mixed ([[ADR-007]]).

## Capabilities
- **Crosses the tenant boundary.** Sees and can switch (`POST /auth/switch-context`) into **any** organization/subdivision regardless of membership. `AuthService._role_for` treats the superadmin as `admin` in every subdivision.
- **`GET /auth/me` returns the full tree** of org/subdivision (a regular user — only their own subdivisions). This is the single data source for the FE sidebar and active scope.
- **`switch-context`** without leaking existence: a `404` is possible for the superadmin (for a regular user — only `403`, so as not to reveal the existence of others' scopes).
- **Runtime config management** via SQLAdmin: edits `system_settings` ([[system_settings]]) — AI/OCR provider choice, model names, VPN toggle, module toggles, `erp_write_enabled`. Switching the active OCR/LLM provider at runtime without redeploy (`resolve_ai_provider` reads `system_settings.ai_provider`).
- **Secret management**: `integration_credentials` ([[integration_credentials]]) — AI keys and Esupl tokens, Fernet encryption. Can write the POS config of any organization (`PUT /organizations/{id}/pos-config`, `_authorize()` admits the superadmin OR the admin of this org).
- **Route gating**: `require_superadmin` (`app/auth/dependencies.py`) closes superadmin-only handlers, including `admin_system` (the superadmin config API).

> Code note: on the UI plane, management of `system_settings`/secrets in practice goes through the **SQLAdmin operator plane** ([[sqladmin-operator]]), not through the app-JWT. The `admin_system` routes are gated by `require_superadmin` (app-plane); the operator's edits of the same tables go through SQLAdmin. Do not confuse the two entrances to the same data.

## Difference from [[admin]] and [[member]]
- **admin** — the value `Role.admin` in [[memberships]], per-subdivision; does NOT cross the tenant.
- **member** — any user with a membership; baseline access to their subdivision's data.
- **superadmin** — a global flag, above both; equivalent to admin across all subdivisions at once.

There is no RBAC matrix — this is an explicit non-goal of Phase 1. There are exactly two authorization levels: `superadmin` (flag) and `admin` (membership role).

## Features granting/using the role
- [[LCOS-F2-app-auth]] — issues `is_superadmin` in the JWT, `/auth/me` full tree, `switch-context` without leaking.
- [[LCOS-F1-multitenancy]] — superadmin as the only subject legally crossing the tenant boundary.
- [[LCOS-F3-sqladmin-operator]] — `admin_system` config API under `require_superadmin`.
- [[LCOS-F4-config-secrets]] — editing `system_settings` and `integration_credentials`.
- [[LCOS-F5-provider-seams]] — runtime switching of the AI/OCR provider and the VPN toggle.
- [[LCOS-F6-module-gates]] — module toggles.

## Relations / requirements
[[auth]] · [[multitenancy]] · [[config-secrets]] · [[secret-encryption]] · [[ADR-007]] · [[users]] · [[memberships]] · [[refresh_sessions]]

## Sources
- `01_ARCHITECTURE.md` §Auth — Roles (line ~433), Sessions/JWT (~440), Endpoints `/auth/me` `/auth/switch-context` (~447–448), `require_superadmin` (~454).
- `APP_OVERVIEW.md` §Auth (two planes, roles).
- Code: `app/auth/dependencies.py` (`require_superadmin`, `get_tenant_context`), `app/auth/service.py` (`_role_for`), `db/models.py` (`User.is_superadmin`).
