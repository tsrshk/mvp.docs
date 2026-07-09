---
id: LCOS-F23
type: feature
title: Fail-closed secret encryption (ALIGN-01)
epic: "[[LCOS-E5-stabilization]]"
status: planned
phase: "Phase 1"
roles: [superadmin, sqladmin-operator, admin]
entities: ["[[integration_credentials]]", "[[system_settings]]"]
requirements: ["[[secret-encryption]]", "[[fail-closed]]", "[[config-secrets]]"]
adrs: ["[[ADR-006]]"]
legacy_refs: [plan S1-B1, 08 F1.4, backlog ALIGN-01, Conformance A1/R2]
sources: ["plan/PHASE_S1_STABILIZATION.md §S1-B1 §AC-1/2", "08_PHASE1_SPEC.md F1.4", "LCOS_Conformance_Alignment_GlobalRequirements.md A1/R2/R8.4", "mvp.be app/core/secrets.py:78", "mvp.be app/main.py:110"]
updated: 2026-07-09
---
# LCOS-F23 · Fail-closed secret encryption (ALIGN-01)

**Epic:** [[LCOS-E5-stabilization]] · **Status:** planned · **Phase:** Phase 1

## Description

The secret-at-rest layer is Fernet-enveloped (`enc:v2:<key_id>:<token>`) with KEK versioning and rotation — it already *exceeds* the plan (`Conformance I4/R2`). But it has one principle violation: `encrypt()` silently degrades to plaintext when the keyring is empty. Because Phase 1 runs **locally**, this is an operational path, not a hypothetical one: if `SECRETS_ENC_KEY` is unset, integration secrets (AI keys, POS tokens) land in the database in the clear. `decrypt()` is already fail-closed (it raises when ciphertext is present but the keyring is missing), so the write path is the asymmetry to fix.

This feature makes `encrypt()` fail-closed and closes the startup gap. Today `app/core/secrets.py::encrypt` logs `"SECRETS_ENC_KEY not set — secret stored WITHOUT encryption"` and returns the value unchanged; and `app/main.py::_ensure_strong_secrets` only requires `SECRETS_ENC_KEY` when `app_env != "local"`. The fix: `encrypt()` raises `RuntimeError` on an empty keyring, the startup guard requires a non-empty `SECRETS_ENC_KEY` in **every** environment, and `lcos.env.example` ships a valid generated dev KEK (with a "replace in prod" note) so a fresh `docker compose up` encrypts out of the box. This satisfies the normative requirement `R2.2` / `R8.4`.

## Capabilities

- `encrypt()` refuses to store plaintext: an empty keyring raises `RuntimeError` instead of returning the value with a warning.
- Startup guard requires `SECRETS_ENC_KEY` unconditionally (the `APP_ENV=local` exemption is removed); a missing key aborts boot with a clear message.
- `lcos.env.example` contains a working dev KEK so local Phase 1 always encrypts from a clean checkout.
- Existing rotation/keyring behaviour (`enc:v2:<kid>`, `SECRETS_ENC_KEYS_OLD` decrypt-only, `validate_keyring()`) is preserved unchanged.
- A regression test proves that a secret written with no keyring fails, and that a secret written via SQLAdmin is stored as `enc:v2:*`.

## Access by role

| Role | What they can do |
|---|---|
| [[sqladmin-operator]] | Enters integration secrets as plaintext in SQLAdmin; `on_model_change` encrypts before persist. After this change, a misconfigured (keyless) instance fails loudly instead of storing plaintext. |
| [[superadmin]] | Same via the config API; also sets/rotates the platform AI key. |
| [[admin]] | May set the org POS token via `PUT /organizations/{id}/pos-config` (write-only); it is encrypted at rest under the same guarantee. |
| [[member]] | No access to secrets. |

The KEK itself lives only in `.env` (deploy/trust-root); no app role can read it.

## Involved entities

- [[integration_credentials]] — the encrypted store (Fernet); every write must produce `enc:v2:*` or fail. This is the primary surface of the fix.
- [[system_settings]] — non-secret runtime config; unaffected at rest, but the same startup guard protects the boot path that reads it.

## Dependencies / links

- **Requirements:** [[secret-encryption]] (`R2.2`: `encrypt()` must raise on empty keyring; `R2.3`/`R2.5` already met), [[fail-closed]] (`R8.4`/`R8.6`: no plaintext fallback, boot refuses on missing KEK), [[config-secrets]] (three-level config; KEK is the only env-resident secret material besides JWT/session).
- **Features:** protects the credentials consumed by [[LCOS-F4-config-secrets]] and [[LCOS-F5-provider-seams]]; the AI key it guards is used by [[LCOS-F8-ocr-recognition]].
- **Decisions:** [[ADR-006]] (fail-closed posture across egress and secrets).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `encrypt()` (`app/core/secrets.py:78`) raises `RuntimeError` when the keyring is empty (`_primary()`/`_keyring()` is `None`) instead of returning the value with a warning.
- [ ] AC-BE-2. `_ensure_strong_secrets` (`app/main.py:110`) requires a non-empty `SECRETS_ENC_KEY` in **all** environments; the `app_env != "local"` exemption at `:124` is removed. Boot with an empty key aborts with a clear error.
- [ ] AC-BE-3. `lcos.env.example` contains a valid generated dev KEK with a "replace in prod" comment; a fresh `docker compose up` from the example encrypts secrets (`enc:v2:*` in the DB).
- [ ] AC-BE-4. Test: writing any secret with no keyring raises `RuntimeError`; a secret entered via SQLAdmin is stored as `enc:v2:*` ciphertext (extend `tests/test_secrets.py`).
- [ ] AC-BE-5. `decrypt()` unchanged and still fail-closed (`RuntimeError` when ciphertext is present but the keyring is missing).
- [ ] AC-BE-6. Rotation still works: old ciphertext under `SECRETS_ENC_KEYS_OLD` remains readable; `validate_keyring()` still rejects an invalid KEK at startup.

### Frontend
- [ ] AC-FE-1. No frontend change: keys never reach the browser. FE continues to display only the masked `{is_set, last4}` for the POS token; no plaintext secret is ever returned to the client.

### Other (docs/infra)
- [ ] AC-OTHER-1. The module docstring in `secrets.py` (lines 14-16 / 79-80) is updated to describe fail-closed behaviour, removing the "stored WITHOUT encryption" dev-fallback wording.

## Open questions / gates

- **Non-negotiable coverage overlap:** the secret-encryption cases are part of the VER-01 merge-gate set — coordinate with [[LCOS-F24-merge-gate-tests]] so the fail-closed encrypt test is tagged and gated.
- **Prod checklist (deferred):** real `SECRETS_ENC_KEY`/`JWT_SECRET`/`SESSION_SECRET` and `COOKIE_SECURE=true` are `R-Deploy` items, out of Phase-1 scope.

## Sources

- `plan/PHASE_S1_STABILIZATION.md §1 S1-B1`, `§5 AC-1/AC-2` (fail-closed encrypt, startup guard, dev KEK).
- `08_PHASE1_SPEC.md F1.4` (REQ-1/REQ-2, AC-1/AC-2, references).
- `LCOS_Conformance_Alignment_GlobalRequirements.md` — A1 (the violation), R2.2/R2.3/R2.5, R8.4/R8.6, Part 4 secret tests.
- `mvp.be/app/core/secrets.py:78-88` (`encrypt` plaintext fallback to remove), `:100-117` (`decrypt` already fail-closed).
- `mvp.be/app/main.py:110-126` (`_ensure_strong_secrets`, `app_env != "local"` exemption to remove); `mvp.be/lcos.env.example`; `mvp.be/tests/test_secrets.py`.
