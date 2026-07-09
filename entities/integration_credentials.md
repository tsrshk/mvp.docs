---
id: integration_credentials
type: entity
title: integration_credentials — единая таблица секретов (SSOT)
status: built
scope: mixed
table: integration_credentials
pk: id (uuid)
used_by: ["[[LCOS-F4-config-secrets]]", "[[LCOS-F5-provider-seams]]", "[[LCOS-F11-esupl-read]]"]
requirements: ["[[secret-encryption]]", "[[config-secrets]]", "[[fail-closed]]"]
sources: [mvp.be/app/db/models.py:380-426, mvp.be/CLAUDE.md, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# integration_credentials · секреты интеграций (SSOT)

**Scope:** зависит от `scope` — platform (глобальный) / org / subdivision · **Status:** built

## Назначение
**ЕДИНСТВЕННАЯ** таблица секретов внешних интеграций (AI и POS/ERP) — SSOT (§3.3).
Открытый текст запрещён (I4): `encrypted_value` — шифртекст (Fernet, `app/core/secrets`;
см. [[secret-encryption]]). **Нет env-фолбэка** — fail-closed ([[fail-closed]],
[[config-secrets]]). `scope` определяет владельца, `provider` — вендора. Ротация =
деактивировать активный и вставить новый активный.

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `scope` | enum `integration_credential_scope` | no | `platform`/`org`/`subdivision`; индексируется |
| `provider` | enum `integration_credential_provider` | no | `anthropic`/`gemini`/`esupl`; индексируется |
| `org_id` | uuid FK→organizations | yes | `ondelete="CASCADE"`, индексируется |
| `subdivision_id` | uuid FK→subdivisions | yes | `ondelete="CASCADE"`, индексируется |
| `encrypted_value` | text | no | шифртекст Fernet (никогда не открытый текст) |
| `is_active` | boolean | no | default true |
| `rotated_at` | timestamptz | yes | момент ротации |
| `created_by` | varchar(320) | yes | оператор, создавший секрет |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Отношения, FK, уникальность
- FK `org_id → organizations.id` **CASCADE**; FK `subdivision_id → subdivisions.id`
  **CASCADE**.
- **Частичный уникальный индекс (I7):** `uq_credentials_active_per_scope`(`scope`, `provider`,
  `COALESCE(org_id, sentinel)`, `COALESCE(subdivision_id, sentinel)`) UNIQUE `WHERE
  is_active` — ровно один активный секрет на (scope, provider, org, subdivision).
  COALESCE с sentinel-UUID `0000…0000`, потому что NULL различимы в
  частичном уникальном индексе.
- `scope`/`provider` — PG-энумы (`CredentialScope`, `CredentialProvider`).

## Используется фичами
[[LCOS-F4-config-secrets]] (трёхуровневый конфиг + хранилище секретов), [[LCOS-F5-provider-seams]] (ключи AI-провайдеров за
резолвером), [[LCOS-F11-esupl-read]] (токен POS Esupl, scope=org, provider=esupl).

## Источники
- `mvp.be/app/db/models.py:380-426` (модель `IntegrationCredential`), `:49-59` (энумы)
- `mvp.be/CLAUDE.md` (секреты в БД, Fernet, нет env-фолбэка)
- [[secret-encryption]], [[config-secrets]], [[fail-closed]]
