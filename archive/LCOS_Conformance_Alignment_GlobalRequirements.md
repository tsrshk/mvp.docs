# LCOS — Соответствие плану, план выравнивания и глобальные требования (текущая стадия)

**Назначение.** Документ решает три задачи: (1) фиксирует соответствие фактической имплементации планируемой архитектуре; (2) даёт план приведения в соответствие по выявленным расхождениям; (3) формулирует **нормативные** глобальные требования текущей стадии для передачи агенту-исполнителю.

**Как читать.** Часть 1 — сверка (что есть). Часть 2 — что менять и почему. Часть 3 — контракт, которому код обязан удовлетворять (для агента). Часть 4 — критерии приёмки. Идентификаторы на английском.

**Опорный источник истины:** предоставленный `PROJECT_ANALYSIS_HANDOFF.md` (анализ по коду) + прошлая спека стабилизации. Где handoff отмечает «не прочитано построчно» — это переведено в VERIFY-задачи, а не в утверждения.

---

## Часть 1. Проверка соответствия

### 1.1 Матрица инвариантов и решений

| Пункт плана | Статус | Комментарий |
|---|---|---|
| I1 — один источник истины на значение | **Соответствует** | 3 уровня; `Settings` — единственный читатель env; `system_settings`/`integration_credentials` без env-фолбэка (явно в `effective_config.py`, `credentials.py`) |
| I2 — `.env` = boot/trust-root, БД = операционное | **Соответствует** | AI-ключи, модели, toggles, POS-токен ушли из env в БД; в env остались KEK, JWT/session, admin-оператор, ERP-выбор, URL, cookie-флаги |
| I3 — fail-closed везде | **Соответствует, с 1 оговоркой** | VPN, отсутствие AI-ключа, отсутствие POS-токена, `erp_write` OFF, decrypt при пустом keyring → всё fail-closed. **Оговорка:** `encrypt()` при пустом keyring пишет plaintext (см. A1) |
| I4 — шифрование секретов at-rest, KEK в env | **Соответствует, превосходит** | Fernet-конверт, `enc:v2:<kid>`, ротация KEK, `validate_keyring()` на старте |
| I5 — две независимые плоскости auth | **Соответствует** | app-users (argon2/JWT/refresh) ≠ SQLAdmin-оператор (env/bcrypt/session); оператора нет в `users` |
| I6 — seam есть, реализация одна | **Частично** | ERP=esupl (одна). OCR/AI = **две** (claude+gemini), LLM-транспорт не за Protocol (см. D-a) |
| I7 — один активный секрет на (scope,provider) | **Соответствует** | partial-unique `uq_credentials_active_per_scope` + деактивация в `on_model_change` |
| D1 — AI-ключ scope=platform | **Совпало** | — |
| D2 — POS = провайдер `esupl`, scope=org | **Совпало** | — |
| D3 — секреты без кэша | **Совпало** | `get_active_credential` читает+дешифрует на каждый вызов |
| D4 — история секретов не в Phase 1 | **Совпало** | есть `rotated_at`/`created_by`, отдельной history-таблицы нет |
| D5 — `system_settings` = KV + whitelist | **Совпало** | `REGISTRY` из `SettingSpec`, ключи выбираются, не вводятся |
| D6 — cookie `Secure=false` локально | **Совпало** | `COOKIE_SECURE` флаг, прод-гайд `=true` |

### 1.2 Где имплементация богаче плана (не расхождения)

- Слой **`subdivision`** под `organization` (Slack-модель): `membership` = user↔subdivision, org выводится через subdivision. Прошлая спека предполагала user↔org — фактическое решение мельче/точнее и корректно ложится на «subdivision = склад Esupl». Требования Части 3 обновлены под фактическую модель.
- **Восстановление активного контекста при refresh** (`refresh_sessions.active_subdivision_id`).
- **Версионирование KEK + ротация** (`enc:v2:<kid>`, `SECRETS_ENC_KEYS_OLD`).
- **Статус-машина `invoice`** (`draft→validated→rejected→prepared→written→failed`) с сохранением `esupl_payload` на `prepared`.

**Вывод по Q1:** архитектура соответствует плану; расхождения — это (а) несколько нарушений заявленных принципов «no fallbacks / no dead code» и (б) недостроенные/незакрытые seam'ы. Ниже — их закрытие.

---

## Часть 2. План выравнивания

### 2.1 MUST-ALIGN — нарушают заявленный принцип

**A1. `encrypt()` пишет plaintext при пустом keyring.**
- Проблема: «deliberate dev fallback» противоречит «no fallbacks / fail-closed». Phase 1 работает **локально**, поэтому это операционный путь, не гипотетический: при незаданном `SECRETS_ENC_KEY` секреты лягут открытым текстом.
- Действие: (1) `encrypt()` при пустом keyring → `RuntimeError`, не plaintext. (2) Startup-guard требует непустой `SECRETS_ENC_KEY` **всегда** (снять исключение для `APP_ENV=local`) **или** гарантировать, что `lcos.env.example` содержит валидный dev-KEK. (3) Проверить `lcos.env.example` на наличие `SECRETS_ENC_KEY`.
- Готово, когда: запись любого секрета без keyring падает; локальный Phase 1 всегда шифрует.

**A2. Мёртвый код на фронте.**
- Удалить: `shared/llm` (весь модуль-заглушка, кроме живых `stripCodeFence/clamp01/parseJsonSafe` — их перенести в `shared/lib`), `shared/ocr/prompt.ts`+`parse.ts`, `shared/match/prompt.ts`+`parse.ts`, legacy browser-direct Esupl путь (`VITE_POS_PROVIDER=esupl`, `VITE_ESUPL_API_URL`, `VITE_ESUPL_READ_ONLY`) из `.env.example`/pos-config, устаревшие комментарии «mock/Gemini/Claude».
- Не трогать: `shared/ocr/rules.ts` (хелперы `waybillSeries.isValid`/`isWaybillIdValid`/`totalRow` живые).
- Готово, когда: grep не находит браузер-директ LLM/ERP путей; сборка зелёная; ни один живой consumer не сломан.

**A3. Устаревшие docstrings, противоречащие коду.**
- `ErpProvider.write_invoice` docstring говорит «None → fallback to global env token», код fail-closed. Переписать под фактическое поведение. Проверить прочие docstrings на «env fallback».
- Готово, когда: docstrings описывают fail-closed без env-фолбэка.

### 2.2 DECIDE — незакрытые seam'ы / вторые реализации

Каждый пункт нарушает «no unused components, none planned» пока не закрыт. Рекомендация — по умолчанию, переопределяется.

**D-a. Gemini как вторая OCR/AI-реализация + LLM-транспорт не за Protocol.**
- Факт: `@register_ocr("gemini")` существует; но LLM — модульные функции с `if gemini else claude`, не Protocol. CLAUDE.md декларирует «one impl per provider (OCR=claude)». Двойная роль `resolve_ai_provider()` (одно значение выбирает и LLM в `ai_complete`, и класс OCR в `get_ocr`) предполагает, что имена OCR == значения enum `ai_provider` — рассинхрон = скрытый баг.
- Варианты: **(A) claude-only** — удалить gemini-OCR + gemini-ветку транспорта + `gemini` из `CredentialProvider`/`ai_provider` enum; убрать двойную роль. **(B) два вендора** — вынести LLM за `Protocol`+registry симметрично OCR/ERP, добавить тесты на оба, зафиксировать инвариант «OCR name ≡ ai_provider enum».
- **Рекомендация: (A) claude-only** на текущей стадии (совпадает с «одна реализация на seam» и упрощает резолвинг). Gemini вернуть при реальном триггере гео-/стоимостного риска.

**D-b. `invoice_lines.sku_embedding Vector(1536)`.**
- Факт: колонка не читается/пишется, нет ANN-индекса, не определён провайдер эмбеддингов. Текущий матчинг — fuzzy + LLM.
- Варианты: **(A)** удалить колонку (миграция) до реальной потребности; **(B)** достроить семантический матчинг (провайдер эмбеддингов + ivfflat/hnsw + query).
- **Рекомендация: (A) удалить.** Расширение pgvector можно оставить (дёшево), колонку — убрать.

**D-c. `CredentialScope.subdivision`.**
- Факт: объявлен, «активно не используется», нет рантайм-вызова с `subdivision_id`.
- **Рекомендация: удалить** значение из enum (по «none planned»). Если предвидится per-subdivision POS-токен в Phase 2 — оставить с явным комментарием-задел и включить в «осознанные seam'ы» Части 3.

**D-d. CSRF полусобран.**
- Факт: сервер поддерживает double-submit (`lcos_csrf` + `X-CSRF-Token`), но `csrf_enabled=False` и фронт токен не читает/шлёт. Включение в проде молча сломает мутации.
- **Рекомендация: явно отложить** на текущей стадии + внести в прод-чеклист (Часть 3, R-Deploy): «включение CSRF требует правки `backendRequest.ts`». Не оставлять как «есть, но не работает».

**D-e. FE строит candidate-set, бэк его игнорирует.**
- Факт: `buildMatchCandidates` уходит в `/invoices/suggest-matches`, но бэк ре-сорсит кандидатов из `/ingredients`; на реальном пути FE-набор не используется (нужен только mock).
- Варианты: **(A)** бэк принимает пред-фильтрованных кандидатов от FE; **(B)** FE перестаёт строить набор для backend-пути (оставить для mock).
- **Рекомендация: (B)** — меньше кода, бэк остаётся авторитетным источником каталога.

**D-f. `esupl.list_suppliers`/`list_ingredients` без токена.**
- Факт: зовут `_auth_headers()` без токена (ушли бы в Esupl неаутентифицированно); docstrings — «вне критического пути» (поставщики из seed, каталог из локального `ingredients`).
- **Рекомендация: удалить или закрыть guard'ом** как недостижимые в Phase 1, чтобы не осталось пути неаутентифицированного egress.

**D-g. Multi-page OCR теряет страницы.**
- Факт: FE `MAX_INVOICE_PAGES=3`, но `BackendOcrProvider` шлёт только `pages[0]`; бэк одностраничный → стр. 2–3 молча теряются.
- Варианты: **(A)** реализовать multi-page на бэке; **(B)** временно `MAX_INVOICE_PAGES=1`, убрать молчаливую потерю.
- **Рекомендация: (B) сейчас** (устранить тихую потерю данных), (A) — как фиче-задача, когда понадобится.

**D-h. POS-токен: кто может ставить.**
- Факт: помимо SQLAdmin (superadmin), `PUT /organizations/{id}/pos-config` позволяет **org-admin** ставить Esupl-токен. Твоё правило «всё app-wide — из супер-админки» относится к app-wide; POS-токен tenant-scoped.
- **Рекомендация: оставить** (корректно для Phase 2, безвредно в single-tenant). Подтвердить, что это приемлемо для Phase 1, иначе — ограничить до superadmin.

### 2.3 VERIFY — нужно для цели «мочь тестировать»

**V-a. Merge-блокирующие тесты на не-переговариваемое.** Handoff их не нашёл. Подтвердить наличие (или написать): fail-closed VPN (`VpnUnavailableError`, отсутствие тихого direct-egress), выбор egress-клиента `via_vpn`, gating `ERP_WRITE_ENABLED` (синтетический id при OFF, реальный POST при ON), tenant-isolation (запрос без scope невозможен; чужой org недоступен), refresh reuse-detection (повторный revoked-токен → revoke всей `family_id`). Тесты — на реальном Postgres+pgvector (testcontainers), egress через `respx`.

**V-b. Пароли.** Подтвердить, что `users.password_hash` реально производится/проверяется argon2 (`app/auth/password.py`), а bcrypt — только для SQLAdmin-оператора; пути не перепутаны.

**V-c. Двойная роль `resolve_ai_provider()`** (см. D-a): подтвердить, что нельзя зарегистрировать OCR-имя, не являющееся валидным значением `ai_provider`. Если D-a=(A), пункт снимается частично (остаётся один вендор).

### 2.4 DEFER — осознанно откладываем на текущей стадии

- Rate-limiting на `/auth/login` (single-tenant local — низкий приоритет; внести в прод-чеклист).
- CI-пайплайн (CLAUDE.md требует CI-enforced non-negotiables; Phase 1 — вручную).
- Прод-хардненинг: `Dockerfile.prod`, Hetzner, `COOKIE_SECURE=true`, `CSRF_ENABLED=true`, реальный `SECRETS_ENC_KEY`.
- Бэкенд-idempotency ключ (заменит per-browser `sentRegistry`).
- `localos.lastWarehouseId` без org-scope (низкий риск UI-дефолт).
- FSD-линтер (steiger/dependency-cruiser) — сейчас правила ревью-конвенцией.

---

## Часть 3. Глобальные требования — текущая стадия (нормативно, для агента)

Формулировки MUST/SHALL — контракт, проверяемый тестом/ревью. Отражают фактическую модель + принятые в Части 2 решения (дефолты). Если решение переопределено — обновить соответствующий пункт.

### R1. Конфигурация и секреты — три уровня
- R1.1 `.env` (через `Settings`/pydantic-settings) — **единственный** читатель окружения. Содержит только: DB-подключение, KEK (`SECRETS_ENC_KEY`+id+old), `JWT_SECRET`, `SESSION_SECRET`, `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`, статический `ERP_PROVIDER`, URL'ы провайдеров, cookie-флаги, порты, декларативный VPN-конфиг gluetun.
- R1.2 `system_settings` (БД, KV + whitelist `REGISTRY`) — несекретные рантайм-настройки: `ai_provider`, модели, `ai_vpn_enabled`, `module_*`, `erp_write_enabled`. Резолвинг строго **DB(validated) → registry default**, без env.
- R1.3 `integration_credentials` (БД, Fernet) — все интеграционные секреты. Резолвинг **active row → decrypt → иначе None**, без env.
- R1.4 Ни одно значение из R1.2/R1.3 не читается из env. (Тест: grep + отсутствие env-ключей для этих значений.)

### R2. Шифрование секретов at-rest
- R2.1 Секреты хранятся Fernet-шифртекстом формата `enc:v2:<key_id>:<token>`; KEK только в `.env`.
- R2.2 `encrypt()` при пустом keyring **обязан** падать (`RuntimeError`), не писать plaintext. (После A1.)
- R2.3 `decrypt()` при наличии шифртекста и пустом keyring → `RuntimeError` (не тихий мусор).
- R2.4 Ротация: новый KEK в `SECRETS_ENC_KEY` (новый id), старый в `SECRETS_ENC_KEYS_OLD` (decrypt-only). Старые шифртексты читаемы.
- R2.5 `validate_keyring()` на старте; невалидный KEK → отказ загрузки.

### R3. App-аутентификация (пользователи приложения)
- R3.1 Access — JWT HS256 (`jwt_secret`), TTL 15 мин, HttpOnly cookie `lcos_access`, payload `{sub,is_superadmin,org,sub_div,role,type,iat,exp}`. Авторизация stateless из подписанного токена.
- R3.2 Refresh — opaque `token_urlsafe(48)`, хранится **только SHA-256 хэшом**, TTL 30 мин sliding, HttpOnly cookie `lcos_refresh`, `family_id`.
- R3.3 `POST /auth/refresh`: not found/expired → 401; **revoked → reuse-detected: revoke всей `family_id` + 401**; иначе ротация в том же `family_id`, восстановление контекста из `active_subdivision_id`.
- R3.4 `POST /auth/login` — неверные креды → generic 401 (причина не раскрывается).
- R3.5 `POST /auth/logout` — revoke текущего refresh, очистка кук, 204.
- R3.6 `GET /auth/me` — единственный источник сайдбара/скоупа FE: обычный юзер видит свои subdivision, superadmin — всё дерево.
- R3.7 `POST /auth/switch-context` — авторизация через `_role_for` (403 без доступа; 404 достижим только для superadmin); требует живой refresh (иначе 401); переиздаёт только access.
- R3.8 Пароли пользователей — argon2 (`app/auth/password.py`). (V-b.)
- R3.9 Пароли — не логируются; неверный вход не раскрывает причину.

### R4. Плоскость супер-админа (SQLAdmin)
- R4.1 Вход SQLAdmin — отдельный backend: `ADMIN_USERNAME` + bcrypt `ADMIN_PASSWORD_HASH` из env, session-cookie (`SESSION_SECRET`). **Нет строки в `users`.** Плоскости не смешиваются.
- R4.2 Управляет: `system_settings`, `integration_credentials`, `organizations`, `subdivisions`, `users`, `memberships`, каталог. `RefreshSession` — read-only.
- R4.3 `IntegrationCredentialAdmin.on_model_change`: вход plaintext → `encrypt()` до персиста (идемпотентно) → `rotated_at` → деактивация прочих активных того же (scope,provider,org,subdivision). Список/деталь — маска last-4. Поле write-only plaintext, read-masked.
- R4.4 `UserAdmin.on_model_change`: `password_hash` принимает plaintext → argon2 (skip если уже `$argon2`).
- R4.5 Ни один эндпоинт/представление не отдаёт расшифрованный секрет наружу.

### R5. Мультитенантность и скоупинг
- R5.1 Иерархия: `organization` (граница изоляции) → `subdivision` (= склад Esupl) → `membership` (user↔subdivision+role). `users` — единственная глобальная таблица.
- R5.2 `organization_id` денормализован на каждую операционную/каталожную строку, `ondelete=RESTRICT`; операционные строки также несут `subdivision_id`.
- R5.3 Tenant-репозитории **требуют `organization_id` в конструкторе** — запрос без скоупа структурно невозможен.
- R5.4 Скоуп берётся из подписанного access-JWT (`org`,`sub_div`), **никогда** из клиентского ввода. `get_tenant_context` → 403 при отсутствии `organization_id`.
- R5.5 Роли: `is_superadmin` (глобальный флаг на `User`) + `Role.admin` (per-subdivision через `membership`). RBAC-матрицы нет (явный не-goal). Юзер без membership и не superadmin логинится, но контекст закрыт (403).
- R5.6 FE-скоуп выводится из кэша `/auth/me` (бэк авторитетен); per-browser хранилища ключуются `orgScopeToken()`.

### R6. Управление ключами
- R6.1 AI-ключ: `integration_credentials(scope=platform, provider=anthropic)`. Резолвинг active→decrypt, без env. Отсутствие → `AiUnavailableError` (503).
- R6.2 POS-токен: `integration_credentials(scope=org, provider=esupl, org_id)`. Отсутствие → неаутентифицированный вызов → Esupl 401 (fail-closed). Ставится superadmin (SQLAdmin) или org-admin (`PUT /organizations/{id}/pos-config`) — write-only, ответ только `{is_set,last4}`. (D-h подтвердить.)
- R6.3 Один активный секрет на (scope,provider,org,subdivision) — partial-unique индекс + деактивация при записи.
- R6.4 Секреты читаются **без кэша** — ротация мгновенна.
- R6.5 `Organization.esupl_team_id`/`Subdivision.esupl_warehouse_id`/`ingredients.esupl_*`/`packings.esupl_packing_id` — **несекретные** ID-колонки; единственный секрет Esupl — токен.

### R7. Provider-seam'ы
- R7.1 `services` зависят только от `providers/*/base.py` (Protocol), не от конкретных классов. Направление зависимостей: `api → services → providers/repositories`.
- R7.2 ERP: один провайдер `esupl`, выбор статический (`ERP_PROVIDER` из env).
- R7.3 OCR/AI: **одна** реализация `claude`, выбор рантайм (`system_settings.ai_provider`). (После D-a=(A): `gemini` удалён, двойная роль резолвера снята.) Если решение (B) — LLM за `Protocol`+registry симметрично OCR/ERP, инвариант «OCR name ≡ ai_provider enum» под тестом.
- R7.4 Кросс-инфра (egress-клиенты, VPN-toggle, session_scope) инъектится через `ProviderContext` (module-global), не течёт в сигнатуры Protocol.
- R7.5 Новые реализации на seam **не пишутся** без явного триггера.

### R8. Fail-closed — сводный каталог (обязателен)
- R8.1 VPN для AI: `ai_vpn_enabled` по умолчанию True; мёртвый/медленный туннель → `VpnUnavailableError` (503), **никогда** тихий direct-egress. `get_client(via_vpn=True)` без vpn-клиента → ошибка, не fallback.
- R8.2 Нет AI-ключа → `AiUnavailableError`. Нет POS-токена → Esupl 401. Оба без env-фолбэка.
- R8.3 `erp_write_enabled` по умолчанию False; при OFF `write_invoice` возвращает синтетический `esupl-prepared-<number>` без egress; тот же код-путь при ON = реальная запись.
- R8.4 Шифртекст при пустом keyring → `RuntimeError`. `encrypt()` без keyring → `RuntimeError` (R2.2).
- R8.5 Настройки/секреты не фолбэчат на env: DB→registry default (настройки) или →None (секреты).
- R8.6 Startup-guard: отказ загрузки при пустых/дефолтных `SESSION_SECRET`/`JWT_SECRET`; `SECRETS_ENC_KEY` обязателен (R2.2/A1).

### R9. SSOT и отсутствие мёртвого кода
- R9.1 Фронт не хранит секретов: auth только HttpOnly-куками; `VITE_*` — только несекретные endpoint/provider-переключатели.
- R9.2 Живые пути провайдеров — только `backend`/`mock`; браузер-директ LLM/ERP отсутствует (после A2).
- R9.3 Нет мёртвых модулей/экспортов без live-consumer (после A2/D-b/D-c).
- R9.4 Единый error-envelope `{"error":{code,message,details?}}`; catch-all вручную возвращает CORS-заголовки.
- R9.5 Логи редактируют секреты (`redact()`): `admin_password_hash`, `session_secret`, `jwt_secret`, `secrets_enc_key(_old)`, пароль в `database_url`.

### R-Deploy. Прод-чеклист (не блокирует Phase 1, но фиксируется)
- Реальные `SECRETS_ENC_KEY`, `JWT_SECRET`, `SESSION_SECRET`; `COOKIE_SECURE=true`.
- `CSRF_ENABLED=true` **требует** предварительной правки `backendRequest.ts` (чтение/отправка `X-CSRF-Token`) — иначе мутации сломаются (D-d).
- Rate-limiting на `/auth/login`.
- CI, прогоняющий non-negotiable тесты (V-a) как merge-gate.
- `Dockerfile.prod` / IaC для Hetzner.

---

## Часть 4. Критерии приёмки (тест-сценарии текущей стадии)

**Авторизация**
- [ ] login выдаёт `lcos_access`+`lcos_refresh` (HttpOnly); защищённый эндпоинт 401 без access.
- [ ] refresh ротирует в рамках `family_id`; повторный revoked-токен → revoke всей семьи + 401.
- [ ] logout ревокает; switch-context 403 без доступа, требует живой refresh.
- [ ] роль/скоуп только из JWT; запрос без org-контекста → 403.
- [ ] tenant-репозиторий нельзя инстанцировать без `organization_id`.

**Супер-админка / настройки**
- [ ] вход SQLAdmin отдельными env-кредами, не app-юзером.
- [ ] изменение `system_settings` из SQLAdmin отражается в рантайме без редеплоя.
- [ ] секрет вводится plaintext, в БД — `enc:v2:*`, в UI — last-4; наружу plaintext не отдаётся.

**Ключи AI**
- [ ] AI-вызов использует ключ из `integration_credentials(platform,anthropic)`.
- [ ] нет ключа → `AiUnavailableError` (503), без чтения env.
- [ ] VPN off/dead при `ai_vpn_enabled=True` → `VpnUnavailableError` (503), без direct-egress.
- [ ] ротация ключа в SQLAdmin действует на следующем вызове (без кэша).

**Ключи POS/ERP**
- [ ] токен ставится (SQLAdmin или `PUT pos-config`); при `erp_write_enabled=True` используется в `write_invoice`.
- [ ] нет токена → Esupl 401 (fail-closed).
- [ ] `erp_write_enabled=False` → синтетический id без egress.

**Инварианты**
- [ ] grep не находит env-чтения для значений R1.2/R1.3.
- [ ] на каждый seam — одна активная реализация (после D-a).
- [ ] сборка FE зелёная после удаления мёртвого кода (A2); живые `rules.ts`-хелперы работают.
