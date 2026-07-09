---
id: REQ-GLOBAL
type: requirement
title: Global requirements of the current stage (normative, R1–R9)
status: built
scope: cross-cutting
roles: [member, admin, superadmin, sqladmin-operator]
entities: ["[[system_settings]]", "[[integration_credentials]]", "[[users]]", "[[refresh_sessions]]", "[[organizations]]", "[[subdivisions]]", "[[memberships]]"]
adrs: ["[[ADR-005]]", "[[ADR-006]]", "[[ADR-007]]", "[[ADR-008]]", "[[ADR-009]]", "[[ADR-010]]", "[[ADR-011]]", "[[ADR-012]]"]
requirements: ["[[config-secrets]]", "[[secret-encryption]]", "[[auth]]", "[[multitenancy]]", "[[provider-abstraction]]", "[[fail-closed]]", "[[vpn-egress]]", "[[erp-esupl-integration]]"]
legacy_refs: [LCOS_Conformance_Alignment_GlobalRequirements Part 3, 02_REQUIREMENTS (never-created slot)]
sources: [LCOS_Conformance_Alignment_GlobalRequirements.md Part 3, 01_ARCHITECTURE.md, APP_OVERVIEW.md]
updated: 2026-07-09
---

# REQ-GLOBAL · Global requirements of the current stage (R1–R9)

**Type:** normative contract, verifiable by test/review. **Status:** built. This fills the never-created `02_REQUIREMENTS` slot. MUST/SHALL wording. Reflects the actual model + the Part 2 Conformance decisions. Each block delegates the details to its dedicated SSOT doc — here is the **summary of normatives**, not a duplicate.

> **Trust order:** code + CLAUDE.md > DEC-0011/0013 > this doc > descriptive docs. On a conflict with the code — the code wins (see the known doc↔code corrections at the bottom).

## R1 — Configuration and secrets: three levels → [[config-secrets]]
- **R1.1** `.env` (via `Settings`/pydantic-settings) — the **only** reader of the environment. Only: DB, KEK (`SECRETS_ENC_KEY`+id+old), `JWT_SECRET`, `SESSION_SECRET`, `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`, the static `ERP_PROVIDER`, URLs, cookie flags, ports, the declarative gluetun VPN.
- **R1.2** [[system_settings]] (DB, KV + whitelist `REGISTRY`) — non-secret runtime settings (`ai_provider`, models, `ai_vpn_enabled`, `module_*`, `erp_write_enabled`). Resolution is strictly **DB(validated) → registry default**, no env.
- **R1.3** [[integration_credentials]] (DB, Fernet) — all integration secrets. Resolution **active row → decrypt → otherwise None**, no env.
- **R1.4** No R1.2/R1.3 value is read from env (test: grep + absence of env keys).

## R2 — Secret encryption at-rest → [[secret-encryption]]
- **R2.1** Secrets are Fernet ciphertext `enc:v2:<key_id>:<token>`; the KEK is only in `.env`.
- **R2.2** `encrypt()` with an empty keyring **must** fail (`RuntimeError`), not write plaintext (after A1).
- **R2.3** `decrypt()` on ciphertext with an empty keyring → `RuntimeError` (not silent garbage).
- **R2.4** Rotation: a new KEK in `SECRETS_ENC_KEY` (a new id), the old one in `SECRETS_ENC_KEYS_OLD` (decrypt-only); old ciphertexts remain readable.
- **R2.5** `validate_keyring()` at startup; an invalid KEK → refusal to load.

## R3 — App authentication → [[auth]]
- **R3.1** Access — JWT HS256 (`jwt_secret`), TTL 15 min, HttpOnly `lcos_access`, payload `{sub,is_superadmin,org,sub_div,role,type,iat,exp}`, stateless authorization.
- **R3.2** Refresh — opaque `token_urlsafe(48)`, stored **only as a SHA-256 hash**, TTL 30 min sliding, HttpOnly `lcos_refresh`, `family_id`.
- **R3.3** `POST /auth/refresh`: not found/expired → 401; **revoked → reuse-detected: revoke the entire `family_id` + 401**; otherwise rotation within the same `family_id`, context restored from `active_subdivision_id`.
- **R3.4** `POST /auth/login` — wrong credentials → generic 401.
- **R3.5** `POST /auth/logout` — revoke the current refresh, clear cookies, 204.
- **R3.6** `GET /auth/me` — the single source of the FE sidebar/scope.
- **R3.7** `POST /auth/switch-context` — authorization via `_role_for` (403 without access; 404 only for the superadmin); requires a live refresh (otherwise 401); reissues only access.
- **R3.8** User passwords — argon2 (`app/auth/password.py`).
- **R3.9** Passwords are not logged; a failed login does not disclose the reason.

## R4 — Super-admin plane (SQLAdmin) → [[sqladmin-operator]], [[config-secrets]]
- **R4.1** SQLAdmin login — a separate backend: `ADMIN_USERNAME` + bcrypt `ADMIN_PASSWORD_HASH` from env, session-cookie (`SESSION_SECRET`). **No row in [[users]].** The planes do not mix.
- **R4.2** Manages: [[system_settings]], [[integration_credentials]], [[organizations]], [[subdivisions]], [[users]], [[memberships]], the catalog. [[refresh_sessions]] — read-only.
- **R4.3** `IntegrationCredentialAdmin.on_model_change`: plaintext → `encrypt()` before persist (idempotent) → `rotated_at` → deactivation of other active rows of the same (scope,provider,org,subdivision). List/detail — last-4 mask. The field is write-only plaintext, read-masked.
- **R4.4** `UserAdmin.on_model_change`: `password_hash` accepts plaintext → argon2 (skip if already `$argon2`).
- **R4.5** No endpoint/view returns a decrypted secret to the outside.

> **Correction:** the `admin_system` routes are gated by the **SQLAdmin OPERATOR** plane, not the app-JWT superadmin (see the inventory doc↔code correction).

## R5 — Multitenancy and scoping → [[multitenancy]]
- **R5.1** Hierarchy: [[organizations]] (isolation boundary) → [[subdivisions]] (= Esupl warehouse) → [[memberships]] (user↔subdivision+role). [[users]] — the only global table.
- **R5.2** `organization_id` is denormalized onto every operational/catalog row, `ondelete=RESTRICT`; operational rows carry `subdivision_id` too.
- **R5.3** Tenant repositories **require `organization_id` in the constructor** — a query without a scope is structurally impossible.
- **R5.4** Scope from the signed access-JWT (`org`,`sub_div`), **never** from client input. `get_tenant_context` → 403 without an `organization_id`.
- **R5.5** Roles: `is_superadmin` (global flag on [[users]]) + `Role.admin` (per-subdivision). No RBAC matrix (non-goal). A user without a membership and not a superadmin logs in but the context is closed (403).
- **R5.6** FE scope from the `/auth/me` cache (the backend is authoritative); per-browser stores are keyed by `orgScopeToken()`.

## R6 — Key management → [[secret-encryption]], [[erp-esupl-integration]]
- **R6.1** AI key: `integration_credentials(scope=platform, provider=anthropic)`. active→decrypt, no env. Absence → `AiUnavailableError` (503).
- **R6.2** POS token: `integration_credentials(scope=org, provider=esupl, org_id)`. Absence → an unauthenticated call → Esupl 401. Set by the superadmin (SQLAdmin) or the org-admin (`PUT /organizations/{id}/pos-config`) — write-only, response `{is_set,last4}`.
- **R6.3** One active secret per (scope,provider,org,subdivision) — a partial-unique index + deactivation on write.
- **R6.4** Secrets are read **without a cache** — rotation is instant.
- **R6.5** `esupl_team_id`/`esupl_warehouse_id`/`ingredients.esupl_*`/`packings.esupl_packing_id` — **non-secret** ID columns; the only Esupl secret is the token.

## R7 — Provider seams → [[provider-abstraction]]
- **R7.1** `services` depend only on `providers/*/base.py` (Protocol). Direction: `api → services → providers/repositories`.
- **R7.2** ERP: one provider `esupl`, the choice is static (`ERP_PROVIDER` from env).
- **R7.3** OCR/AI: **one** implementation `claude`, the choice is runtime (`system_settings.ai_provider`). Debt DEC-01 (gemini as a second implementation + the resolver's dual role): claude-only OR the LLM behind a Protocol+registry with the invariant "OCR name ≡ ai_provider enum" under test.
- **R7.4** Cross-infra (egress, VPN toggle, session_scope) is injected via `ProviderContext` (module-global), does not leak into Protocol signatures. See [[vpn-egress]].
- **R7.5** New implementations on a seam are **not written** without an explicit trigger.

## R8 — Fail-closed — consolidated catalog → [[fail-closed]]
- **R8.1** VPN for AI: `ai_vpn_enabled` defaults to True; a dead/slow tunnel → `VpnUnavailableError` (503), **never** silent direct egress. `get_client(via_vpn=True)` without a vpn client → an error. See [[vpn-egress]].
- **R8.2** No AI key → `AiUnavailableError`. No POS token → Esupl 401. Both with no env fallback.
- **R8.3** `erp_write_enabled` defaults to False; when OFF `write_invoice` → a synthetic `esupl-prepared-<number>` without egress; the same code path when ON. See [[invoice-status-machine]].
- **R8.4** Ciphertext with an empty keyring → `RuntimeError`; `encrypt()` without a keyring → `RuntimeError` (R2.2).
- **R8.5** Settings/secrets do not fall back to env: DB→registry default or →None.
- **R8.6** Startup guard: refusal with empty/default `SESSION_SECRET`/`JWT_SECRET`; `SECRETS_ENC_KEY` required (R2.2/A1).

## R9 — SSOT and no dead code
- **R9.1** The front-end stores no secrets: auth only via HttpOnly cookies; `VITE_*` — only non-secret endpoint/provider toggles ([[ADR-012]]).
- **R9.2** Live provider paths — only `backend`/`mock`; no browser-direct LLM/ERP (after A2).
- **R9.3** No dead modules/exports without a live consumer (after A2/D-b/D-c). **Known:** `invoice_lines.sku_embedding` UNUSED → backlog DEC-02; FE `shared/llm`/`prompt.ts`/`parse.ts` — vestigial dead code.
- **R9.4** Unified error envelope `{"error":{code,message,details?}}`; the catch-all manually returns CORS headers.
- **R9.5** Logs redact secrets (`redact()`): `admin_password_hash`, `session_secret`, `jwt_secret`, `secrets_enc_key(_old)`, the password in `database_url`.

## R-Deploy — prod checklist (does not block Phase 1, recorded)
- Real `SECRETS_ENC_KEY`/`JWT_SECRET`/`SESSION_SECRET`; `COOKIE_SECURE=true`.
- `CSRF_ENABLED=true` **requires** a prior edit of `backendRequest.ts` (read/send `X-CSRF-Token`) — otherwise mutations break (D-d).
- Rate limiting on `/auth/login`. CI running the non-negotiable tests (V-a) as a merge gate. `Dockerfile.prod`/IaC for Hetzner.

## Known doc↔code corrections (baked-in, code is authoritative)
- **Supplier** matching — a blended **trigram 0.65 + token-Jaccard 0.35, min 0.4** (NOT "Jaccard≥0.5"). See [[erp-esupl-integration]] N8. (**SKU** matching on the FE fuzzy — 50% Jaccard + 50% Dice, floor 0.34 — a different function, do not confuse.)
- FE suppliers-page / supplier-selector / breadcrumbs / footer **exist**.
- `invoice_lines.sku_embedding` — **UNUSED** (dead code, backlog DEC-02).
- The `admin_system` routes are gated by the **SQLAdmin OPERATOR** plane, not the app-JWT superadmin.
- Migration chain: `0001..0009` + OCR-prompt (`1e12…`). The newest ADR — [[ADR-020]].
- Wife-Gate == Pilot-Gate ([[ADR-003]]).

## Acceptance criteria (test scenarios)
The full list — Part 4 Conformance; the key merge-blocking ones (V-a): fail-closed VPN, `ERP_WRITE_ENABLED` gating, tenant-isolation, refresh reuse-detection, `test_exact_cache_match_does_not_commit_and_creates_no_mapping`. Tests run on a real Postgres+pgvector (testcontainers), egress via `respx`.

## Sources
- LCOS_Conformance_Alignment_GlobalRequirements.md → Part 3 (R1–R9, R-Deploy), Part 4 (AC), Part 2 (A1/D-*/V-*).
- 01_ARCHITECTURE.md, APP_OVERVIEW.md (verified_against_code 2026-07-09), 04_DECISIONS.md (ADR-001..020).
