---
id: REQ-GLOBAL
type: requirement
title: Глобальные требования текущего этапа (нормативные, R1–R9)
status: built
scope: cross-cutting
roles: [member, manager, admin, superadmin, sqladmin-operator]
entities: ["[[system_settings]]", "[[integration_credentials]]", "[[users]]", "[[refresh_sessions]]", "[[organizations]]", "[[subdivisions]]", "[[memberships]]"]
adrs: ["[[ADR-005]]", "[[ADR-006]]", "[[ADR-007]]", "[[ADR-008]]", "[[ADR-009]]", "[[ADR-010]]", "[[ADR-011]]", "[[ADR-012]]", "[[ADR-021]]", "[[ADR-022]]", "[[ADR-023]]"]
requirements: ["[[config-secrets]]", "[[secret-encryption]]", "[[auth]]", "[[multitenancy]]", "[[provider-abstraction]]", "[[fail-closed]]", "[[vpn-egress]]", "[[erp-esupl-integration]]"]
ssot_for: [conformance-r1-r9]
legacy_refs: [LCOS_Conformance_Alignment_GlobalRequirements Part 3, 02_REQUIREMENTS (never-created slot)]
sources: [LCOS_Conformance_Alignment_GlobalRequirements.md Part 3, 01_ARCHITECTURE.md, APP_OVERVIEW.md]
updated: 2026-07-20
---

# REQ-GLOBAL · Глобальные требования текущего этапа (R1–R9)

**Type:** нормативный контракт, проверяемый тестом/ревью. **Status:** built. Заполняет так и не созданный слот `02_REQUIREMENTS`. Формулировки MUST/SHALL. Отражает фактическую модель + решения Conformance из Part 2. Каждый блок делегирует детали своему выделенному SSOT-документу — здесь **сводка нормативов**, а не дубликат.

> **Порядок доверия:** code + CLAUDE.md > DEC-0011/0013 > этот документ > описательные доки. При конфликте с кодом — побеждает код (см. известные doc↔code корректировки внизу).

## R1 — Конфигурация и секреты: три уровня → [[config-secrets]]
- **R1.1** `.env` (через `Settings`/pydantic-settings) — **единственный** читатель окружения. Только: БД, KEK (`SECRETS_ENC_KEY`+id+old), `JWT_SECRET`, `SESSION_SECRET`, `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`, статический `ERP_PROVIDER`, URL, флаги cookie, порты, декларативный VPN gluetun.
- **R1.2** [[system_settings]] (БД, KV + whitelist `REGISTRY`) — несекретные runtime-настройки (`ai_provider`, модели, `ai_vpn_enabled`, `module_*`, `erp_write_enabled`). Разрешение строго **DB(validated) → registry default**, без env.
- **R1.3** [[integration_credentials]] (БД, Fernet) — все интеграционные секреты. Разрешение **active row → decrypt → иначе None**, без env.
- **R1.4** Никакое значение R1.2/R1.3 не читается из env (тест: grep + отсутствие env-ключей).

## R2 — Шифрование секретов at-rest → [[secret-encryption]]
- **R2.1** Секреты — Fernet-шифртекст `enc:v2:<key_id>:<token>`; KEK только в `.env`.
- **R2.2** `encrypt()` при пустом keyring **обязан** упасть (`RuntimeError`), не писать plaintext (после A1).
- **R2.3** `decrypt()` над шифртекстом при пустом keyring → `RuntimeError` (не тихий мусор).
- **R2.4** Ротация: новый KEK в `SECRETS_ENC_KEY` (новый id), старый в `SECRETS_ENC_KEYS_OLD` (decrypt-only); старые шифртексты остаются читаемыми.
- **R2.5** `validate_keyring()` при старте; невалидный KEK → отказ загрузки.

## R3 — Аутентификация приложения → [[auth]]
- **R3.1** Access — JWT HS256 (`jwt_secret`), TTL 15 мин, HttpOnly `lcos_access`, payload `{sub,is_superadmin,org,sub_div,role,type,iat,exp}`, stateless авторизация.
- **R3.2** Refresh — opaque `token_urlsafe(48)`, хранится **только как SHA-256 хеш**, TTL 30 мин sliding, HttpOnly `lcos_refresh`, `family_id`.
- **R3.3** `POST /auth/refresh`: не найдено/истёк → 401; **revoked → reuse-detected: отзыв всего `family_id` + 401**; иначе ротация в рамках того же `family_id`, контекст восстановлен из `active_subdivision_id`.
- **R3.4** `POST /auth/login` — неверные креды → generic 401.
- **R3.5** `POST /auth/logout` — отзыв текущего refresh, очистка cookie, 204.
- **R3.6** `GET /auth/me` — единственный источник сайдбара/scope FE.
- **R3.7** `POST /auth/switch-context` — авторизация через `_role_for` (403 без доступа; 404 только для superadmin); требует живого refresh (иначе 401); переиздаёт только access.
- **R3.8** Пароли пользователей — argon2 (`app/auth/password.py`).
- **R3.9** Пароли не логируются; неудачный вход не раскрывает причину.

## R4 — Плоскость супер-админа (SQLAdmin) → [[sqladmin-operator]], [[config-secrets]]
- **R4.1** Вход SQLAdmin — отдельный backend: `ADMIN_USERNAME` + bcrypt `ADMIN_PASSWORD_HASH` из env, session-cookie (`SESSION_SECRET`). **Без строки в [[users]].** Плоскости не смешиваются.
- **R4.2** Управляет: [[system_settings]], [[integration_credentials]], [[organizations]], [[subdivisions]], [[users]], [[memberships]], каталогом. [[refresh_sessions]] — read-only.
- **R4.3** `IntegrationCredentialAdmin.on_model_change` шифрует секрет перед persist (write-only plaintext, read-masked last-4), деактивирует конкурентов. Детали ритуала — [[secret-encryption]] N7.
- **R4.4** `UserAdmin.on_model_change`: `password_hash` принимает plaintext → argon2 (пропуск, если уже `$argon2`).
- **R4.5** Ни один endpoint/view не возвращает наружу расшифрованный секрет.

> **Корректировка:** маршруты `admin_system` гейтятся плоскостью **SQLAdmin OPERATOR**, а не app-JWT superadmin (см. doc↔code корректировку в инвентаре).

## R5 — Мультитенантность и scoping → [[multitenancy]]
- **R5.1** Иерархия: [[organizations]] (граница изоляции) → [[subdivisions]] (= склад Esupl) → [[memberships]] (user↔организация[↔subdivision]+role). [[users]] — единственная глобальная таблица. `memberships.organization_id` хранится явно (NOT NULL); `subdivision_id` NULLable (NULL ⇒ org-level роль на всю орг) — ADR-023, миграция 0024.
- **R5.2** `organization_id` денормализован на каждую операционную/каталожную строку, `ondelete=RESTRICT`; операционные строки несут ещё и `subdivision_id`.
- **R5.3** Tenant-репозитории **требуют `organization_id` в конструкторе** — запрос без scope структурно невозможен.
- **R5.4** Scope из подписанного access-JWT (`org`,`sub_div`), **никогда** из клиентского ввода. `get_tenant_context` → 403 без `organization_id`.
- **R5.5** Роли (3-ролевая RBAC, [[ADR-023]]): `is_superadmin` (глобальный флаг на [[users]]) + enum `role` `{admin, manager}` на [[memberships]]. admin управляет своей орг + подразделениями «сверху вниз»; manager — прикладные фичи без управления. SSOT энфорсмента — `app/auth/rbac.py`; прежний non-goal «RBAC-матрицы нет» снят. Пользователь без membership и не superadmin входит, но контекст закрыт (403).
- **R5.6** Scope FE из кэша `/auth/me` (авторитетен backend); per-browser хранилища ключуются `orgScopeToken()`.
- **R5.7** Управление структурой и пользователями доступно и из **приложения** (app-JWT REST, не только SQLAdmin): роутеры `organizations` (org + subdivisions CRUD), `users` (user CRUD + memberships + reset-password), `GET /roles`; авторизация — [[ADR-023]] SSOT `app/auth/rbac.py` (`require_app_write`, `assert_can_manage_org`, `require_superadmin`). Одноразовый пароль (`must_change_password`) + форс смены. Две плоскости auth по-прежнему не смешиваются ([[ADR-007]]). См. [[LCOS-F76-user-org-management]].

## R6 — Управление ключами → [[secret-encryption]], [[erp-esupl-integration]]
- **R6.1** AI-ключ: `integration_credentials(scope=platform, provider=anthropic)`. active→decrypt, без env. Отсутствие → `AiUnavailableError` (503).
- **R6.2** POS-токен: `integration_credentials(scope=org, provider=esupl, org_id)`. Отсутствие → неаутентифицированный вызов → Esupl 401. Задаётся superadmin (SQLAdmin) или org-admin (`PUT /organizations/{id}/pos-config`) — write-only, ответ `{is_set,last4}`.
- **R6.3** Один активный секрет на (scope,provider,org,subdivision) — partial-unique индекс + деактивация при записи.
- **R6.4** Секреты читаются **без кэша** — ротация мгновенна.
- **R6.5** `esupl_team_id`/`esupl_warehouse_id`/`ingredients.esupl_*`/`packings.esupl_packing_id` — **несекретные** ID-колонки; единственный секрет Esupl — токен.

## R7 — Provider seams → [[provider-abstraction]]
- **R7.1** `services` зависят только от `providers/*/base.py` (Protocol). Направление: `api → services → providers/repositories`.
- **R7.2** ERP: один провайдер `esupl`, выбор статический (`ERP_PROVIDER` из env).
- **R7.3** OCR/AI: **одна** реализация `claude`, выбор runtime (`system_settings.ai_provider`). Долг DEC-01 (gemini как вторая реализация + двойная роль резолвера): claude-only ЛИБО LLM за Protocol+registry с инвариантом "OCR name ≡ ai_provider enum" под тестом.
- **R7.4** Cross-infra (egress, VPN toggle, session_scope) инжектируется через `ProviderContext` (module-global), не протекает в сигнатуры Protocol. См. [[vpn-egress]].
- **R7.5** Новые реализации на шве **не пишутся** без явного триггера.

## R8 — Fail-closed — сводный каталог → [[fail-closed]]
- **R8.1** VPN для AI: `ai_vpn_enabled` по умолчанию True; мёртвый/медленный туннель → `VpnUnavailableError` (503), **никогда** тихий прямой egress. `get_client(via_vpn=True)` без vpn-клиента → ошибка. См. [[vpn-egress]].
- **R8.2** Нет AI-ключа → `AiUnavailableError`. Нет POS-токена → Esupl 401. Оба без env fallback.
- **R8.3** `erp_write_enabled` по умолчанию False; при OFF `write_invoice` → синтетический `esupl-prepared-<number>` без egress; тот же путь кода при ON. См. [[invoice-status-machine]].
- **R8.4** Шифртекст при пустом keyring → `RuntimeError`; `encrypt()` без keyring → `RuntimeError` (R2.2).
- **R8.5** Настройки/секреты не падают в env: DB→registry default или →None.
- **R8.6** Startup guard: отказ при пустых/дефолтных `SESSION_SECRET`/`JWT_SECRET`; `SECRETS_ENC_KEY` обязателен (R2.2/A1).

## R9 — SSOT и отсутствие мёртвого кода
- **R9.1** Front-end не хранит секретов: auth только через HttpOnly cookie; `VITE_*` — только несекретные toggles endpoint/provider ([[ADR-012]]).
- **R9.2** Живые пути провайдеров — только `backend`/`mock`; никакого browser-direct LLM/ERP (после A2).
- **R9.3** Нет мёртвых модулей/экспортов без живого потребителя (после A2/D-b/D-c). **Известно:** `invoice_lines.sku_embedding` UNUSED → backlog DEC-02; FE `shared/llm`/`prompt.ts`/`parse.ts` — рудиментарный мёртвый код.
- **R9.4** Единый конверт ошибки `{"error":{code,message,details?}}`; catch-all вручную возвращает CORS-заголовки.
- **R9.5** Логи редактируют секреты (`redact()`). Список редактируемых ключей — [[secret-encryption]] N8.

## R-Deploy — prod-чеклист (не блокирует Phase 1, зафиксирован)
- Реальные `SECRETS_ENC_KEY`/`JWT_SECRET`/`SESSION_SECRET`; `COOKIE_SECURE=true`.
- `CSRF_ENABLED=true` **требует** предварительной правки `backendRequest.ts` (чтение/отправка `X-CSRF-Token`) — иначе мутации ломаются (D-d).
- Rate limiting на `/auth/login`. CI, гоняющий non-negotiable тесты (V-a) как merge gate. `Dockerfile.prod`/IaC для Hetzner.

## Известные doc↔code корректировки (baked-in, авторитетен код)
- **Supplier** matching — смешанный **trigram 0.65 + token-Jaccard 0.35, min 0.4** (НЕ "Jaccard≥0.5"). См. [[erp-esupl-integration]] N8. (**SKU** matching на FE fuzzy — 50% Jaccard + 50% Dice, floor 0.34 — другая функция, не путать.)
- FE suppliers-page / supplier-selector / breadcrumbs / footer **существуют**.
- `invoice_lines.sku_embedding` — **UNUSED** (мёртвый код, backlog DEC-02).
- Маршруты `admin_system` гейтятся плоскостью **SQLAdmin OPERATOR**, а не app-JWT superadmin.
- Поставщики — локальный SSOT ([[ADR-021]]): `GET /suppliers` и `/suppliers/search` читают локальную таблицу `suppliers`, а Esupl following используется ТОЛЬКО для matching и durable `supplier_external_id` в `sku_mapping` (`POST /suppliers/sync` лишь обогащает локальную карточку, не является источником справочника). Это частичный реверс [[DEC-0011]]: «POS = SSOT» сохраняется для каталога ИНГРЕДИЕНТОВ, но НЕ для справочника ПОСТАВЩИКОВ.
- Цепочка миграций: `0001..0024` + OCR-prompt (`1e12…`). Новейший ADR — [[ADR-023]] (3-ролевая RBAC + org-level membership + user-management API).
- Wife-Gate == Pilot-Gate ([[ADR-003]]).

## Критерии приёмки (тестовые сценарии)
Полный список — Part 4 Conformance; ключевые merge-blocking (V-a): fail-closed VPN, `ERP_WRITE_ENABLED` gating, tenant-isolation, refresh reuse-detection, `test_exact_cache_match_does_not_commit_and_creates_no_mapping`. Тесты гоняются на реальном Postgres+pgvector (testcontainers), egress через `respx`.

## Источники
- LCOS_Conformance_Alignment_GlobalRequirements.md → Part 3 (R1–R9, R-Deploy), Part 4 (AC), Part 2 (A1/D-*/V-*).
- 01_ARCHITECTURE.md, APP_OVERVIEW.md (verified_against_code 2026-07-09), 04_DECISIONS.md (ADR-001..022).
