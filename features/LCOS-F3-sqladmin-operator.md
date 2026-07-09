---
id: LCOS-F3
type: feature
title: SQLAdmin operator plane + config API
epic: "[[LCOS-E1-platform]]"
status: built
phase: "Phase 1"
roles: [sqladmin-operator, superadmin]
entities: ["[[system_settings]]", "[[integration_credentials]]", "[[users]]", "[[memberships]]", "[[organizations]]", "[[subdivisions]]", "[[refresh_sessions]]"]
requirements: ["[[config-secrets]]", "[[secret-encryption]]", "[[auth]]", "[[global-requirements]]"]
adrs: ["[[ADR-007]]", "[[ADR-005]]"]
legacy_refs: [LCOS_Conformance R4, APP_OVERVIEW §3 §4]
sources: ["APP_OVERVIEW.md §3 §4", "01_ARCHITECTURE.md (Admin panel, Keys/Secrets)", "LCOS_Conformance_Alignment_GlobalRequirements.md R4", "mvp.be app/admin/setup.py", "mvp.be app/core/security.py", "mvp.be app/api/v1/routes/admin_system.py:41"]
updated: 2026-07-09
---
# LCOS-F3 · SQLAdmin operator plane + config API
**Epic:** [[LCOS-E1-platform]] · **Status:** built · **Phase:** Phase 1

## Description

The **operator/superadmin control plane**: the SQLAdmin panel mounted at `/admin` plus the superadmin config API under `/api/v1/admin/*`. It is the second of the two separate auth mechanisms — a single dev/operator "backdoor" driven by env vars `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` (**bcrypt**), session-cookie based (`SessionMiddleware`, `session_secret`). Crucially it has **no row in `users`** and must never be mixed with the application-auth plane ([[LCOS-F2-app-auth]], which uses argon2 + JWT).

Through SQLAdmin ModelViews an operator edits the whole platform state that isn't code: `Organization`, `Subdivision`, `User`, `Membership`, `Supplier`, `Invoice`, `InvoiceLine`, `SystemSetting`, `IntegrationCredential`, and a read-only `RefreshSession` view. Two ModelViews carry security logic: `UserAdmin.on_model_change` accepts **plaintext** in the `password_hash` field and argon2-hashes it on save (this is how operators create real app users), and `IntegrationCredentialAdmin.on_model_change` **encrypts before persist**, masks the value to last-4 on read, and enforces the single-active-credential invariant (see [[LCOS-F4-config-secrets]]).

The config API (`routes/admin_system.py`) exposes runtime knobs to a superadmin without a redeploy: `GET /admin/status`, `POST /admin/ai-vpn` (flip the fail-closed VPN toggle), and `GET /admin/modules` (module gate state — see [[LCOS-F6-module-gates]]). Changing `system_settings` here takes effect at runtime because the resolver reads the DB on demand ([[config-secrets]]).

## Capabilities

- SQLAdmin panel at `/admin`; `AdminAuth` form login checks `authenticate_admin` (`username == settings.admin_username`, bcrypt-verify `admin_password_hash`), stores `admin_authenticated=True` in the Starlette session.
- ModelViews for all structural/operational/config tables; `RefreshSessionAdmin` is read-only (inspection only).
- `UserAdmin.on_model_change`: plaintext `password_hash` field → argon2 on save (skips if already `$argon2`) — operators create/reset real users.
- `IntegrationCredentialAdmin.on_model_change`: plaintext in → `encrypt()` before persist (idempotent) → set `rotated_at` → deactivate other active rows of the same (scope, provider, org, subdivision); lists/detail mask to last-4; field is write-only plaintext, read-masked.
- `SystemSettingAdmin`: keys chosen from the whitelist (`SETTING_TYPES` dropdown), not free-typed; edits change runtime behavior without redeploy.
- Config API: `GET /admin/status`, `POST /admin/ai-vpn`, `GET /admin/modules` (superadmin-gated via `require_admin`).
- No endpoint or view ever returns a decrypted secret outside the process.

## Access by role

| Role | What they can do |
|---|---|
| [[sqladmin-operator]] | Log in to `/admin` with env creds (bcrypt); CRUD all ModelViews; create app users (plaintext→argon2); set/rotate secrets (plaintext→encrypted, masked). Has **no `users` row**. |
| [[superadmin]] | The app-plane god-mode counterpart; drives runtime config through the config API (`/admin/status`, `/admin/ai-vpn`, `/admin/modules`) and OCR-prompt/`ai_provider` changes. |
| [[admin]] | Not in this plane, except the tenant-scoped POS-config write (`PUT /organizations/{id}/pos-config`) documented in [[LCOS-F4-config-secrets]]. |
| [[member]] | No access. |

The two planes must never authenticate each other: `admin`/`admin` (env) is the SQLAdmin operator and is intentionally **not** seeded into `users`; `iter` is the seeded app superadmin.

## Involved entities

- [[system_settings]] — non-secret runtime KV edited via `SystemSettingAdmin`; whitelisted keys only.
- [[integration_credentials]] — all integration secrets; `IntegrationCredentialAdmin` encrypts/masks/enforces single-active.
- [[users]] / [[memberships]] — operators create users and assign subdivision memberships.
- [[organizations]] / [[subdivisions]] — the tenant structure is authored here.
- [[refresh_sessions]] — read-only inspection view.

## Dependencies / links

- **Requirements:** [[config-secrets]] (runtime settings + secrets tiers this plane edits), [[secret-encryption]] (encrypt-before-persist, mask-on-read), [[auth]] (operator plane separation), [[global-requirements]] (R4).
- **Features:** distinct plane from [[LCOS-F2-app-auth]]; the secret/settings storage semantics live in [[LCOS-F4-config-secrets]]; module toggles surface via [[LCOS-F6-module-gates]]; structure it edits is isolated by [[LCOS-F1-multitenancy]].
- **ADR:** [[ADR-007]] (two auth planes), [[ADR-005]] (three-level config the operator drives).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `/admin` login uses `ADMIN_USERNAME` + bcrypt `ADMIN_PASSWORD_HASH` from env with a session cookie; the operator has no row in `users` and cannot authenticate as an app user (or vice-versa).
- [ ] AC-BE-2. `UserAdmin.on_model_change` argon2-hashes a plaintext `password_hash` on save (skips if already `$argon2`).
- [ ] AC-BE-3. `IntegrationCredentialAdmin.on_model_change` encrypts plaintext before persist, sets `rotated_at`, and deactivates other active rows of the same (scope, provider, org, subdivision).
- [ ] AC-BE-4. Credential lists/detail views mask the value to last-4; no view or endpoint returns plaintext.
- [ ] AC-BE-5. `SystemSettingAdmin` restricts keys to the registry whitelist; a change is observed at runtime with no redeploy (resolver reads DB on demand).
- [ ] AC-BE-6. `RefreshSessionAdmin` is read-only.
- [ ] AC-BE-7. Config API `GET /admin/status`, `POST /admin/ai-vpn`, `GET /admin/modules` are gated to superadmin/operator (`require_admin`) and reject unauthenticated callers.

### Other (infra / config)
- [ ] AC-OTHER-1. Config lives in `lcos.env` (bind-mounted read-only as `/app/.env`), not `./.env`, so the bcrypt `$`-laden `ADMIN_PASSWORD_HASH` is not corrupted by compose interpolation.
- [ ] AC-OTHER-2. `SessionMiddleware` shares `session_secret` with SQLAdmin; startup refuses weak/default `SESSION_SECRET`.

## Open questions / gates

- The SQLAdmin panel is an operator/dev surface, not a Phase-1 end-user product; a richer superadmin UI is future work.
- Whether org-admin (not just superadmin) should keep the POS-config write is a Phase-1 confirm item (Conformance D-h) — resolved in [[LCOS-F4-config-secrets]].
- `wtforms>=3.1,<3.2` is pinned (3.2 breaks SQLAdmin's boolean widget) — a known infra constraint.

## Sources

- `APP_OVERVIEW.md §3` (routes incl. `admin_system`), `§4` (two auth planes, seeded accounts).
- `01_ARCHITECTURE.md` — "Admin panel (SQLAdmin)", "Keys, Secrets & Credential Management" (write path).
- `LCOS_Conformance_Alignment_GlobalRequirements.md` R4 / Part 4 (superadmin test scenarios).
- `mvp.be/app/admin/setup.py:45+` (ModelViews; `UserAdmin`/`IntegrationCredentialAdmin`/`SystemSettingAdmin` `on_model_change`; `RefreshSessionAdmin` read-only).
- `mvp.be/app/core/security.py` (`AdminAuth`, `authenticate_admin`, bcrypt).
- `mvp.be/app/api/v1/routes/admin_system.py:41` (`system_status`), `:60` (`set_ai_vpn`), `:68` (`list_modules`), `:21` (`require_admin`).
