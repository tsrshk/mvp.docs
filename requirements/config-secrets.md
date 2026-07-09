---
id: REQ-CONFIG-SECRETS
type: requirement
title: Three-level separation of configuration and secrets (no env fallback)
status: built
scope: cross-cutting
roles: [superadmin, admin, sqladmin-operator]
entities: ["[[system_settings]]", "[[integration_credentials]]"]
adrs: ["[[ADR-005]]", "[[ADR-011]]", "[[ADR-012]]"]
requirements: ["[[secret-encryption]]", "[[fail-closed]]", "[[global-requirements]]"]
legacy_refs: [Conformance R1/R6, config-arch-review]
sources: [01_ARCHITECTURE.md "Keys, Secrets & Credential Management", APP_OVERVIEW.md §5, LCOS_Conformance R1/R6]
updated: 2026-07-09
---

# REQ-CONFIG-SECRETS · Three levels of configuration and secrets

**Type:** cross-cutting SSOT · **Status:** built. A central architectural theme: **one source of truth per value, with no env fallback** for runtime settings and secrets. Secret encryption is factored out into [[secret-encryption]].

## Normative statement

Three stores, each with its own owner and resolution rule:

- **N1. Level 1 — `.env` (via `Settings`/pydantic-settings) — the ONLY reader of the environment.** Contains only: DB connection, KEK (`SECRETS_ENC_KEY`+`_KEY_ID`+`_KEYS_OLD`), `JWT_SECRET`, `SESSION_SECRET`, `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`, the static `ERP_PROVIDER`, provider URLs, cookie flags, ports, the declarative gluetun VPN config.
- **N2. Level 2 — [[system_settings]] (DB, KV + whitelist `REGISTRY`)** — non-secret runtime settings: `ai_provider`, models (`anthropic_model`/`gemini_model`), `ai_vpn_enabled`, `module_*`, `erp_write_enabled`. Resolution is strictly **DB(validated) → registry default**. Keys are chosen from `SettingSpec`, not freely entered. No secrets here (invariant).
- **N3. Level 3 — [[integration_credentials]] (DB, Fernet)** — **all** integration secrets (AI keys, POS/ERP tokens). Resolution **active row → decrypt → otherwise None**.
- **N4. No value from N2/N3 is read from env** — "NO ENV FALLBACK" in `effective_config.py`/`credentials.py`. Verifiable by grep: absence of env keys for these values.
- **N5. Resolver (`core/effective_config.py`):** `resolve(session, key) → Resolved(value, source, valid)`; an invalid DB value → warning + `spec.default` (never lets garbage through). Precedence **strictly DB → registry default**, no env. There is `resolve_with_context()` — it opens its own session via the [[provider-abstraction]] `ProviderContext`.
- **N6. Secrets are read without a cache** (`get_active_credential` decrypts on every call) — rotation in SQLAdmin is instant ([[ADR-011]]).
- **N7. Write planes:** level 2/3 is edited **only** by the superadmin via SQLAdmin ([[sqladmin-operator]]); the exception is the POS token: an org-admin can set it via `PUT /organizations/{id}/pos-config` (write-only, response `{is_set,last4}`). The front-end stores no secrets ([[ADR-012]]): `VITE_*` are only non-secret toggles.

## Rationale

Secrets in env require a redeploy to rotate a key and leak into dumps/config snapshots. Moving AI keys, the POS token, provider choice, models and all `MODULE_*`/`ERP_WRITE`/`AI_VPN` toggles into the DB gives runtime control from the super-admin panel without a redeploy, while `.env` keeps only the boot/trust-root. The absence of an env fallback guarantees a single source per value — otherwise a "silent second source" makes behavior nondeterministic.

## Failure modes

- **An invalid DB setting value** → warning + registry default (no garbage at runtime).
- **Absence of an active secret** → `None` → fail-closed at the consumer level (AI → `AiUnavailableError`; POS → Esupl 401; see [[fail-closed]]).
- **An attempt to put a secret into `system_settings`** — prohibited by convention/comment; secrets live only in `integration_credentials`.
- **Debt:** `encrypt()` writes plaintext with an empty keyring (BACKLOG A1) — the operational path when `SECRETS_ENC_KEY` is unset locally; to be eliminated (see [[secret-encryption]] R2.2, [[fail-closed]] R8.4).

## Relations

- ADR: [[ADR-005]] (three levels), [[ADR-011]] (no cache), [[ADR-012]] (front-end without secrets), [[ADR-010]] (encryption — in [[secret-encryption]]).
- Entities: [[system_settings]], [[integration_credentials]].
- Requirements: [[secret-encryption]], [[fail-closed]], [[global-requirements]] R1/R6.

## Referenced by

`LCOS-F3` (SQLAdmin operator plane + config API), `LCOS-F4` (Three-level config & secret encryption), `LCOS-F5` (provider seams), any feature reading a setting/secret (OCR, ERP-write, VPN).

## Sources

- 01_ARCHITECTURE.md → "Keys, Secrets & Credential Management", "Resolution order (the definitive table)", "Typed registry + resolver".
- APP_OVERVIEW.md §5, §3; LCOS_Conformance R1, R6.
- Code: `app/core/{config,system_settings,effective_config,credentials}.py`.
