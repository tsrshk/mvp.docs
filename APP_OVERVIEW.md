---
doc: APP_OVERVIEW
title: LCOS — Обзор приложения (архитектура, потоки данных, состояние)
version: 1.0.0
status: current
updated: 2026-07-09
verified_against_code: 2026-07-09 (BE 209 tests / FE 43 tests green on Postgres)
owner: Ivan
trust_tier: 3
ssot_for: []
notes: Описательный обзор. При конфликте с кодом/01_ARCHITECTURE/04_DECISIONS — правы они.
---

# LCOS — Обзор приложения

## 1. Что это

**LCOS** — слой ввода и стратегической аналитики поверх ERP (Esupl). Продуктовая суть — **AI-управляющий**, который *делает работу*, а не рисует дашборды. Первый клин — **приёмка накладных**: фото → OCR → сопоставление строк с каталогом POS → валидация → payload в ERP + локальное сохранение.

**Чем НЕ является:** не POS, не операционный учёт, не бухгалтерия — это остаётся в Esupl. LCOS — **точка записи накладных** (write-point), read-only по отношению к чужим данным Esupl.

Фаза 1 — одна кофейня (Customer Zero), локальный запуск в Docker. См. `06_STRATEGY.md`, `ADR-001`.

## 2. Стек

| Слой | Технологии |
|---|---|
| Backend (`mvp.be`) | Python 3.12, FastAPI, SQLAlchemy 2.0 **async**, Alembic, Pydantic v2, PostgreSQL 16 + pgvector, httpx, SQLAdmin, uv |
| Frontend (`mvp.fe`) | React + TypeScript, Redux Toolkit (RTK Query), Vite, vite-plugin-pwa (mobile-first) |
| Инфра | Docker Compose: `db` (pgvector/pg16) + `backend` + `gluetun` (VPN-sidecar для egress к ИИ) |
| ИИ / OCR | Vision-LLM (Claude Vision); выбор провайдера в рантайме из `system_settings.ai_provider` |

## 3. Архитектура (backend)

Слои: `api` → `services` (use-cases) → `providers` / `repositories`.
`services` зависят **только от интерфейсов** провайдеров (`providers/*/base.py`), не от реализаций.

- **Провайдеры за `Protocol` + registry, по одной реализации на seam:** OCR = `claude`, ERP = `esupl`. Альтернативы не пишем до реального триггера (`ADR-009`).
- **Выбор реализации:** ERP — статически из env (`ERP_PROVIDER`); OCR/AI — из БД `system_settings` в рантайме (ленивый резолвер, чтобы write-пути не платили за DB-чтение).
- **Модули** гейтятся request-time (`modules/registry.py::require_module` → 404); роуты регистрируются всегда.

Роуты (`app/api/v1/routes/`): `health`, `organizations`, `ingredients` (каталог + SKU-mappings), `invoices` (submit), `suppliers` (карточки + criteria), `admin_system` (superadmin config).

## 4. Мультитенантность и авторизация

- **Тенант = организация.** `organization_id` денормализован в каждую операционную строку — тенантный запрос невозможен без скоупа. Операционные строки несут и `subdivision_id`. `users` — глобальная таблица; членство через `memberships`.
- Иерархия: `organization → subdivision → membership(user↔subdivision+role)`. `organization ↔ ровно один Esupl team`; `subdivision ↔ Esupl warehouse` (`ADR-004`, `ADR-008`).
- **Две независимые плоскости auth (не смешивать):** прикладные пользователи (JWT-access 15 мин в HttpOnly-куке + opaque refresh 30 мин, ротация, reuse-detection, argon2) и SQLAdmin-оператор (env + bcrypt, session-cookie) (`ADR-007`).
- Роли: `superadmin` (глобально) и `admin` (на подразделение).
- **Изоляция тенантов** покрыта тестами и блокирует merge.

## 5. Секреты и fail-closed

- Три уровня конфигурации (`ADR-005`): `.env` (boot/trust-root) → `system_settings` (несекретные рантайм-настройки) → `integration_credentials` (интеграционные секреты, Fernet-шифрование). Для уровней 2–3 **нет env-фолбэка**.
- **Fernet-конверт** `enc:v2:<key_id>:<token>`, версионируемый KEK, ротация без потери старых шифртекстов (`ADR-010`); чтение **без кэша** — ротация мгновенна (`ADR-011`).
- **Fail-closed везде (`ADR-006`):** нет POS-токена → Esupl 401; VPN down при `ai_vpn_enabled` → отказ, без тихого direct-egress; `ERP_WRITE_ENABLED` по умолчанию **False**.
- Фронт не хранит секретов; live-пути провайдеров только `backend` (`ADR-012`).

## 6. Ключевой поток: накладная

```text
Фото → recognize (OCR, vision-LLM)  →  InvoiceDraft (сырые строки + supplier из имени)
  → prepare()  [draft-контекст, толерантно]
      резолв поставщика; для каждой строки из ЛОКАЛЬНОГО каталога — числовые FK Esupl
      (esupl_item_id, esupl_unit_id, packing), tax_rate; строит EsuplOutgoingInvoice payload.
      Подсказки (fuzzy / LLM / exact-cache) живут ТОЛЬКО здесь. pos_ingredient_id НЕ трогается.
  → submit()  [commit-контекст, fail-closed]
      validate_draft (арифметика) → _resolve_commit_identities → Phase-2 live-валидация
      → статус: rejected / validated / prepared / written / failed
  → write_invoice()  ТОЛЬКО при ERP_WRITE_ENABLED (по умолчанию OFF → prepared-id, без записи)
```

Статусы: `rejected` (провал арифметики/идентичности/валидации) · `validated` (распознан, не готов к POS) · `prepared` (payload построен, запись выключена) · `written` (реально записан) · `failed` (запись упала).

## 7. Идентичность SKU — двухконтекстная модель (`DEC-0011` / `DEC-0013` вариант A)

Разделены две сущности:
- **Master data ингредиента** (`name`, `unit`, `category`) — чужой актив, владелец POS. LCOS никогда не authoritative.
- **Mapping** (`source_key` → идентичность) — актив LCOS, накапливаемый **moat**.

**Draft-резолв** (`prepare`, толерантно): payload из локального каталога; подсказки только тут.
**Commit-резолв** (`submit` → `_resolve_commit_identities` → Phase 2, **fail-closed**): durable `pos_ingredient_id` берётся **только из `sku_mapping`**, приоритет `subdivision → org`, и **только подтверждённая идентичность** (`method=manual` OR `confirmed_by IS NOT NULL`). Кэш / fuzzy / AI на commit **не участвуют**. Затем live-запрос в POS (`GET /teams/{id}/products?id=`; нет точного матча → `None`, без `items[0]`-фолбэка). None / mismatch / недоступность → **block + review**.

- **`DEC-0013` вариант A:** exact-cache-match БЕЗ подтверждённого mapping НЕ авто-коммитит и НЕ авто-создаёт mapping. Вариант C (авто-создание) был предложен в TZ и **отклонён** (`ADR-018`).
- **`DEC-0012` (`ADR-019`) — композитный ключ:** `sku_mapping` ключуется `(scope_type, scope_id, supplier_external_id, source_key)`. Причина: один и тот же текст строки от **разных поставщиков** может указывать на разные POS-SKU — без supplier в ключе это коллизия.
- **`esupl_item_id` (int) vs `pos_ingredient_id` (str):** одна сущность Esupl в двух представлениях — int-копия каталога для payload и str-якорь идентичности в `sku_mapping`/на строке (`pos_ingredient_id == str(esupl id)`).
- **`ingredient_cache`** — неавторитетный, draft-only, полностью пересобираем без потери mappings. VER-022 (scope-асимметрия) закрыт: кэша нет на commit-пути.
- **Unit-authority (D2):** unit в payload — из POS (`esupl_unit_id`); OCR-unit — толерантный cross-check (block только если оба заданы и различаются).

## 8. Learning loop (moat растёт)

- **Persist:** при отправке накладной каждая сопоставленная строка пишется в backend `sku_mapping` через `POST /ingredients/mappings` (`method='manual'`, `confirmed_by` = аутентифицированный юзер). Отправка = подтверждение человеком (`ADR-013`). **Persist идёт ДО send** (persist-then-commit), иначе fail-closed reject первой накладной не даёт moat инициализироваться.
- **Ключ:** `source_key` — **сырой текст строки** (не имя SKU из каталога); нормализация — на backend (`normalize_source_key`, SSOT). `supplier_external_id` — durable Esupl-id поставщика. `packing` — выбранная фасовка (восстанавливается на автозаполнении; влияет на записываемое количество через `baseQty`).
- **Apply:** на следующей накладной того же поставщика FE тянет `GET /ingredients/mappings?supplier_external_id=` и автозаполняет строки по `normalizeSourceKey(rawName)`. FE-нормализация зеркалит backend (проверено golden-vector паритет-тестом).
- Раньше loop жил в localStorage; мигрирован целиком в backend (localStorage-модуль удалён).

## 9. Интеграция Esupl (read-only)

Реальные эндпоинты (Bearer-токен тенанта на каждый read):
- поставщики: `GET /teams/{id}/following?is_virtual=1`
- каталог: `GET /teams/{id}/products` (серверный поиск по `product_name` LIKE)
- одна позиция: `GET /teams/{id}/products?id=` (commit-валидация)
- накладные: `GET /teams/{id}/orders`
- запись: `POST /teams/{id}/outgoing-invoices` — **за тумблером `ERP_WRITE_ENABLED` (OFF)**

`get_esupl_access(session, org_id) → (team_id, token)` — SSOT доступа к POS (4 места: list/sync поставщиков, каталог, накладные, commit).

**Открытый гейт `VER-021`:** durability `pos_ingredient_id` (стабилен ли id при edit/delete-recreate) эмпирически НЕ подтверждён; probe требует ЗАПИСИ в sandbox → **owner-run**, не закрывается в read-only. Merge остаётся gated. Также: расхождение эндпоинтов `/products?id=` (код) vs `/ingredients/{id}` (probe) — задокументировано.

## 10. Поставщики: гибкие критерии

`Supplier.criteria` — JSONB; определения живут в реестре `app/domain/supplier_criteria.py` (`CriterionDef`: объём, срок доставки, дни, режим оплаты, отсрочка). Валидация по реестру на уровне API (невалидные → 422; неизвестные ключи — молча отбрасываются). Новые критерии — правкой реестра, без миграций. Consumer-аналитика (REQ 1b) — модель есть (seam), потребитель отложен по checkpoint-решению.

## 11. Модель данных (ключевые таблицы)

| Таблица | Роль |
|---|---|
| `organizations`, `subdivisions`, `users`, `memberships` | тенант-иерархия |
| `integration_credentials` | секреты интеграций (Fernet), scope=org/subdivision |
| `ingredients` (+ `packings`) | локальный каталог (зеркало POS), org/subdivision scope |
| `ingredient_cache` | неавторитетный draft-кэш, scope-aware, пересобираем |
| `sku_mapping` | **moat**: `(scope, supplier_external_id, source_key) → pos_ingredient_id`, method/confidence/confirmed_by/packing |
| `invoices`, `invoice_lines` | сохранённые накладные; строка держит durable `pos_ingredient_id` |
| `suppliers` | зеркало Esupl + карточка (contacts, criteria JSONB) |

Миграции: `0001`…`0009` (последняя — `0009_sku_mapping_packing`) + `1e12…` (OCR-prompt в system_settings). Extension `vector` — в init-миграции; колонка `invoice_lines.sku_embedding` пока **не используется** (будущее семантическое сопоставление; помечена в `DEC-0011` как чистка dead-code).

## 12. Тестирование

- **Backend:** pytest + pytest-asyncio; тестовая БД — **реальный Postgres+pgvector** (не SQLite); исходящий HTTP мокается respx. Non-negotiables (fail-closed VPN, tenant-изоляция, admin-auth) покрыты и блокируют merge. Спец-маркер `merge_gate` (17 тестов durable-id + DEC-0013). **Текущее: 209 passed.**
- **Frontend:** vitest (+ RTL/jsdom для компонентов); Playwright e2e отдельно. **Текущее: 43 passed.**
- Запуск BE в контейнере: `docker compose run --rm backend pytest`.

## 13. Текущее состояние и что открыто

**Сделано и проверено (2026-07-09):** стабилизация DEC-0011/0013 (вариант A ратифицирован, вариант C отклонён), DEC-0012 композитный ключ + packing, полная миграция learning-loop localStorage → backend, S8-покрытие (criteria API, get_esupl_access, catalog sync, CriteriaFields), инфра-фикс сломанной `client`-фикстуры. Adversarial-ревью (22 находки) — критический bootstrap-баг persist-порядка исправлен.

**Открыто / gated:**
- `VER-021` durability — owner-run (запись в Esupl sandbox), merge gated.
- `S1` read-only — эмпирически подтвердить, что `products?id=` / `product_name` фильтры честятся; разрешить расхождение `/products` vs `/ingredients`.
- Consumer supplier-аналитики (REQ 1b) — отложен.

**Non-goals Фазы 1:** Celery/очереди, облачный хостинг, RBAC-матрица/OAuth, self-registration, портал поставщика (только схема-задел, `ADR-017`).

## 14. Карта документов

- `01_ARCHITECTURE.md` — нормативная архитектура (SKU identity & two-context resolver, миграции).
- `04_DECISIONS.md` (+ `__DEC-0011`, `__DEC-0013`) — ADR-журнал (ADR-001…019).
- `06_STRATEGY.md` — продукт/стратегия. `07_PHASES.md` / `08_PHASE1_SPEC.md` / `09_PHASE1_TASKS.md` — план.
- `TZ__STABILIZATION_2026-07-09__ALIGNED.md` — выровненный merge-gate текущего цикла.
- `VER-021_ESUPL_DURABILITY_TEST.md` — открытый durability-гейт.
