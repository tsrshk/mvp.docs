---
id: OVERVIEW-ARCH
type: overview
title: Архитектура LCOS (as-built SSOT)
status: current
phase: "Phase 1"
verified_against_code: 2026-07-09
updated: 2026-07-09
owner: Ivan
trust_tier: 2
ssot_for: [architecture, layering, provider-seams, module-gates, config-tiers, migrations-chain]
legacy_refs: [01_ARCHITECTURE.md, APP_OVERVIEW.md]
sources:
  - 01_ARCHITECTURE.md (normative as-built)
  - APP_OVERVIEW.md §2–§13 (verified_against_code 2026-07-09)
  - mvp.be/CLAUDE.md (ground-truth conventions)
  - DEC-0011, DEC-0013
---

# Архитектура LCOS (as-built)

> Это единственный SSOT фактической архитектуры системы. Он объединяет нормативный `01_ARCHITECTURE.md` (tier 2) и сверенный с кодом `APP_OVERVIEW.md` (tier 3, `verified_against_code 2026-07-09`). Авторитет при конфликте: **код + `CLAUDE.md` > [[DEC-0011]]/[[DEC-0013]] > документы**. Данные о сущностях и требованиях здесь не дублируются — см. ссылки на [[MOC]] и [[MOC]].

## 1. Что это такое (границы системы)

**LCOS** — это слой приёмки и стратегической аналитики поверх ERP/POS (белорусский **Esupl**). Суть продукта — **AI-управляющий**, который *делает работу*, а не рисует дашборды. Первый клин — **приёмка накладных**: фото → OCR → сопоставление строк с каталогом POS → арифметическая проверка → построение payload приходной накладной для Esupl → локальное сохранение и (за gate) запись в POS.

**Чем это НЕ является:** это не POS, не оперативный учёт, не бухгалтерия — это остаётся в Esupl. LCOS — это **точка записи накладной** и **read-only** по отношению к собственным данным Esupl. Жёсткое продуктовое правило: **AI показывает данные и аргументы; решает человек** — никаких автозаказов и никаких записей в POS без подтверждения человеком.

Фаза 1 — одна кофейня (Customer Zero), бесплатно, работает локально в Docker Compose. Продуктовый контекст: [[product]]. Roadmap: [[roadmap]]. Ключевое решение о фазировании — [[ADR-001]]. Pilot-Gate (== Wife-Gate) — [[ADR-003]].

## 2. Стек

| Слой | Технологии |
|---|---|
| Backend (`mvp.be`) | Python 3.12, FastAPI, SQLAlchemy 2.0 **async** (asyncpg), Alembic, Pydantic v2, PostgreSQL 16 + pgvector, httpx, SQLAdmin, anthropic SDK, `uv`/`ruff`/pytest |
| Frontend (`mvp.fe`) | React 18 + TypeScript, Redux Toolkit (RTK Query), react-router v6, Tailwind v4, Vite 6, vite-plugin-pwa (mobile-first); строгий Feature-Sliced Design (FSD) |
| Infra | Docker Compose: `db` (pgvector/pg16) + `backend` + `gluetun` (VPN-сайдкар для egress к AI) |
| AI / OCR | Vision-LLM (Claude Vision, по умолчанию); провайдер выбирается в рантайме из `system_settings.ai_provider` |

Монорепозиторий в `d:\_work\mvp`: `mvp.be` (backend), `mvp.fe` (frontend PWA), `mvp.docs` (документация).

## 3. Слои backend и направление зависимостей

`CLAUDE.md` фиксирует направление: **`api` → `services` (use-cases) → `providers` / `repositories`**. `services` зависят **только от интерфейсов провайдеров** (`providers/*/base.py`), никогда от конкретных реализаций.

- **api** (`app/api/v1/routes/*`) — тонкий: валидирует ввод, разрешает DI, вызывает сервис, маппит ORM → `InvoiceOut`.
- **services** (`app/services/*`) — use-cases (`InvoiceService`, `MatchService`, `SupplierService`, catalog). Конструктор принимает `session, ocr: OcrProvider, erp: ErpProvider, organization_id, subdivision_id` и внутри инстанцирует тенант-репозитории. Ссылается только на Protocols.
- **domain** (`app/domain/entities.py`) — ORM-free Pydantic-модели, пересекающие интерфейсы провайдеров (`InvoiceDraft`, `PreparedInvoice`, `EsuplOutgoingInvoice`, `EsuplLineItem`, `IngredientRef`, `PackingRef`, `SupplierRef`, `MatchCandidate`). `Decimal` для денег/количеств.
- **providers / repositories** — инфраструктура. OCR/ERP за `Protocol`; репозитории оборачивают SQLAlchemy и **требуют `organization_id`**.

Слой `core` стоит сбоку; `effective_config.py` использует ленивые импорты внутри функций, чтобы избежать цикла `core → providers → core`.

**Два механизма DI:**
1. **FastAPI `Depends`** (`api/deps.py`, `auth/dependencies.py`, `modules/registry.py`) — пер-реквестное связывание сессии, провайдеров, сервисов, контекста auth и module gates через `Annotated[T, Depends(...)]` (`SessionDep`, `OcrDep`, `ErpDep`, `InvoiceServiceDep`, `TenantContext`).
2. **`ProviderContext`** (`providers/context.py`) — модуль-глобальный синглтон `_CTX` со сквозной инфраструктурой (`egress` — два долгоживущих httpx-клиента, `ai_vpn` — `AiVpnToggle`, `session_scope` — `SessionFactory`), чтобы она не протекала в сигнатуры Protocol. Устанавливается в `main.py::lifespan`, очищается при shutdown; `get_provider_context()` бросает `RuntimeError`, если не установлен. Тесты подставляют фейки.

**Routes** (`app/api/v1/routes/`): `health`, `auth` (через `app/auth`), `organizations`, `ingredients` (каталог + SKU-маппинги), `invoices` (recognize/prepare/submit), `suppliers` (карточки + критерии), `admin_system` (superadmin config). Единый конверт ошибок `{"error":{code,message,details?}}` (`core/errors.py`); catch-all вручную переприменяет CORS-заголовки.

Подробнее: [[provider-abstraction]].

## 4. Швы провайдеров

- **За `Protocol` + registry, по одной реализации на шов:** OCR = `claude` (по умолчанию), ERP = `esupl`. Альтернативы **не пишутся** до реального триггера ([[ADR-009]]).
- `providers/base.py` держит `_OCR_REGISTRY`/`_ERP_REGISTRY` (name → class), регистрируемые декораторами `@register_ocr("claude")`, `@register_erp("esupl")`. `import_providers()` явно импортирует модули реализаций один раз в lifespan (декораторы срабатывают при импорте).
- **Нет LLM `Protocol`.** LLM-транспорт — модульные async-функции в `providers/ai.py` (`ai_complete`, `claude_complete`, `gemini_complete`); OCR-провайдеры — тонкие адаптеры к ним.
- **Выбор реализации разнесён по двум плоскостям конфигурации** (легко ошибиться):
  - **ERP = статически из env** — `get_erp()` читает `settings.erp_provider` (`ERP_PROVIDER`, по умолчанию `"esupl"`).
  - **OCR/AI = из БД в рантайме** — `get_ocr()` вызывает `resolve_ai_provider()` → `system_settings.ai_provider` (по умолчанию `"claude"`). Ленивый resolver: пути записи не платят за чтение БД, а superadmin может переключить провайдера в SQLAdmin без редеплоя.
- Frontend не держит секретов; живые пути провайдеров живут только на `backend` ([[ADR-012]]). FE-провайдеры (`shared/ocr`, `shared/match`, `shared/pos`) имеют оси `backend | mock`.

## 5. Module gates

Модули гейтятся **в момент запроса**: `modules/registry.py::require_module` возвращает **404**, если модуль выключен. **Routes регистрируются всегда** — gate живёт на уровне request-dependency, а не на mounting. Это позволяет включать/выключать функциональные области без изменения графа маршрутизации.

## 6. Мультитенантность и авторизация

- **Тенант = organization.** `organization_id` **денормализован в каждую операционную строку** — запрос тенанта невозможен без scope (жёсткая граница изоляции, `ondelete=RESTRICT`). Операционные строки также несут `subdivision_id`. `users` — единственная **глобальная** таблица; членство — через `memberships`.
- Иерархия: `organization → subdivision → membership(user↔subdivision+role)`. `organization ↔ ровно одна команда Esupl`; `subdivision ↔ склад Esupl` ([[ADR-004]], [[ADR-008]]).
- **Две независимые плоскости auth (никогда не смешивать)** — непреложное правило в `CLAUDE.md`:
  1. **Пользователи приложения** (React FE) — таблица `users`, **argon2**, JWT access 15 мин в HttpOnly-куке (`lcos_access`) + непрозрачный refresh 30 мин (`lcos_refresh`), ротация family_id, детекция повторного использования. `app/auth/*`.
  2. **SQLAdmin operator** — единый env-«backdoor» (`ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH`, **bcrypt**), session-куки, **без строки в `users`**. `app/core/security.py` + `app/admin/setup.py` ([[ADR-007]]).
- **Роли:** `is_superadmin` — глобальный boolean на `User` (god-mode: видит/переключается в любую org/subdivision, везде трактуется как `admin`). Enum `Role` содержит **единственное значение `admin`**, присваиваемое пер-subdivision через `Membership.role`. RBAC-матрицы нет (явная не-цель). Пользователь без членства, не являющийся superadmin, может залогиниться, но не имеет активного контекста → данные тенанта закрыты (403 из `get_tenant_context`).
- **Изоляция тенантов** покрыта тестами и **блокирует merge**.

Роли: [[superadmin]] · [[admin]] · [[member]] · [[sqladmin-operator]]. Подробнее: [[auth]], [[multitenancy]].

> **коррекция doc↔code:** routes `admin_system` гейтятся плоскостью **SQLAdmin OPERATOR** (env + bcrypt session), **а не** app-JWT superadmin. `is_superadmin` — это плоскость приложения; системная конфигурация оператора идёт через плоскость оператора.

## 7. Три уровня конфигурации и секреты

Три уровня ([[ADR-005]]); для уровней 2–3 **нет env-fallback**:

1. **`.env`** — boot / корень доверия. `core/config.py::Settings` — единственный читатель env, синглтон `settings`.
2. **`system_settings`** — несекретные рантайм-настройки (whitelisted-ключи), типизированный registry `core/system_settings.py` (SSOT ключей/типов/дефолтов), resolver `core/effective_config.py` (`DB → registry default`, **без env-fallback**). Управляется superadmin через SQLAdmin.
3. **`integration_credentials`** — секреты интеграций (единая SSOT-таблица), scope=`platform|org|subdivision`, provider=`anthropic|gemini|esupl`. **Шифрование Fernet**. `core/credentials.py::get_active_credential` читает+расшифровывает **без кэша**.

**Шифрование секретов:** Fernet-конверт `enc:v2:<key_id>:<token>`, версионированный KEK, ротация без потери старых шифротекстов ([[ADR-010]]); чтение **без кэша** — ротация мгновенна ([[ADR-011]]). Стартовый secret-guard в `main.py::lifespan`. Подробнее: [[config-secrets]], [[secret-encryption]].

## 8. Доктрина fail-closed

Fail-closed **везде** ([[ADR-006]]):

- **VPN egress к AI:** `providers/http.py` держит `direct_client` и `vpn_client` (через `gluetun:8888`). `get_client(via_vpn=True)` бросает `VpnUnavailableError`, если vpn-клиента нет — **никакого тихого fallback на direct** (непреложно). `guard_vpn` конвертирует транспортные ошибки в `VpnUnavailableError`. `via_vpn` для AI — **рантайм-тумблер** (`AiVpnToggle`, кэшируемый, по умолчанию fail-closed **True**), а не статический `requires_vpn`.
- **POS-токен:** нет активного credential → запрос уходит неаутентифицированным, и Esupl возвращает **401** (нет env-fallback).
- **AI-ключ:** его отсутствие == `AiUnavailableError` → **503** (missing-config == недоступно, намеренно).
- **`ERP_WRITE_ENABLED`** по умолчанию **False** — записи в POS нет, пока не включено.
- Ошибки маппятся в единый конверт: `VpnUnavailableError → 503 vpn_unavailable`, `AiUnavailableError → 503 ai_unavailable`.

Подробнее: [[fail-closed]], [[vpn-egress]].

## 9. Ключевой поток: накладная

2-шаговый API: `recognize` (OCR, без persist) → клиент редактирует → `submit`. `prepare` — чистый шаг resolve (также `POST /invoices/prepare` для превью).

```text
Photo → recognize (OCR, vision-LLM)  →  InvoiceDraft (raw lines + supplier from the name)
  → prepare()  [draft context, tolerant]
      resolve the supplier; for each line, from the LOCAL catalog — numeric Esupl FKs
      (esupl_item_id, esupl_unit_id, packing), tax_rate; builds the EsuplOutgoingInvoice payload.
      Hints (fuzzy / LLM / exact-cache) live ONLY here. pos_ingredient_id is NOT touched.
  → submit()  [commit context, fail-closed]
      validate_draft (arithmetic, tolerance Decimal("0.05"))
      → _resolve_commit_identities → Phase-2 live validation
      → status: rejected / validated / prepared / written / failed
  → write_invoice()  ONLY when ERP_WRITE_ENABLED (default OFF → esupl-prepared-<number>, no write)
```

**MatchService.suggest** — путь LLM-сопоставления: промпт, собранный из строк + локального каталога → `ai_complete` (fail-closed VPN). Модель не может выдумать SKU вне каталога (`_parse_matches` отбрасывает неизвестный `sku`).

Сохранённая накладная (dual-write: локальная БД + гейтированный ERP): [[invoices]], [[invoice_lines]].

## 10. Машина статусов накладной

`InvoiceStatus` (нативный PG-enum): `draft → validated → rejected → prepared → written → failed`.

| Статус | Значение |
|---|---|
| `draft` | начальный (recognize, не submitted) |
| `validated` | распознана, арифметика ok, но не готова к payload POS |
| `rejected` | провалена арифметика / обязательные поля / commit identity / live-валидация — **ничего не записано** |
| `prepared` | payload полностью собран и сохранён в `invoices.esupl_payload`, готов к отправке; запись выключена |
| `written` | фактически записана в Esupl (только под `ERP_WRITE_ENABLED`) |
| `failed` | запись в ERP провалилась (перехвачена, не роняет запрос) |

`esupl_payload (Text)` заполняется при `status=prepared`, чтобы более поздняя гейтированная отправка воспроизвела точное валидированное тело. Идемпотентность записи — уникальный `(organization_id, external_id)`. Полный контракт: [[invoice-status-machine]].

## 11. SKU identity — модель двух контекстов ([[DEC-0011]] / [[DEC-0013]] вариант A)

Разделены две сущности:
- **Мастер-данные ingredient** (`name`, `unit`, `category`) — чужой актив, принадлежит POS. LCOS **никогда** не авторитетен.
- **Mapping** (`source_key` → identity) — актив LCOS, накапливающийся **moat** ([[sku_mapping]]).

Резолвинг line→SKU происходит в **двух разных контекстах** (не путать их):

- **Draft resolve** (`prepare()`, толерантный, дешёвый): payload из локального каталога [[ingredients]] — числовые FK, tax_rate. Готовность = «payload buildable». Подсказки (client-side fuzzy, LLM `suggest-matches`, точное попадание из [[ingredient_cache]]) — **только подсказки**. `prepare()` **не** устанавливает `pos_ingredient_id`.
- **Commit resolve** (`submit()` → `_resolve_commit_identities` → Phase 2, **fail-closed**): durable `pos_ingredient_id` берётся **только из `sku_mapping`** по `normalize_source_key(line.description)` (тот же нормализатор, что и при записи, SSOT), приоритет **subdivision → org**, и **только подтверждённая identity** (`method=manual` **ИЛИ** `confirmed_by IS NOT NULL`). Cache / fuzzy / AI **не участвуют** на commit. Затем живой запрос к POS (`GET /teams/{id}/products?id=`; нет точного совпадения → `None`, без fallback на `items[0]`). None / mismatch / недоступность → **block + review** (`rejected`), никогда тихий пропуск. При успехе durable id снапшотится на `invoice_lines.pos_ingredient_id`.

- **[[DEC-0013]] вариант A:** точное попадание кэша **без** подтверждённого mapping НЕ авто-коммитит и НЕ авто-создаёт mapping — строка удерживается для ручного подтверждения. Вариант C (авто-создание `cache_exact`/`confirmed_by='system'`) был предложен в ТЗ и **отклонён** ([[ADR-018]]); его реализация сломала бы merge-gate-тест `test_exact_cache_match_does_not_commit_and_creates_no_mapping`.
- **[[ADR-019]] ([[ADR-019]]) — составной ключ:** `sku_mapping` ключуется `(scope_type, scope_id, supplier_external_id, source_key)`. Один и тот же текст строки от **разных поставщиков** может указывать на разные SKU POS — без поставщика в ключе это коллизия.
- **`esupl_item_id` (int) vs `pos_ingredient_id` (str):** одна сущность Esupl в двух представлениях — int-копия каталога для payload (draft) и str-якорь identity в `sku_mapping`/на строке (commit); `pos_ingredient_id == str(esupl id)`.
- **Авторитет единицы (D2):** единица в payload берётся из POS (`esupl_unit_id`); OCR-единица — толерантная кросс-проверка в `validate_ingredient_on_commit` (блокировать только если **обе** заданы и различаются).

**Обучающая петля (moat растёт), persist-then-commit ([[ADR-020]]):** сопоставление каждой строки → SKU записывается **отдельным клиентским** вызовом `POST /ingredients/mappings` (`method='manual'`, `confirmed_by` = аутентифицированный пользователь), который FE делает в `InvoiceWorkbench.onSend` **перед** мутацией `sendInvoice`. Это отдельная транзакция, **а не побочный эффект submit-эндпоинта** — submit лишь читает mapping при commit resolve. `source_key` — **сырой текст строки** (не имя SKU из каталога); в send-payload `description` несёт тот же сырой текст. Нормализация — на backend (`normalize_source_key`, SSOT), а FE-нормализация её зеркалит (golden-vector parity-тест). Persist происходит **ПЕРЕД** send, поэтому подтверждённый mapping переживает reject первой накладной — иначе fail-closed reject не дал бы moat инициализироваться. Петля раньше жила в localStorage; она целиком мигрирована на backend.

Подробнее: [[sku-identity-resolver]], [[DEC-0011]], [[DEC-0013]].

## 12. Поставщики: гибкие критерии

`Supplier.criteria` — JSONB; определения живут в registry `app/domain/supplier_criteria.py` (`CriterionDef`: объём, срок доставки, дни, режим оплаты, отсрочка). Валидация против registry происходит на уровне API (невалидное → 422; неизвестные ключи тихо отбрасываются). Новые критерии добавляются редактированием registry, без миграций. Аналитика потребления (REQ 1b) — модель существует (шов), потребитель отложен по checkpoint. FE-поля карточки поставщика (страница поставщиков, селектор поставщика) **существуют**.

Подробнее: [[supplier-criteria-registry]], [[suppliers]].

> **коррекция doc↔code:** резолвинг поставщика (`_resolve_supplier`) использует **смешанный score, trigram 0.65 + token Jaccard 0.35, минимальный порог 0.4** (НЕ «Jaccard ≥ 0.5»). Порядок: приоритет tax_id, затем смешанный fuzzy-score. FE-страница поставщиков, селектор поставщика, breadcrumbs и footer **существуют** (устаревшее утверждение об их отсутствии отозвано).

## 13. Интеграция Esupl (read-only)

Реальные эндпоинты (Bearer-токен тенанта на каждом чтении):

| Назначение | Эндпоинт |
|---|---|
| Поставщики | `GET /teams/{id}/following?is_virtual=1` |
| Каталог (поиск) | `GET /teams/{id}/products` (server-side `product_name` LIKE-поиск) |
| Одна позиция (commit-валидация) | `GET /teams/{id}/products?id=` |
| Накладные | `GET /teams/{id}/orders` |
| Запись | `POST /teams/{id}/outgoing-invoices` — **за тумблером `ERP_WRITE_ENABLED` (OFF)** |

`get_esupl_access(session, org_id) → (team_id, token)` — SSOT доступа к POS (4 места: список/синк поставщиков, каталог, накладные, commit). `EsuplErpProvider` — единственная реализация ERP, `requires_vpn=False` (Esupl доступен напрямую). При OFF `write_invoice` возвращает синтетический `esupl-prepared-<number>` **без обращения к Esupl**; при ON тот же путь POSTит реальный payload. Поверхность чтения: [[erp-esupl-integration]]. Требование: [[erp-esupl-integration]].

> **Открытый gate [[VER-021_ESUPL_DURABILITY_TEST]]:** durability `pos_ingredient_id` (стабилен ли id при edit/delete-recreate в Esupl) **НЕ** подтверждён эмпирически; проба требует ЗАПИСИ в sandbox (team 17957) → **owner-run**, и не может быть закрыта в read-only. **Merge остаётся гейтированным.** Также задокументировано расхождение эндпоинтов: commit-валидация читает `/teams/{id}/products?id=`, тогда как проба/документ VER-021 мутирует `/teams/{id}/ingredients/{id}` — разные ресурсы; пока не задокументировано `products.id == ingredients.id`, проба не сертифицирует точный id, который резолвит commit.

## 14. Модель данных и цепочка миграций

Все таблицы — SQLAlchemy 2.0 (async, типизированный `Mapped`) на PostgreSQL 16 + pgvector. `organization_id` — денормализованная жёсткая граница на каждой операционной строке (`RESTRICT`); внутри тенанта parent-child — `CASCADE`. Смешанные типы PK: UUID для структурных/каталожных таблиц, **int autoincrement** для `suppliers`/`invoices`/`invoice_lines`, int для `system_settings`.

14 сущностей (детали и колонки — в документах, здесь не дублируются):
[[organizations]] · [[subdivisions]] · [[users]] · [[memberships]] · [[refresh_sessions]] · [[suppliers]] · [[invoices]] · [[invoice_lines]] · [[ingredients]] · [[packings]] · [[sku_mapping]] · [[ingredient_cache]] · [[system_settings]] · [[integration_credentials]].

**Цепочка миграций (Alembic async): `0001` … `0009` + `1e12…` (OCR prompt).**

| Ревизия | Содержимое |
|---|---|
| `0001_initial` | squashed («consolidated 0001–0004»), `down_revision=None`; сначала `CREATE EXTENSION vector`, создаёт все таблицы; `downgrade()` дропает enum-типы, но **не** дропает `vector` |
| `0002_org_pos_token` | `organizations.esupl_api_token` (encrypted) — per-org POS-секрет (позже мигрирован) |
| `0003_integration_credentials` | таблица `integration_credentials` + частично-уникальное через sentinel-UUID COALESCE; **data-migrate** секретов из `system_settings`/`esupl_api_token` → scoped-строки; + `refresh_sessions.last_used_at` |
| `0004` | `sku_mapping` + `ingredient_cache` (moat + draft-кэш) |
| `0005` | `invoice_lines.pos_ingredient_id` (durable POS-identity на строке) |
| `0006` | поля карточки поставщика (`contact_name`, `phone`, `messenger`, `delivery_terms`, `min_order_amount`, …) |
| `0007`–`0008` | критерии поставщика JSONB / дальнейшая эволюция |
| `0009_sku_mapping_packing` | `packing` в `sku_mapping` ([[ADR-019]]) — **последняя нумерованная** |
| `1e12…` (OCR prompt) | OCR-промпт в `system_settings` (ревизия вне цепочки) |

`alembic/env.py` `include_object` исключает расширение `vector` (`EXCLUDE_NAMES={"vector"}`), чтобы autogenerate его не дропал.

> **коррекция doc↔code (мёртвый код, backlog `DEC-02`, `status: open`):** колонка **`invoice_lines.sku_embedding` `Vector(1536)` НЕ используется** — никто её не читает и не пишет, нет ANN-индекса (ivfflat/hnsw), нет embedding-провайдера, нет write-триггера. Это неиспользуемая placeholder-колонка для будущего семантического сопоставления, помеченная на dead-code-очистку ([[DEC-0011]]). Текущее сопоставление line→SKU использует fuzzy + LLM, а не эту колонку.

Сводка ER и поведение FK — в документах [[MOC]]; нормативные срезы — в [[multitenancy]].

## 15. Тестирование

- **Backend:** pytest + pytest-asyncio; тестовая БД — **реальный Postgres+pgvector** (не SQLite); исходящий HTTP мокается через respx. Непреложные вещи (fail-closed VPN, изоляция тенантов, admin auth) покрыты и **блокируют merge**. Выделенный маркер `merge_gate` (17 тестов durable-id + DEC-0013). **Сейчас: 209 passed.** Запуск: `docker compose run --rm backend pytest`.
- **Frontend:** vitest (+ RTL/jsdom); Playwright e2e отдельно. **Сейчас: 43 passed.**

## 16. Открытые gate и не-цели

**Открытые / гейтированные:**
- [[VER-021_ESUPL_DURABILITY_TEST]] durability — owner-run (запись в sandbox Esupl), merge гейтирован.
- `S1` read-only — эмпирически подтвердить, что фильтры `products?id=` / `product_name` ведут себя как ожидается; разрешить расхождение `/products` vs `/ingredients`.
- `DEC-02` — dead-code-очистка `sku_embedding` (backlog, open).
- Потребитель аналитики поставщиков (REQ 1b) — отложен по checkpoint.

**Не-цели Фазы 1:** Celery/очереди, облачный хостинг, RBAC-матрица/OAuth, self-registration, портал поставщика (только placeholder в схеме, [[ADR-017]]).

## Связанные документы

- Продукт и стратегия: [[product]] · Roadmap: [[roadmap]] · Глоссарий: [[glossary]]
- Эпики: [[LCOS-E1-platform]] · [[LCOS-E2-invoice-intake]] · [[LCOS-E3-sku-identity]] · [[LCOS-E4-suppliers]] · [[LCOS-E5-stabilization]]
- Требования: [[auth]] · [[multitenancy]] · [[config-secrets]] · [[secret-encryption]] · [[fail-closed]] · [[vpn-egress]] · [[provider-abstraction]] · [[erp-esupl-integration]] · [[sku-identity-resolver]] · [[invoice-status-machine]] · [[supplier-criteria-registry]] · [[global-requirements]]
- Решения: [[index]] · ключевые — [[ADR-001]] [[ADR-005]] [[ADR-006]] [[ADR-009]] [[ADR-011]] [[ADR-018]] [[ADR-019]] [[ADR-020]] · [[DEC-0011]] [[DEC-0013]]
