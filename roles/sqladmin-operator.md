---
id: role-sqladmin-operator
type: role
title: SQLAdmin operator (separate operator plane)
status: built
plane: operator-plane (SQLAdmin, env-creds)
identity: env ADMIN_USERNAME + ADMIN_PASSWORD_HASH (bcrypt) — NO row in users
sources:
  - 01_ARCHITECTURE.md §Auth (SQLAdmin operator login, Admin panel)
  - APP_OVERVIEW.md §Auth
  - app/core/security.py (AdminAuth, authenticate_admin), app/admin/setup.py (ModelViews)
updated: 2026-07-09
---
# sqladmin-operator

**Plane:** operator-plane (SQLAdmin) — **SEPARATE** from app-plane · **Identity:** env creds `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` (**bcrypt**) · **No row in [[users]]** · session-cookie.

## Who this is
The single dev/operator "backdoor" from environment variables — the LCOS infrastructure operator (usually the developer themselves). Lives in `app/core/security.py` (`AdminAuth` + `authenticate_admin`) and `app/admin/setup.py`. Seed login: `admin` / `admin` — **deliberately NOT provisioned in `users`**.

## Authentication plane (key point)
This is a **second, independent** authorization plane that must not be mixed with the application one ([[ADR-007]]):

| | app-plane | operator-plane (this one) |
|---|---|---|
| Subjects | [[superadmin]] / [[admin]] / [[member]] | SQLAdmin operator |
| Identity store | `users` table ([[users]]) + `memberships` | env variables, no row in the DB |
| Password | argon2 (`app/auth/password.py`) | **bcrypt** (`app/core/security.py`, `bcrypt.checkpw`) |
| Session | access-JWT 15 min (HttpOnly `lcos_access`) + refresh | Starlette session-cookie (`admin_authenticated=True`, `SessionMiddleware`, `session_secret`) |
| Login | `POST /auth/login` | SQLAdmin form at `/admin` |

`hash_password`/`verify_password` are defined **twice** (argon2 for users, bcrypt for the operator) — do not confuse them.

## Capabilities
The form login checks `authenticate_admin` (`username == settings.admin_username`, bcrypt-verify `settings.admin_password_hash`), sets `admin_authenticated=True` in the session. It grants access to the SQLAdmin panel at `/admin` with ModelViews:
Organization ([[organizations]]), Subdivision ([[subdivisions]]), User ([[users]]), Membership ([[memberships]]), Supplier ([[suppliers]]), Invoice, InvoiceLine, SystemSetting ([[system_settings]]), IntegrationCredential ([[integration_credentials]]), RefreshSession ([[refresh_sessions]]).

Notable operations:
- **`UserAdmin.on_model_change`** — the `password_hash` field accepts **plaintext** and argon2-hashes it on save (skips if already `$argon2`). This is how the operator **creates real app users** (including the first superadmin).
- **`IntegrationCredentialAdmin.on_model_change`** — plaintext on input → `encrypt()` (Fernet, idempotent) before persist, sets `rotated_at`, holds the single-active invariant (deactivates other active rows of the same `(scope, provider, org, subdivision)`); lists/details mask the value to last-4 (`_cred_last4`). The field is write-only-plaintext / read-masked.
- **`SystemSetting`** — editing whitelisted non-secret KV (AI provider, models, VPN toggle, module toggles, `erp_write_enabled`). Keys are chosen from `REGISTRY` (`SETTING_TYPES` feeds the dropdown), not freely typed.
- **`RefreshSessionAdmin`** — read-only (inspection only).

> Correctness (doc↔code): the `admin_system` routes (superadmin config API) are gated by the **app-JWT `require_superadmin`**, not by this plane. But actual administration of `system_settings`/secrets in practice goes through the **SQLAdmin operator plane**. These are two different entrances to the same tables — the operator edits them directly in SQLAdmin, the [[superadmin]] via the API/UI under `require_superadmin`. Do not mix them.

## Difference from [[superadmin]]
superadmin is an application subject with the `is_superadmin` flag in `users`, acting via app-JWT and `/api`. The SQLAdmin operator is an infra role without a row in `users`, acting only in `/admin` via session-cookie. The operator can **create** a superadmin (via `UserAdmin`) but is not one themselves.

## Features granting/using the role
- [[LCOS-F3-sqladmin-operator]] — this very plane (SQLAdmin mount + AdminAuth + config API).
- [[LCOS-F4-config-secrets]] — editing `system_settings` and Fernet secrets via ModelViews.
- [[LCOS-F2-app-auth]] — the operator bootstraps app users (create/reset via `UserAdmin`).
- [[LCOS-F5-provider-seams]] — runtime provider/VPN switching via `SystemSetting`.

## Relations / requirements
[[auth]] · [[config-secrets]] · [[secret-encryption]] · [[ADR-007]] · [[users]] · [[integration_credentials]] · [[system_settings]]

## Sources
- `01_ARCHITECTURE.md` §Auth — "SQLAdmin operator login" (line ~423, no row in `users`), "Admin panel (SQLAdmin)" (~457–462), passwords argon2 vs bcrypt (~545), "Separate auth planes" (~771).
- `APP_OVERVIEW.md` §Auth (two independent planes).
- Code: `app/core/security.py` (`AdminAuth`, `authenticate_admin`), `app/admin/setup.py` (ModelViews, `on_model_change`).
