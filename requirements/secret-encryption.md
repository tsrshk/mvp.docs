---
id: REQ-SECRET-ENCRYPTION
type: requirement
title: Шифрование секретов at-rest (Fernet envelope, versioned KEK)
status: built
scope: cross-cutting
roles: [superadmin, sqladmin-operator]
entities: ["[[integration_credentials]]"]
adrs: ["[[ADR-010]]", "[[ADR-011]]", "[[ADR-005]]"]
requirements: ["[[config-secrets]]", "[[fail-closed]]", "[[global-requirements]]"]
ssot_for: [secret-encryption, fernet-envelope, kek-versioning, kek-rotation]
legacy_refs: [Conformance R2/R6, config-arch-review enc:v2]
sources: [01_ARCHITECTURE.md "Encryption scheme (enc:v2)", APP_OVERVIEW.md §5, LCOS_Conformance R2]
updated: 2026-07-20
---

# REQ-SECRET-ENCRYPTION · Шифрование секретов at-rest

**Type:** cross-cutting SSOT · **Status:** built (оговорка A1 — plaintext fallback у `encrypt()`). Envelope-шифрование секретов в [[integration_credentials]]; хранилище/разрешение — в [[config-secrets]].

## Нормативное положение

- **N1. Формат хранения** (`app/core/secrets.py`): секреты — Fernet-шифртекст (AES-128-CBC + HMAC). KEK только в `.env`, никогда в БД — дамп БД без `.env` бесполезен.
  - `enc:v2:<key_id>:<token>` — **текущий** формат; `key_id` фиксирует, какой ключ зашифровал (для ротации).
  - `enc:v1:<token>` — legacy (без key_id); дешифруется перебором всего keyring.
  - без префикса → plaintext/passthrough (dev fallback / незашифрованный legacy).
- **N2. `encrypt(value)`** — шифрует основным ключом → `enc:v2:<kid>:...`; идемпотентно (пропускает уже-`enc:*`). **Цель (R2.2/A1):** при пустом keyring **обязан** упасть с `RuntimeError`, не писать plaintext.
- **N3. `decrypt(value)`** — passthrough без префикса `enc:`; `enc:v2` — точный ключ по `key_id` с fallback на keyring; `enc:v1` — перебор keyring. **Шифртекст при пустом keyring → `RuntimeError`** (явно, не тихий мусор).
- **N4. Keyring** (`Settings.secrets_keyring`): `SECRETS_ENC_KEY` = основной (шифрует всё новое), помечен `SECRETS_ENC_KEY_ID` (default `"v1"`); `SECRETS_ENC_KEYS_OLD` = выведенные ключи, decrypt-only, формат `"kid1:key1,kid2:key2"`. Порядок keyring: основной → выведенные. `_keyring()` `@lru_cache`-нут (`cache_clear()` в тестах/ротации).
- **N5. Ротация:** повысить новый KEK в `SECRETS_ENC_KEY` с новым `SECRETS_ENC_KEY_ID`, переместить старый → в `SECRETS_ENC_KEYS_OLD`. Новые записи получают новый key_id; старые шифртексты остаются читаемыми.
- **N6. `validate_keyring()`** — eager-валидация при старте; malformed Fernet-ключ → `RuntimeError` немедленно (см. [[fail-closed]] N7).
- **N7. Запись/чтение секрета через SQLAdmin** ([[sqladmin-operator]]): `IntegrationCredentialAdmin.on_model_change` берёт plaintext → `encrypt()` перед persist (идемпотентно) → `rotated_at` → деактивация других активных строк той же (scope,provider,org,subdivision). List/detail — маска last-4 (`_cred_last4`). Поле write-only plaintext, read-masked. Ни один endpoint/view не возвращает наружу расшифрованный секрет.
- **N8. Редактирование в логах** (`core/logging.py::redact()`): полностью маскирует `admin_password_hash`, `session_secret`, `jwt_secret`, `secrets_enc_key(_old)`, пароль в `database_url`. AI-ключи/POS-токены не живут в `Settings` → не утекают через снапшот конфигурации.

> **SSOT.** N7 (ритуал `on_model_change` в SQLAdmin) и N8 (список секретов для `redact()`) — единый источник; другие доки ([[config-secrets]], [[global-requirements]]) ссылаются сюда и не дублируют спецификацию.

## Обоснование

Cleartext-секреты в БД = утечка на дампе. Fernet-envelope с KEK в env разделяет данные и ключ. Версионирование key_id (`enc:v2`) позволяет ротацию KEK без потери старых шифртекстов (старый ключ переходит в decrypt-only). Идемпотентный `encrypt()` делает повторное сохранение в SQLAdmin безопасным. Fail-closed при пустом keyring не позволяет тихо вернуть/сохранить мусор.

## Режимы отказа

- **Пустой keyring + шифртекст** → `RuntimeError` (decrypt) — не тихий мусор.
- **Malformed KEK** → `RuntimeError` при старте (`validate_keyring`).
- **Оговорка (BACKLOG A1):** `encrypt()` при пустом keyring сейчас логирует warning и пишет **plaintext** (намеренный dev fallback) — противоречит fail-closed; при незаданном локально `SECRETS_ENC_KEY` секреты будут храниться открыто. Действие: `encrypt()`→`RuntimeError`, startup-guard требует непустого `SECRETS_ENC_KEY` всегда (или гарантировать dev-KEK в `lcos.env.example`). См. [[fail-closed]] R8.4.
- **Никакой путаницы `enc:v6.2`:** схема префиксов делает миграцию/повтор идемпотентными; незашифрованный legacy читается как passthrough.

## Связи

- ADR: [[ADR-010]] (Fernet envelope, versioned KEK), [[ADR-011]] (no-cache reads — ротация мгновенна), [[ADR-005]] (три уровня).
- Сущности: [[integration_credentials]] (`encrypted_value`, `rotated_at`, partial-unique active).
- Требования: [[config-secrets]] (хранилище/разрешение), [[fail-closed]] R8.4, [[global-requirements]] R2.

## На это ссылаются

`LCOS-F4` (Three-level config & secret encryption), `LCOS-F23` (Fail-closed encryption ALIGN-01), `LCOS-F3` (плоскость SQLAdmin operator), любой потребитель POS/AI-токена.

## Источники

- 01_ARCHITECTURE.md → "Encryption scheme (envelope encryption with KEK versioning, enc:v2)", "How secrets reach providers at runtime", "Secret redaction in logs".
- APP_OVERVIEW.md §5; LCOS_Conformance R2, A1.
- Код: `app/core/secrets.py`, `app/core/logging.py::redact`, `app/admin/setup.py`.
