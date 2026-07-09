---
id: LCOS-F2
type: feature
title: Application auth (JWT + refresh)
epic: "[[LCOS-E1-platform]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[users]]", "[[memberships]]", "[[refresh_sessions]]", "[[subdivisions]]", "[[organizations]]"]
requirements: ["[[auth]]", "[[fail-closed]]", "[[global-requirements]]"]
adrs: ["[[ADR-007]]"]
legacy_refs: [plan/00 G2, LCOS_Conformance R3, APP_OVERVIEW §4]
sources: ["APP_OVERVIEW.md §4", "01_ARCHITECTURE.md (Auth & multi-tenancy)", "LCOS_Conformance_Alignment_GlobalRequirements.md R3", "mvp.be app/auth/router.py:29", "mvp.be app/auth/tokens.py:37", "mvp.be app/auth/dependencies.py:32", "mvp.fe src/entities/auth", "mvp.fe src/shared/api/backendRequest.ts"]
updated: 2026-07-09
---
# LCOS-F2 · Application auth (JWT + refresh)
**Epic:** [[LCOS-E1-platform]] · **Status:** built · **Phase:** Phase 1

## Description

The authentication plane for **real coffee-shop users** (the React PWA). This is one of the **two entirely separate auth mechanisms** that must never be mixed (a `CLAUDE.md` non-negotiable): application auth (this feature) versus the SQLAdmin operator login ([[LCOS-F3-sqladmin-operator]]). Application users live in the global `users` table, passwords are hashed with **argon2** (`app/auth/password.py`), and sessions use a **short-lived JWT access cookie + an opaque, server-tracked refresh cookie**.

The access token is a signed JWT (PyJWT, HS256, `jwt_secret`, TTL **15 min**) carrying `{sub, is_superadmin, org, sub_div, role, type, iat, exp}` in the HttpOnly cookie `lcos_access`; every request authorizes **statelessly** from the signed token with no DB lookup. The refresh token is an **opaque** `token_urlsafe(48)` string (not a JWT) whose **SHA-256 hash only** is stored in `refresh_sessions`; it is HttpOnly cookie `lcos_refresh`, TTL **30 min sliding**, grouped by `family_id` for rotation and reuse-detection. The active tenant context is persisted on the refresh row (`active_subdivision_id`) so it survives a refresh.

Fail-closed properties matter here: invalid credentials return a **generic 401** (reason never disclosed), and **reuse of a revoked refresh token revokes the entire `family_id`** (theft detection). The frontend holds **no tokens in JS** — it sends `credentials:'include'` and transparently refreshes once on a 401.

## Capabilities

- `POST /auth/login`: argon2-verify → compute default context → issue access + refresh cookies with a fresh `family_id` (CSRF cookie too if enabled). Bad creds → generic 401.
- `POST /auth/refresh`: look up by hash; not-found/expired → 401; **revoked → reuse-detected: revoke whole `family_id` + 401**; else rotate within the same `family_id`, restore context from `active_subdivision_id`, reissue access.
- `POST /auth/logout`: revoke the current refresh row, clear cookies, 204.
- `GET /auth/me`: the **sole source** of the FE sidebar/active scope — regular user sees only their subdivisions, superadmin sees the full org/subdivision tree.
- `POST /auth/switch-context`: authorize via `_role_for` (403 without access; 404 only reachable by superadmin, avoiding existence leaks); requires a live, non-revoked refresh; reissues only the access cookie.
- Stateless authorization from the signed access-JWT (no per-request DB lookup); access revocation is not instant (mitigated by 15-min TTL) — an explicit non-goal.
- Argon2 password hashing for `users`; short login strings allowed (`LoginIn.email` is a plain `str`, not `EmailStr`).
- FE transport: HttpOnly cookies only, refresh-once-on-401 then replay (except `/auth/refresh` and `/auth/login`).

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Log in, refresh, log out; `/auth/me` returns only their subdivisions; may `switch-context` among those. |
| [[admin]] | Same as member; admin capability is a per-subdivision membership `Role`, not an auth distinction. |
| [[superadmin]] | `/auth/me` returns the full org/subdivision tree; may `switch-context` into any org/subdivision (403/404 semantics avoid existence leaks). |
| [[sqladmin-operator]] | **Not part of this plane** — the operator login is env/bcrypt/session-cookie and has no row in `users` (see [[LCOS-F3-sqladmin-operator]]). |

## Involved entities

- [[users]] — global identity; `password_hash` (argon2, nullable for external providers), `is_superadmin`, `is_active`.
- [[memberships]] — user ↔ subdivision + `Role`; drives what `/auth/me` returns and what `switch-context` authorizes.
- [[refresh_sessions]] — stores only `token_hash` (SHA-256), `family_id` (rotation/reuse-detection), `active_subdivision_id` (context restore, `SET NULL`), `expires_at`, `last_used_at`, `revoked`.
- [[subdivisions]] / [[organizations]] — the scope embedded into the access-JWT claims (`org`, `sub_div`).

## Dependencies / links

- **Requirements:** [[auth]] (JWT access + opaque refresh, rotation, reuse-detection), [[fail-closed]] (generic 401, family revoke on reuse, live-refresh required for switch), [[global-requirements]] (R3).
- **Features:** produces the scope consumed by [[LCOS-F1-multitenancy]]; distinct plane from [[LCOS-F3-sqladmin-operator]]; consumed client-side by [[LCOS-F7-frontend-platform]] (AuthGuard, `backendRequest`).
- **ADR:** [[ADR-007]] (two independent auth planes, never mixed).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `POST /auth/login` with valid creds sets HttpOnly `lcos_access` (JWT, 15 min) + `lcos_refresh` (opaque); a protected endpoint returns 401 without a valid access cookie.
- [ ] AC-BE-2. Access-JWT is HS256-signed with `jwt_secret`, payload `{sub, is_superadmin, org, sub_div, role, type, iat, exp}`; authorization is resolved statelessly from it.
- [ ] AC-BE-3. Refresh token is opaque `token_urlsafe(48)`; only its SHA-256 hash is stored; TTL 30 min sliding.
- [ ] AC-BE-4. `POST /auth/refresh` rotates within `family_id`; reuse of a **revoked** token revokes the whole `family_id` and returns 401 (merge-gated reuse-detection test).
- [ ] AC-BE-5. `POST /auth/login` with bad creds → generic 401 that does not disclose which field was wrong; passwords never logged.
- [ ] AC-BE-6. `POST /auth/logout` revokes the current refresh row and clears cookies (204).
- [ ] AC-BE-7. `GET /auth/me` returns only the caller's subdivisions for a regular user and the full tree for a superadmin.
- [ ] AC-BE-8. `POST /auth/switch-context` returns 403 without access, 404 only for superadmin, requires a live refresh session, and reissues only the access cookie.
- [ ] AC-BE-9. `users.password_hash` is produced/verified with argon2 (`app/auth/password.py`), distinct from the operator's bcrypt path (V-b).

### Frontend
- [ ] AC-FE-1. No tokens live in JS; `backendRequest` sends `credentials:'include'` (HttpOnly cookies only).
- [ ] AC-FE-2. On a 401 (except `/auth/refresh` and `/auth/login`) the transport POSTs `/auth/refresh` **once** and replays the original request; a genuine failure lands the user on `/login`.
- [ ] AC-FE-3. `AuthGuard` gates all non-public routes via `useMeQuery()` — loading → spinner, error → redirect to `/login`.
- [ ] AC-FE-4. The login screen shows a single generic "invalid login or password" message on failure.

## Open questions / gates

- Access-token revocation is **not instant** (non-goal) — mitigated by the 15-min TTL + refresh revocation.
- No rate-limiting on `/auth/login` was observed (Conformance DEFER; prod checklist R-Deploy).
- CSRF double-submit is supported server-side but **off by default** and the FE sends no `X-CSRF-Token`; enabling `csrf_enabled` in prod requires wiring `backendRequest.ts` first ([[LCOS-F66-prod-hardening]]).

## Sources

- `APP_OVERVIEW.md §4` (two auth planes, roles).
- `01_ARCHITECTURE.md` — "Auth & multi-tenancy" (JWT access + refresh flow, tenant scoping, seeded accounts).
- `LCOS_Conformance_Alignment_GlobalRequirements.md` R3 / Part 4 (auth test scenarios).
- `mvp.be/app/auth/router.py:29` (`login`), `:46` (`refresh`), `:51` (`me`), `:56` (`switch_context`).
- `mvp.be/app/auth/tokens.py:37` (`create_access_token`), `:72` (`generate_refresh_token`), `:76` (`hash_refresh_token`).
- `mvp.be/app/auth/dependencies.py:32` (`get_current_context`, 401).
- `mvp.fe/src/entities/auth` (authApi me/login/logout/switchContext), `src/shared/api/backendRequest.ts` (refresh-once-on-401).
