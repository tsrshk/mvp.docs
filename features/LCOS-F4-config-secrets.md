---
id: LCOS-F4
type: feature
title: Трёхуровневый конфиг и шифрование секретов
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
# LCOS-F4 · Трёхуровневый конфиг и шифрование секретов
**Эпик:** [[LCOS-E1-platform]] · **Статус:** built · **Фаза:** Phase 1

## Описание

Намеренное **разделение конфигурации/секретов на три уровня** — важнейшая архитектурная тема системы. Каждое значение живёт ровно на одном уровне, со своим владельцем и приоритетом, а уровни 2–3 **не имеют env-фолбэка**:

1. **Deploy-конфиг** — `.env` → `Settings` (pydantic-settings), *единственный* читатель env: подключение к БД, KEK, `JWT_SECRET`/`SESSION_SECRET`, `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`, статический `ERP_PROVIDER`, URL провайдеров, флаги cookie, конфиг gluetun VPN.
2. **Несекретные runtime-настройки** — `system_settings` (KV в БД + белый список `REGISTRY`): `ai_provider`, имена моделей, `ai_vpn_enabled`, `module_*`, `erp_write_enabled`, промпты OCR (`ocr_invoice_prompt`/`ocr_price_list_prompt`) — список неисчерпывающий, SSOT — `REGISTRY`. Разрешение строго **БД (валидировано) → дефолт реестра**, никогда env.
3. **Секреты интеграций** — `integration_credentials` (БД, зашифровано Fernet): AI API-ключи, per-org POS-токен Esupl. Разрешение — **активная строка → расшифровка → иначе None**, никогда env, **читается без кэша**, чтобы ротация админом была мгновенной.

Секреты шифруются at-rest через **Fernet** по схеме envelope с **версионированием KEK** (`enc:v2:<key_id>:<token>`), так что один только дамп БД бесполезен, а ключи можно ротировать без потери старых шифртекстов. Типизированная пара **реестр + резолвер** управляет несекретными настройками: `core/system_settings.py` держит замороженный белый список `SettingSpec` (SSOT ключей/типов/дефолтов), `core/effective_config.py` приводит значение из БД и откатывается к дефолту spec на мусоре (никогда не распространяет невалидное значение). Направляющее правило: AI-ключи, POS-токены, выбор провайдера/модели и все тумблеры `MODULE_*`/`ERP_WRITE`/`AI_VPN` **не в `.env`** — они живут только в БД.

## Возможности

- **Уровень 1 (`Settings`):** единственный читатель env; держит статический deploy-конфиг + мастер-ключи подписи/шифрования; секреты вымараны из любого снимка настроек (`redact()`).
- **Уровень 2 (`system_settings`):** типизированный реестр `SettingSpec` из белого списка (`TYPE_BOOL`/`TYPE_ENUM`/`TYPE_STR` + захардкоженные дефолты); резолвер `resolve/resolve_bool/resolve_all/resolve_with_context` → БД (валидировано) → дефолт реестра, **без env**.
- **Уровень 3 (`integration_credentials`):** единственная SSOT-таблица секретов; `get_active_credential` читает + расшифровывает при каждом вызове (без кэша); отсутствует → None (fail-closed).
- **Envelope Fernet + версионирование KEK:** `enc:v2:<key_id>:<token>` — текущий, `enc:v1:<token>` — legacy; keyring = основной (`SECRETS_ENC_KEY`+`_KEY_ID`) + выведенные из эксплуатации только-для-расшифровки (`SECRETS_ENC_KEYS_OLD`); ротация продвигает новый ключ, старые шифртексты остаются читаемыми.
- `validate_keyring()` при запуске; некорректный KEK → немедленный `RuntimeError`.
- **Fail-closed-грани шифрования:** шифртекст присутствует, но keyring пуст → `RuntimeError` (никогда молчаливый мусор); guard при запуске требует `SECRETS_ENC_KEY` вне `APP_ENV=local`. (Conformance ALIGN A1 ужесточает `encrypt()` на пустом keyring → ошибка вместо открытого текста — см. [[LCOS-F23-failclosed-encryption]].)
- Инвариант единственного активного credential на (scope, provider, org, subdivision) через частичный уникальный индекс `uq_credentials_active_per_scope` + деактивация при записи.
- **Два пути записи секретов:** SQLAdmin (`IntegrationCredentialAdmin`, [[LCOS-F3-sqladmin-operator]]) и `PUT /organizations/{id}/pos-config` со scope арендатора (superadmin ИЛИ org-admin); оба — write-only для открытого текста, ответ только `{is_set, last4}`.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[superadmin]] | Устанавливает/ротирует все секреты и редактирует любую runtime-настройку через SQLAdmin/config API; устанавливает POS-токен организации через `PUT /organizations/{id}/pos-config`. |
| [[sqladmin-operator]] | То же создание секретов/настроек через SQLAdmin ModelViews (шифрование-перед-сохранением, маскировка-при-чтении). |
| [[admin]] | Только со scope арендатора: `PUT /organizations/{id}/pos-config` для своей организации (Esupl `team_id` + write-only токен). |
| [[member]] | Нет доступа к конфигу; чтения никогда не видят открытый текст (только `is_set`/`last4`). |

## Задействованные сущности

- [[system_settings]] — несекретный KV уровня 2; ключи из белого списка; управляется superadmin; **секреты здесь не хранятся** (по соглашению/комментарию).
- [[integration_credentials]] — SSOT уровня 3 для всех секретов; `scope` (`platform`/`org`/`subdivision`), `provider` (`anthropic`/`gemini`/`esupl`), `encrypted_value` (Fernet), `is_active`, `rotated_at`, частичный уникальный индекс единственного активного.
- [[organizations]] — держит несекретный `esupl_team_id`; per-org POS-**токен** — это секрет в `integration_credentials`, а не здесь.

## Зависимости / связи

- **Требования:** [[config-secrets]] (три уровня, нет env-фолбэка для 2–3), [[secret-encryption]] (envelope Fernet, версионирование/ротация KEK, чтения без кэша), [[fail-closed]] (отсутствующий ключ/токен → ошибка, пустой keyring → RuntimeError), [[global-requirements]] (R1/R2/R6).
- **Фичи:** создаётся через [[LCOS-F3-sqladmin-operator]]; потребляется [[LCOS-F5-provider-seams]] (AI-ключ/провайдер) и [[LCOS-F10-invoice-status-machine]] (POS-токен); тумблеры читаются [[LCOS-F6-module-gates]]; ужесточение fail-closed шифрования — [[LCOS-F23-failclosed-encryption]].
- **ADR:** [[ADR-005]] (трёхуровневый конфиг), [[ADR-010]] (версионирование KEK + ротация), [[ADR-011]] (чтения секретов без кэша → мгновенная ротация).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `Settings` (pydantic-settings) — единственный читатель env; ни одно значение из `system_settings`/`integration_credentials` никогда не читается из env (grep + инвариантный тест Part-4).
- [ ] AC-BE-2. `system_settings` разрешается строго БД (валидировано) → дефолт реестра; невалидное значение из БД логирует предупреждение и откатывается к дефолту spec (никогда не распространяется).
- [ ] AC-BE-3. `get_active_credential` читает + расшифровывает при **каждом** вызове (без кэша); ротированный секрет вступает в силу на следующем вызове.
- [ ] AC-BE-4. Секреты сохраняются как `enc:v2:<key_id>:<token>`; `encrypt()` идемпотентен (пропускает уже-`enc:*`); `decrypt()` выбирает по `key_id` с фолбэком по кольцу.
- [ ] AC-BE-5. Шифртекст присутствует при пустом keyring → `RuntimeError` (не молчаливый мусор); `validate_keyring()` выполняется при запуске и отклоняет некорректный KEK.
- [ ] AC-BE-6. Guard при запуске отказывается загружаться при пустом/дефолтном `SESSION_SECRET`/`JWT_SECRET` и требует `SECRETS_ENC_KEY` вне `APP_ENV=local`.
- [ ] AC-BE-7. Инвариант единственного активного: запись секрета деактивирует другие активные строки того же (scope, provider, org, subdivision); обеспечивается частичным уникальным индексом.
- [ ] AC-BE-8. `GET/PUT /organizations/{id}/pos-config`: `_authorize` требует superadmin ИЛИ admin этой организации; токен write-only; ответ — `{esupl_team_id, esupl_api_token:{is_set,last4}}` — никогда открытый текст.
- [ ] AC-BE-9. `redact()` маскирует `admin_password_hash`, `session_secret`, `jwt_secret`, `secrets_enc_key(_old)` и пароль в `database_url` из логов.

## Открытые вопросы / гейты

- **ALIGN-01 (открыто):** `encrypt()` сейчас пишет открытый текст на пустом keyring («dev-фолбэк») — Conformance A1 требует вместо этого бросать исключение; отслеживается как [[LCOS-F23-failclosed-encryption]].
- **D-c:** `CredentialScope.subdivision` объявлен, но не используется — рекомендация удалить его, если не планируется per-subdivision POS-токен в Phase 2.
- **D-h (подтвердить):** org-admin (не только superadmin) может установить POS-токен через `pos-config` — принято для Phase 1 (со scope арендатора, безвредно в single-tenant); подтвердить перед SaaS.
- Hardening прода (реальные KEK/JWT/session, `COOKIE_SECURE=true`) сегодня — это руководство в комментариях env ([[LCOS-F66-prod-hardening]]).

## Источники

- `APP_OVERVIEW.md §5` (три уровня конфига, envelope Fernet, fail-closed, без кэша).
- `01_ARCHITECTURE.md` — «Keys, Secrets & Credential Management» (таблица разрешения, схема шифрования, реестр+резолвер, пути записи).
- `LCOS_Conformance_Alignment_GlobalRequirements.md` R1/R2/R6 + Part 2 A1.
- `mvp.be/app/core/config.py` (`Settings`, единственный читатель env).
- `mvp.be/app/core/system_settings.py:46` (`REGISTRY`/`SettingSpec`), `mvp.be/app/core/effective_config.py` (`resolve`, БД→дефолт, без env).
- `mvp.be/app/core/secrets.py:78` (`encrypt`), `:100` (`decrypt`), `:64` (`validate_keyring`), `:31` (префикс `enc:v2`).
- `mvp.be/app/core/credentials.py` (`get_active_credential`, без кэша).
- `mvp.be/app/api/v1/routes/organizations.py:52` (`pos-config` GET/PUT, `_authorize`, `_token_state`).
