---
id: LCOS-F4
type: feature
title: Three-level config & secret encryption
epic: "[[LCOS-E1-platform]]"
status: built
phase: "Phase 1"
roles: [superadmin, sqladmin-operator, admin]
entities: ["[[system_settings]]", "[[integration_credentials]]", "[[organizations]]"]
requirements: ["[[config-secrets]]", "[[secret-encryption]]", "[[fail-closed]]", "[[global-requirements]]"]
adrs: ["[[ADR-005]]", "[[ADR-010]]", "[[ADR-011]]"]
legacy_refs: [plan/00 G3, LCOS_Conformance R1 R2 R6, APP_OVERVIEW §5]
sources: ["APP_OVERVIEW.md §5", "01_ARCHITECTURE.md (Keys/Secrets, config resolver)", "LCOS_Conformance_Alignment_GlobalRequirements.md R1 R2 R6", "mvp.be app/core/config.py", "mvp.be app/core/system_settings.py:46", "mvp.be app/core/effective_config.py", "mvp.be app/core/secrets.py:78", "mvp.be app/core/credentials.py", "mvp.be app/api/v1/routes/organizations.py:52"]
updated: 2026-07-09
---
# LCOS-F4 · Three-level config & secret encryption
**Epic:** [[LCOS-E1-platform]] · **Status:** built · **Phase:** Phase 1

## Description

The deliberate **three-tier configuration/secret split**, the single most important architectural theme of the system. Every value lives in exactly one tier, with a distinct owner and precedence, and tiers 2–3 have **no env fallback**:

1. **Deploy config** — `.env` → `Settings` (pydantic-settings), the *only* env reader: DB connection, KEK, `JWT_SECRET`/`SESSION_SECRET`, `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`, static `ERP_PROVIDER`, provider URLs, cookie flags, gluetun VPN config.
2. **Runtime non-secret settings** — `system_settings` (DB KV + whitelist `REGISTRY`): `ai_provider`, model names, `ai_vpn_enabled`, `module_*`, `erp_write_enabled`. Resolution is strictly **DB (validated) → registry default**, never env.
3. **Integration secrets** — `integration_credentials` (DB, Fernet-encrypted): AI API keys, per-org Esupl POS token. Resolution is **active row → decrypt → else None**, never env, **read with no cache** so admin rotation is instant.

Secrets are encrypted at rest with **Fernet** under an envelope scheme with **KEK versioning** (`enc:v2:<key_id>:<token>`), so a DB dump alone is useless and keys can rotate without losing old ciphertexts. A typed **registry + resolver** pair governs non-secret settings: `core/system_settings.py` holds the frozen `SettingSpec` whitelist (SSOT of keys/types/defaults), `core/effective_config.py` coerces the DB value and falls back to the spec default on garbage (never propagates an invalid value). The guiding rule: AI keys, POS tokens, provider/model choice and all `MODULE_*`/`ERP_WRITE`/`AI_VPN` toggles are **not in `.env`** — they live only in the DB.

## Capabilities

- **Tier 1 (`Settings`):** the only env reader; holds static deploy config + master signing/encryption keys; secrets redacted from any settings snapshot (`redact()`).
- **Tier 2 (`system_settings`):** whitelisted typed `SettingSpec` registry (`TYPE_BOOL`/`TYPE_ENUM`/`TYPE_STR` + hardcoded defaults); resolver `resolve/resolve_bool/resolve_all/resolve_with_context` → DB (validated) → registry default, **no env**.
- **Tier 3 (`integration_credentials`):** single SSOT secret table; `get_active_credential` reads + decrypts on every call (no cache); missing → None (fail-closed).
- **Fernet envelope + KEK versioning:** `enc:v2:<key_id>:<token>` current, `enc:v1:<token>` legacy; keyring = primary (`SECRETS_ENC_KEY`+`_KEY_ID`) + retired decrypt-only (`SECRETS_ENC_KEYS_OLD`); rotation promotes a new key while old ciphertexts stay readable.
- `validate_keyring()` at startup; malformed KEK → immediate `RuntimeError`.
- **Fail-closed encryption edges:** ciphertext present but keyring empty → `RuntimeError` (never silent garbage); startup guard requires `SECRETS_ENC_KEY` outside `APP_ENV=local`. (Conformance ALIGN A1 tightens `encrypt()` on empty keyring → error rather than plaintext — see [[LCOS-F23-failclosed-encryption]].)
- Single-active-credential invariant per (scope, provider, org, subdivision) via partial unique index `uq_credentials_active_per_scope` + deactivation on write.
- **Two secret write paths:** SQLAdmin (`IntegrationCredentialAdmin`, [[LCOS-F3-sqladmin-operator]]) and the tenant-scoped `PUT /organizations/{id}/pos-config` (superadmin OR org-admin); both write-only plaintext, response only `{is_set, last4}`.

## Access by role

| Role | What they can do |
|---|---|
| [[superadmin]] | Set/rotate all secrets and edit any runtime setting via SQLAdmin/config API; set an org's POS token via `PUT /organizations/{id}/pos-config`. |
| [[sqladmin-operator]] | Same secret/settings authoring through SQLAdmin ModelViews (encrypt-before-persist, mask-on-read). |
| [[admin]] | Tenant-scoped only: `PUT /organizations/{id}/pos-config` for their own org (Esupl `team_id` + write-only token). |
| [[member]] | No config access; reads never see plaintext (only `is_set`/`last4`). |

## Involved entities

- [[system_settings]] — tier-2 non-secret KV; whitelisted keys; superadmin-managed; **no secrets stored here** (by convention/comment).
- [[integration_credentials]] — tier-3 SSOT for all secrets; `scope` (`platform`/`org`/`subdivision`), `provider` (`anthropic`/`gemini`/`esupl`), `encrypted_value` (Fernet), `is_active`, `rotated_at`, partial-unique single-active index.
- [[organizations]] — holds non-secret `esupl_team_id`; the per-org POS **token** is a secret in `integration_credentials`, not here.

## Dependencies / links

- **Requirements:** [[config-secrets]] (three tiers, no env fallback for 2–3), [[secret-encryption]] (Fernet envelope, KEK versioning/rotation, no-cache reads), [[fail-closed]] (missing key/token → error, empty-keyring → RuntimeError), [[global-requirements]] (R1/R2/R6).
- **Features:** authored via [[LCOS-F3-sqladmin-operator]]; consumed by [[LCOS-F5-provider-seams]] (AI key/provider) and [[LCOS-F10-invoice-status-machine]] (POS token); toggles read by [[LCOS-F6-module-gates]]; the encryption fail-closed tightening is [[LCOS-F23-failclosed-encryption]].
- **ADR:** [[ADR-005]] (three-level config), [[ADR-010]] (KEK versioning + rotation), [[ADR-011]] (no-cache secret reads → instant rotation).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `Settings` (pydantic-settings) is the only env reader; no value from `system_settings`/`integration_credentials` is ever read from env (grep + Part-4 invariant test).
- [ ] AC-BE-2. `system_settings` resolves strictly DB (validated) → registry default; an invalid DB value logs a warning and falls back to the spec default (never propagated).
- [ ] AC-BE-3. `get_active_credential` reads + decrypts on **every** call (no cache); a rotated secret takes effect on the next call.
- [ ] AC-BE-4. Secrets persist as `enc:v2:<key_id>:<token>`; `encrypt()` is idempotent (skips already-`enc:*`); `decrypt()` selects by `key_id` with ring fallback.
- [ ] AC-BE-5. Ciphertext present with an empty keyring → `RuntimeError` (not silent garbage); `validate_keyring()` runs at startup and rejects a malformed KEK.
- [ ] AC-BE-6. Startup guard refuses to boot on empty/default `SESSION_SECRET`/`JWT_SECRET` and requires `SECRETS_ENC_KEY` outside `APP_ENV=local`.
- [ ] AC-BE-7. Single-active invariant: writing a secret deactivates other active rows of the same (scope, provider, org, subdivision); enforced by the partial unique index.
- [ ] AC-BE-8. `GET/PUT /organizations/{id}/pos-config`: `_authorize` requires superadmin OR admin of that org; token is write-only; response is `{esupl_team_id, esupl_api_token:{is_set,last4}}` — never plaintext.
- [ ] AC-BE-9. `redact()` masks `admin_password_hash`, `session_secret`, `jwt_secret`, `secrets_enc_key(_old)`, and the password in `database_url` from logs.

## Open questions / gates

- **ALIGN-01 (open):** `encrypt()` currently writes plaintext on an empty keyring (a "dev fallback") — Conformance A1 requires it to raise instead; tracked as [[LCOS-F23-failclosed-encryption]].
- **D-c:** `CredentialScope.subdivision` is declared but unused — recommendation is to drop it unless a Phase-2 per-subdivision POS token is planned.
- **D-h (confirm):** org-admin (not only superadmin) can set the POS token via `pos-config` — accepted for Phase 1 (tenant-scoped, harmless in single-tenant); confirm before SaaS.
- Prod hardening (real KEK/JWT/session, `COOKIE_SECURE=true`) is env-comment guidance today ([[LCOS-F66-prod-hardening]]).

## Sources

- `APP_OVERVIEW.md §5` (three config tiers, Fernet envelope, fail-closed, no-cache).
- `01_ARCHITECTURE.md` — "Keys, Secrets & Credential Management" (resolution table, encryption scheme, registry+resolver, write paths).
- `LCOS_Conformance_Alignment_GlobalRequirements.md` R1/R2/R6 + Part 2 A1.
- `mvp.be/app/core/config.py` (`Settings`, only env reader).
- `mvp.be/app/core/system_settings.py:46` (`REGISTRY`/`SettingSpec`), `mvp.be/app/core/effective_config.py` (`resolve`, DB→default, no env).
- `mvp.be/app/core/secrets.py:78` (`encrypt`), `:100` (`decrypt`), `:64` (`validate_keyring`), `:31` (`enc:v2` prefix).
- `mvp.be/app/core/credentials.py` (`get_active_credential`, no cache).
- `mvp.be/app/api/v1/routes/organizations.py:52` (`pos-config` GET/PUT, `_authorize`, `_token_state`).
