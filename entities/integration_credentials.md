---
id: integration_credentials
type: entity
title: integration_credentials — single secrets table (SSOT)
status: built
scope: mixed
table: integration_credentials
pk: id (uuid)
used_by: ["[[LCOS-F4-config-secrets]]", "[[LCOS-F5-provider-seams]]", "[[LCOS-F11-esupl-read]]"]
requirements: ["[[secret-encryption]]", "[[config-secrets]]", "[[fail-closed]]"]
sources: [mvp.be/app/db/models.py:380-426, mvp.be/CLAUDE.md, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# integration_credentials · integration secrets (SSOT)

**Scope:** depends on `scope` — platform (global) / org / subdivision · **Status:** built

## Purpose
The **SINGLE** table of external-integration secrets (AI and POS/ERP) — the SSOT (§3.3).
Plaintext is forbidden (I4): `encrypted_value` is ciphertext (Fernet, `app/core/secrets`;
see [[secret-encryption]]). **No env fallback** — fail-closed ([[fail-closed]],
[[config-secrets]]). `scope` defines the owner, `provider` the vendor. Rotation =
deactivate the active one and insert a new active one.

## Key fields
| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `scope` | enum `integration_credential_scope` | no | `platform`/`org`/`subdivision`; indexed |
| `provider` | enum `integration_credential_provider` | no | `anthropic`/`gemini`/`esupl`; indexed |
| `org_id` | uuid FK→organizations | yes | `ondelete="CASCADE"`, indexed |
| `subdivision_id` | uuid FK→subdivisions | yes | `ondelete="CASCADE"`, indexed |
| `encrypted_value` | text | no | Fernet ciphertext (never plaintext) |
| `is_active` | boolean | no | default true |
| `rotated_at` | timestamptz | yes | moment of rotation |
| `created_by` | varchar(320) | yes | the operator who created the secret |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Relations, FK, uniqueness
- FK `org_id → organizations.id` **CASCADE**; FK `subdivision_id → subdivisions.id`
  **CASCADE**.
- **Partial unique index (I7):** `uq_credentials_active_per_scope`(`scope`, `provider`,
  `COALESCE(org_id, sentinel)`, `COALESCE(subdivision_id, sentinel)`) UNIQUE `WHERE
  is_active` — exactly one active secret per (scope, provider, org, subdivision).
  COALESCE with the sentinel UUID `0000…0000`, because NULLs are distinguishable in a
  partial unique index.
- `scope`/`provider` — PG enums (`CredentialScope`, `CredentialProvider`).

## Used by features
[[LCOS-F4-config-secrets]] (three-level config + secret storage), [[LCOS-F5-provider-seams]] (AI provider keys behind the
resolver), [[LCOS-F11-esupl-read]] (Esupl POS token, scope=org, provider=esupl).

## Sources
- `mvp.be/app/db/models.py:380-426` (`IntegrationCredential` model), `:49-59` (enums)
- `mvp.be/CLAUDE.md` (secrets in the DB, Fernet, no env fallback)
- [[secret-encryption]], [[config-secrets]], [[fail-closed]]
