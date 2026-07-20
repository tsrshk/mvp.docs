---
id: REQ-CONFIG-SECRETS
type: requirement
title: Трёхуровневое разделение конфигурации и секретов (без env fallback)
status: built
scope: cross-cutting
roles: [superadmin, admin, sqladmin-operator]
entities: ["[[system_settings]]", "[[integration_credentials]]"]
adrs: ["[[ADR-005]]", "[[ADR-011]]", "[[ADR-012]]"]
requirements: ["[[secret-encryption]]", "[[fail-closed]]", "[[global-requirements]]"]
legacy_refs: [Conformance R1/R6, config-arch-review]
sources: [01_ARCHITECTURE.md "Keys, Secrets & Credential Management", APP_OVERVIEW.md §5, LCOS_Conformance R1/R6]
ssot_for: [config-tiers, system-settings-registry, config-resolution, no-env-fallback]
updated: 2026-07-20
---

# REQ-CONFIG-SECRETS · Три уровня конфигурации и секретов

**Type:** cross-cutting SSOT · **Status:** built. Центральная архитектурная тема: **один источник истины на значение, без env fallback** для runtime-настроек и секретов. Шифрование секретов вынесено в [[secret-encryption]].

## Нормативное положение

Три хранилища, у каждого свой владелец и правило разрешения:

- **N1. Уровень 1 — `.env` (через `Settings`/pydantic-settings) — ЕДИНСТВЕННЫЙ читатель окружения.** Содержит только: подключение к БД, KEK (`SECRETS_ENC_KEY`+`_KEY_ID`+`_KEYS_OLD`), `JWT_SECRET`, `SESSION_SECRET`, `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`, статический `ERP_PROVIDER`, URL провайдеров, флаги cookie, порты, декларативный VPN-конфиг gluetun.
- **N2. Уровень 2 — [[system_settings]] (БД, KV + whitelist `REGISTRY`)** — несекретные runtime-настройки: `ai_provider`, модели (`anthropic_model`/`gemini_model`), `ai_vpn_enabled`, `module_*`, `erp_write_enabled`, промпты OCR (`ocr_invoice_prompt`/`ocr_price_list_prompt`). Список неисчерпывающий — SSOT именно `REGISTRY`. Разрешение строго **DB(validated) → registry default**. Ключи выбираются из `SettingSpec`, не вводятся свободно. Секретов здесь нет (инвариант).
- **N3. Уровень 3 — [[integration_credentials]] (БД, Fernet)** — **все** интеграционные секреты (AI-ключи, POS/ERP-токены). Разрешение **active row → decrypt → иначе None**.
- **N4. Никакое значение из N2/N3 не читается из env** — "NO ENV FALLBACK" в `effective_config.py`/`credentials.py`. Проверяемо grep-ом: отсутствие env-ключей для этих значений.
- **N5. Resolver (`core/effective_config.py`):** `resolve(session, key) → Resolved(value, source, valid)`; невалидное значение из БД → warning + `spec.default` (никогда не пропускает мусор). Приоритет **строго DB → registry default**, без env. Есть `resolve_with_context()` — он открывает свою сессию через `ProviderContext` из [[provider-abstraction]].
- **N6. Секреты читаются без кэша** (`get_active_credential` дешифрует при каждом вызове) — ротация в SQLAdmin мгновенна ([[ADR-011]]).
- **N7. Плоскости записи (авторитет):** уровень 2/3 редактирует **только** superadmin через SQLAdmin ([[sqladmin-operator]]); исключение — POS-токен: org-admin может задать его через `PUT /organizations/{id}/pos-config` (write-only, ответ `{is_set,last4}`). Front-end не хранит секретов ([[ADR-012]]): `VITE_*` — только несекретные toggles. Ритуал шифрования секрета при записи через эту плоскость (`on_model_change` и т.п.) здесь не дублируется — см. [[secret-encryption]] N7.

## Обоснование

Секреты в env требуют redeploy для ротации ключа и утекают в дампы/снапшоты конфигурации. Перенос AI-ключей, POS-токена, выбора провайдера, моделей и всех toggles `MODULE_*`/`ERP_WRITE`/`AI_VPN` в БД даёт runtime-контроль из панели суперадмина без redeploy, тогда как `.env` хранит только boot/trust-root. Отсутствие env fallback гарантирует единый источник на значение — иначе «тихий второй источник» делает поведение недетерминированным.

## Режимы отказа

- **Невалидное значение настройки в БД** → warning + registry default (никакого мусора в runtime).
- **Отсутствие активного секрета** → `None` → fail-closed на уровне потребителя (AI → `AiUnavailableError`; POS → Esupl 401; см. [[fail-closed]]).
- **Попытка положить секрет в `system_settings`** — запрещена конвенцией/комментарием; секреты живут только в `integration_credentials`.
- **Долг:** `encrypt()` пишет plaintext при пустом keyring (BACKLOG A1) — операционный путь, когда `SECRETS_ENC_KEY` локально не задан; подлежит устранению (см. [[secret-encryption]] R2.2, [[fail-closed]] R8.4).

## Связи

- ADR: [[ADR-005]] (три уровня), [[ADR-011]] (без кэша), [[ADR-012]] (front-end без секретов), [[ADR-010]] (шифрование — в [[secret-encryption]]).
- Сущности: [[system_settings]], [[integration_credentials]].
- Требования: [[secret-encryption]], [[fail-closed]], [[global-requirements]] R1/R6.

## На это ссылаются

`LCOS-F3` (плоскость SQLAdmin operator + config API), `LCOS-F4` (Three-level config & secret encryption), `LCOS-F5` (provider seams), любая feature, читающая настройку/секрет (OCR, ERP-write, VPN).

## Источники

- 01_ARCHITECTURE.md → "Keys, Secrets & Credential Management", "Resolution order (the definitive table)", "Typed registry + resolver".
- APP_OVERVIEW.md §5, §3; LCOS_Conformance R1, R6.
- Код: `app/core/{config,system_settings,effective_config,credentials}.py`.
