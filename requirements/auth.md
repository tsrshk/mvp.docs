---
id: REQ-AUTH
type: requirement
title: Application authentication (JWT access + opaque refresh)
status: built
scope: cross-cutting
roles: [member, admin, superadmin]
entities: ["[[users]]", "[[refresh_sessions]]", "[[memberships]]"]
adrs: ["[[ADR-007]]"]
requirements: ["[[multitenancy]]", "[[global-requirements]]"]
legacy_refs: [Conformance R3, CLAUDE.md §11]
sources: [01_ARCHITECTURE.md "Auth & multi-tenancy", APP_OVERVIEW.md §4, LCOS_Conformance R3, app/auth/*]
updated: 2026-07-09
---

# REQ-AUTH · Application authentication

**Type:** cross-cutting SSOT · **Status:** built · app-JWT plane (do not confuse with [[sqladmin-operator]], see [[config-secrets]] R4).

This document is the single source on application authentication. Features link here rather than restating it.

## Normative statement

- **N1. Access token** — a signed JWT (PyJWT, HS256, `settings.jwt_secret`), TTL **15 min**, in the HttpOnly cookie `lcos_access`. Payload: `{sub, is_superadmin, org, sub_div, role, type:"access", iat, exp}`. Authorization of every request is derived from the signed token **stateless** (without a DB round-trip) via `decode_access_token → AccessClaims`.
- **N2. Refresh token** — an **opaque** random string (`secrets.token_urlsafe(48)`), NOT a JWT. Stored **only as a SHA-256 hash** (`refresh_sessions.token_hash`). TTL **30 min sliding** (`expires_at` moves +30 min on each rotation), in the HttpOnly cookie `lcos_refresh`, carries `family_id`.
- **N3. `POST /auth/login`** — `PasswordAuthProvider.authenticate` (argon2, see N8) → compute the default context → issue a new `refresh_sessions` with a fresh `family_id`, both cookies. Wrong credentials → **generic 401**, the reason is not disclosed.
- **N4. `POST /auth/refresh`** — lookup by hash: not found → 401; expired → 401; **`revoked` → reuse-detected: revoke the entire `family_id` (`revoke_family`) + 401**; otherwise rotation within the same `family_id` (the old row is marked revoked, a new one is inserted), the context is restored from `active_subdivision_id`, a new access is reissued.
- **N5. `POST /auth/logout`** — revoke the current refresh row, clear cookies, 204.
- **N6. `GET /auth/me`** — the **single source** of the FE sidebar and active scope: `{user, active_context, organizations}`. A regular user sees only their subdivisions; a superadmin — the whole org/subdivision tree.
- **N7. `POST /auth/switch-context`** — authorization via `_role_for` (403 without access; 404 reachable only by the superadmin — does not disclose existence); requires a **live** (non-revoked, non-expired) refresh (otherwise 401, fail-closed); updates `refresh_sessions.active_subdivision_id`, reissues **only** the access cookie.
- **N8. User passwords** — **argon2** (`app/auth/password.py`), separate from the bcrypt SQLAdmin operator. The hash/verify paths are not mixed up (V-b). Passwords are not logged.

## Rationale

Stateless access + a short TTL gives cheap authorization without a per-request DB lookup; server-side refresh state (hash + `family_id`) provides revocation and **reuse detection** — a stolen refresh replayed a second time brings down the whole token family. Separating access (JWT, static scope) and refresh (opaque, rotated) is standard replay protection. Restoring `active_subdivision_id` on refresh preserves the active context across sessions.

## Failure modes

- **Access revocation is not instant** (an explicit non-goal) — mitigated by the 15-min TTL + refresh revocation. A full logout of all devices requires revoking the `family_id`.
- **A user without a membership and not a superadmin** logs in but has no active context → tenant data is closed (403 from `get_tenant_context`), the FE shows "no available subdivisions". This is a correct fail-closed, not a bug (see [[multitenancy]] R5.5).
- **A weak `JWT_SECRET`/`SESSION_SECRET`** → the startup guard refuses to load (see [[fail-closed]] R8.6).
- **CSRF half-assembled** (double-submit exists, `csrf_enabled=False`, the FE does not send the token) — enabling it in prod without editing `backendRequest.ts` silently breaks mutations; deferred to the prod checklist (DEFER D-d).

## Relations

- ADR: [[ADR-007]] (two independent auth planes).
- Entities: [[users]] (global, argon2 `password_hash`), [[refresh_sessions]] (hash + `family_id` + `active_subdivision_id`), [[memberships]] (role on subdivision).
- Requirements: [[multitenancy]] (scope from the JWT), [[config-secrets]] R4 (operator plane), [[global-requirements]] R3.

## Referenced by

Auth/platform features: `LCOS-F2` (App auth), `LCOS-F1` (Multitenancy), `LCOS-F7` (FE platform, `AuthGuard`/`useMeQuery`), and everything that reads `get_tenant_context`.

## Sources

- 01_ARCHITECTURE.md → "JWT access + refresh-token flow", "Tenant scoping".
- APP_OVERVIEW.md §4; LCOS_Conformance_Alignment_GlobalRequirements.md R3, V-b.
- Code: `app/auth/{router,service,tokens,password,cookies,dependencies}.py`.
