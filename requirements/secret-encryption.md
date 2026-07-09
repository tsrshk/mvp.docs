---
id: REQ-SECRET-ENCRYPTION
type: requirement
title: Secret encryption at-rest (Fernet envelope, versioned KEK)
status: built
scope: cross-cutting
roles: [superadmin, sqladmin-operator]
entities: ["[[integration_credentials]]"]
adrs: ["[[ADR-010]]", "[[ADR-011]]", "[[ADR-005]]"]
requirements: ["[[config-secrets]]", "[[fail-closed]]", "[[global-requirements]]"]
legacy_refs: [Conformance R2/R6, config-arch-review enc:v2]
sources: [01_ARCHITECTURE.md "Encryption scheme (enc:v2)", APP_OVERVIEW.md §5, LCOS_Conformance R2]
updated: 2026-07-09
---

# REQ-SECRET-ENCRYPTION · Secret encryption at-rest

**Type:** cross-cutting SSOT · **Status:** built (caveat A1 — the plaintext fallback of `encrypt()`). Envelope encryption of secrets in [[integration_credentials]]; the store/resolution — in [[config-secrets]].

## Normative statement

- **N1. Storage format** (`app/core/secrets.py`): secrets are Fernet ciphertext (AES-128-CBC + HMAC). The KEK is only in `.env`, never in the DB — a DB dump without `.env` is useless.
  - `enc:v2:<key_id>:<token>` — the **current** format; `key_id` records which key encrypted (for rotation).
  - `enc:v1:<token>` — legacy (no key_id); decrypted by trying the whole keyring.
  - no prefix → plaintext/passthrough (dev fallback / unencrypted legacy).
- **N2. `encrypt(value)`** — encrypts with the primary key → `enc:v2:<kid>:...`; idempotent (skips already-`enc:*`). **Target (R2.2/A1):** with an empty keyring it **must** fail with `RuntimeError`, not write plaintext.
- **N3. `decrypt(value)`** — passthrough without an `enc:` prefix; `enc:v2` — the exact key by `key_id` with a fallback to the keyring; `enc:v1` — trying the keyring. **Ciphertext with an empty keyring → `RuntimeError`** (explicitly, not silent garbage).
- **N4. Keyring** (`Settings.secrets_keyring`): `SECRETS_ENC_KEY` = primary (encrypts everything new), stamped `SECRETS_ENC_KEY_ID` (default `"v1"`); `SECRETS_ENC_KEYS_OLD` = retired keys, decrypt-only, format `"kid1:key1,kid2:key2"`. Keyring order: primary → retired. `_keyring()` is `@lru_cache`d (`cache_clear()` in tests/rotation).
- **N5. Rotation:** promote a new KEK into `SECRETS_ENC_KEY` with a new `SECRETS_ENC_KEY_ID`, move the old one → into `SECRETS_ENC_KEYS_OLD`. New records get the new key_id; old ciphertexts remain readable.
- **N6. `validate_keyring()`** — eager startup validation; a malformed Fernet key → `RuntimeError` immediately (see [[fail-closed]] N7).
- **N7. Writing/reading a secret via SQLAdmin** ([[sqladmin-operator]]): `IntegrationCredentialAdmin.on_model_change` takes plaintext → `encrypt()` before persist (idempotent) → `rotated_at` → deactivation of other active rows of the same (scope,provider,org,subdivision). List/detail — last-4 mask (`_cred_last4`). The field is write-only plaintext, read-masked. No endpoint/view returns a decrypted secret to the outside.
- **N8. Redaction in logs** (`core/logging.py::redact()`): fully masks `admin_password_hash`, `session_secret`, `jwt_secret`, `secrets_enc_key(_old)`, the password in `database_url`. AI keys/POS tokens do not live in `Settings` → do not leak through a config snapshot.

## Rationale

Cleartext secrets in the DB = a leak on dump. A Fernet envelope with the KEK in env separates the data from the key. Versioning the key_id (`enc:v2`) allows KEK rotation without losing old ciphertexts (the old key moves to decrypt-only). An idempotent `encrypt()` makes a repeated save in SQLAdmin safe. Fail-closed on an empty keyring does not allow silently returning/saving garbage.

## Failure modes

- **Empty keyring + ciphertext** → `RuntimeError` (decrypt) — not silent garbage.
- **A malformed KEK** → `RuntimeError` at startup (`validate_keyring`).
- **Caveat (BACKLOG A1):** `encrypt()` with an empty keyring currently logs a warning and writes **plaintext** (a deliberate dev fallback) — it contradicts fail-closed; with `SECRETS_ENC_KEY` unset locally the secrets will be stored openly. Action: `encrypt()`→`RuntimeError`, the startup guard requires a non-empty `SECRETS_ENC_KEY` always (or guarantee a dev KEK in `lcos.env.example`). See [[fail-closed]] R8.4.
- **No `enc:v6.2` confusion:** the prefix scheme makes migration/repeat idempotent; unencrypted legacy is read as passthrough.

## Relations

- ADR: [[ADR-010]] (Fernet envelope, versioned KEK), [[ADR-011]] (no-cache reads — rotation is instant), [[ADR-005]] (three levels).
- Entities: [[integration_credentials]] (`encrypted_value`, `rotated_at`, partial-unique active).
- Requirements: [[config-secrets]] (store/resolution), [[fail-closed]] R8.4, [[global-requirements]] R2.

## Referenced by

`LCOS-F4` (Three-level config & secret encryption), `LCOS-F23` (Fail-closed encryption ALIGN-01), `LCOS-F3` (SQLAdmin operator plane), any consumer of a POS/AI token.

## Sources

- 01_ARCHITECTURE.md → "Encryption scheme (envelope encryption with KEK versioning, enc:v2)", "How secrets reach providers at runtime", "Secret redaction in logs".
- APP_OVERVIEW.md §5; LCOS_Conformance R2, A1.
- Code: `app/core/secrets.py`, `app/core/logging.py::redact`, `app/admin/setup.py`.
