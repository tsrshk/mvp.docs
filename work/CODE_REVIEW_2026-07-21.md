---
doc: work
id: CODE_REVIEW_2026-07-21
type: work
title: Код-ревью BE/DB/FE 2026-07-21 — архитектура / SSOT-DRY / race conditions + прогресс исправлений
status: in-progress
updated: 2026-07-21
owner: Ivan
sources:
  - "[[constitution]]"
  - "mvp.docs/work/CODE_REVIEW_SSOT_DRY_RACE_2026-07-20.md"
---

# Код-ревью 2026-07-21 + трекер исправлений

**Метод:** adversarial-воркфлоу, 12 измерений (BE races auth/writes, BE SSOT/DRY, BE arch-layering, BE fail-closed, BE secrets, BE tenant/RBAC, DB schema, FE race/state, FE SSOT/DRY/FSD, FE arch/secrets, req/docs-drift). 87 агентов, 0 ошибок. Каждая находка проверена двумя adversarial-скептиками (линза корректности + линза контекста). Сырых находок 37, пережили верификацию **31** (1 high, 3 medium, 27 low), опровергнуто 6.

**Контекст:** прошлое ревью 2026-07-20 реально отработано (H1 refresh-ротация, H2/H3 partial-index каталога, H5 единый resolver, needs_reconcile, PO idempotency — на месте и корректны). Новые находки — периферия + **регрессии от свежих фич** (bootstrap 07-21, CSRF-деплой).

**Ветки исправлений:** `fix/code-review-2026-07-21` в mvp.be / mvp.fe / mvp.docs (базовые — `develop`). Один логический фикс — один коммит.

## Вердикт по трём осям

- **Архитектура (9 принципов):** крепко, 1 активная дыра (H-1 CSRF на FE рвёт auth-флоу в prod).
- **SSOT/DRY:** крепко с долгом (3 ре-инвенции + 7 doc-drift, главный — quickresto без ADR).
- **Race conditions:** крепко с долгом (idempotency-фундамент верный; остаток — 3 check-then-insert + concurrent-INSERT при отзыве сессий).

---

## Трекер исправлений (источник истины для восстановления)

Легенда статуса: 🔲 TODO · 🔄 IN-PROGRESS · ✅ DONE · ⏭️ DEFERRED (с обоснованием) · ❌ WONTFIX

| ID | Sev | Принцип | Файл | Кратко | Статус | Как исправлено |
|----|-----|---------|------|--------|--------|----------------|
| **H-1** | high | IV | mvp.fe backendRequest.ts | FE не шлёт X-CSRF-Token → prod рвёт refresh/change-pw/switch/logout | ✅ | Транспорт читает куку `lcos_csrf` и ставит `X-CSRF-Token` на небезопасных методах + на silent-refresh |
| **M-1** | med | II | mvp.be auth/*, repositories.py, models.py, 0025 | change_password не гасит concurrent-INSERT refresh | ✅ | Эпоха `User.sessions_valid_after` (миграция 0025) + `SELECT ... FOR UPDATE` на users в refresh/change/switch (сериализация) |
| **M-2** | med | VI | mvp.be repositories.py | supplier sync check-then-insert без SAVEPOINT → 500 | ✅ | `upsert_by_external_id` через `begin_nested`+IntegrityError→перечитка победителя (паттерн каталога) |
| **M-3** | med | III | mvp.be core/logging.py | bootstrap_superadmin_password → plaintext в логах | ✅ | Ключ добавлен в `_SENSITIVE_KEYS` + подстрочная эвристика (`password/secret/token/_key/...`) |
| **L-1** | low | — | mvp.be auth/service.py | switch_context теряет контекст при конкурентной ротации | ✅ | switch_context берёт `get_for_update(user)` — сериализуется с ротацией |
| **L-2** | low | VI | mvp.be price_list_service.py | конкурентный re-parse дублирует строки | ✅ | `SELECT ... FOR UPDATE` на строке PriceListUpload в начале parse |
| **L-3** | low | II | mvp.be erp/base.py, esupl/quickresto, invoice_service.py | write_invoice при OFF → ложный written в гонке | ✅ | Контракт placeholder СОХРАНЁН (F24-тест цел); submit детектит `is_write_disabled_placeholder` → `failed`, не `written` |
| **L-4** | low | I | mvp.be suppliers.py, ingredients.py, errors.py | нет POS-токена → 500 вместо 401 | ✅ | 401 на sync-роутах при token=None + хэндлер `httpx.HTTPStatusError`→502 (не 500) |
| **L-5** | low | VII | mvp.docs ADR-024, ADR-009, provider-abstraction | quickresto без superseding-ADR | ✅ | ADR-024 (активация второго ERP-шва, частично вытесняет ADR-009) + N5/index/changelog |
| **L-6** | low | VII | mvp.be sku_resolver.py, invoice_service.py | supplier_key инлайнится `or ""` | ✅ | SSOT `supplier_bucket(external_id, id)`; `supplier_key` делегирует, commit зовёт его |
| **L-7** | low | VII | mvp.be price_service.py, supplier_analytics.py | group-by-identity дублируется | ✅ | Хелпер `group_series_by_identity` в price_service, переиспользован |
| **L-8** | low | VII | mvp.be pos_access.py, deps.py, ingredients.py | тройная резолюция POS-провайдера | ✅ | SSOT `resolve_pos_provider_name(org)`, 3 сайта зовут его |
| **L-9** | low | VIII | mvp.be CLAUDE.md | api→repositories мимо services в CRUD | ✅ | Граница зафиксирована правилом в CLAUDE.md (тонкий CRUD допустим; use-case → services) |
| **L-10** | low | VII | mvp.be migration 0026 | FK в 0024 вне naming_convention | ✅ | `ALTER TABLE ... RENAME CONSTRAINT` → convention-имена (миграция 0026) |
| **L-11** | low | VII/FSD | mvp.fe entities/auth/lib/rbac.ts | shared импортит вверх из entities/auth | ✅ | rbac.ts+тест перенесены в entities/auth, экспорт из индекса, 5 импортёров + мок теста обновлены |
| **L-12** | low | VIII/FSD | mvp.fe entities/invoice/* | cross-import из соседних entities | ✅ | 11 файлов: `Sku`/`Supplier` импортятся из `@/shared/pos` |
| **L-13** | low | III | mvp.fe shared/llm/ | мёртвый LlmVendor.complete(apiKey) | ✅ | `types.ts` (browser-direct контракт) удалён, комментарий index.ts переписан |
| **L-14** | low | II | mvp.fe prepareInvoice.ts, invoicesApi.ts | пустая identity → submit без ключа | ✅ | Fallback `invoiceContentIdentity` (отпечаток тела) → стабильный idempotency-key |
| **L-15** | low | VI | mvp.fe backendRequest.ts | data as T без runtime-валидации wire-shape | ⏭️ | DEFER: низкий риск (доверенный same-origin бэк, контракт одной команды); untrusted-границы (LLM/OCR) уже валидируются. Триггер: сторонний/недоверенный источник ответа |
| **L-16** | low | VII | mvp.docs entities/invoices.md | enum без needs_reconcile | ✅ | Добавлен `needs_reconcile` в enum |
| **L-17** | low | VII | mvp.docs adr/DEC-0011.md | описание unit-mismatch теста ≠ Amendment | ✅ | Описание теста выровнено с Amendment (сверка против unit строки, нет ре-валидации маппинга) |
| **L-18** | low | VII | mvp.docs adr/index.md | frontmatter/changelog отстал | ✅ | frontmatter `updated:2026-07-21` + changelog v1.7.0/v1.8.0 (ADR-023/024) |
| **L-19** | low | VII | mvp.docs entities/sku_mapping.md | устаревшие line-refs | ✅ | Замена `models.py:464-507` на символьную ссылку `(SkuMapping, MappingMethod)` |
| **L-20** | low | VII | mvp.docs requirements/invoice-status-machine.md | смещённая цитата models.py | ✅ | Line-ref заменён символьной ссылкой; N5 обновлён под L-3 submit-детект |
| **L-21** | low | VII | mvp.docs requirements/global-requirements.md | «ADR-001..022» | ✅ | → `ADR-001..024` |
| **P-1** | med | II | mvp.be repositories.py | revoke_family SELECT-then-write | ✅ | Атомарный `UPDATE ... WHERE family_id AND revoked=false` |
| **P-2** | low | VI | mvp.be price_service.py, models.py, 0026 | проекция цены без уникальности | ✅ | partial unique `uq_supplier_prices_source_line` (0026) + SAVEPOINT в project_price_list_line |
| **P-3** | low | II | mvp.be invoice_service.py | итог write_invoice недолговечен | ✅ | Явный `commit()` исхода записи внутри `_submit` (симметрично pre-write commit) |
| **P-4** | low | I | mvp.be vpn_toggle.py | per-process кэш VPN → fail-open при >1 воркера | ✅ | Задокументировано допущение single-worker + триггер пересмотра (YAGNI, не чинить превентивно) |
| **P-5** | low | V | mvp.fe InvoiceWorkbench.tsx | AI-suggest под новым поставщиком | ✅ | `supplierIdRef` + сверка id на момент запроса перед apply |

**Опровергнуто верификаторами (6):** не включены (не подтвердились при чтении кода).

### Примечание по L-3 (важно)
Исходная рекомендация аудита (бросать типизированную ошибку при OFF) **отклонена**: поведение `write_invoice`→`esupl-prepared-<number>` при OFF — задокументированный контракт (F5/F10/**F24 merge-gate**) с закрепляющим тестом `test_esupl_write_disabled_does_not_post`. Менять его напрямую = ослабление merge-gate инварианта без ADR (нарушение принципа IX). Гонка закрыта на стороне `submit` (детект placeholder → `failed`), контракт провайдера сохранён. Формат placeholder вынесен в SSOT `erp/base.write_disabled_placeholder`.

---

## Порядок работ

1. **Сейчас (стреляет в prod):** H-1, M-3, M-2, M-1(+P-1).
2. **До F44 (erp_write_enabled):** L-3, P-3, L-4, L-1, L-2, P-2, P-4.
3. **Гигиена:** L-5 (ADR quickresto), L-6/L-7/L-8/L-9/L-10, FE L-11..L-15+P-5, doc-drift L-16..L-21.

## Evidence

- **BE:** `ruff check app/ alembic/` — ✅ clean; `python -m ast` парсинг всех модулей — ✅ OK; `alembic heads` — ✅ single head `0026`, цепочка линейна 0024→0025→0026. **DB-тесты (pytest+testcontainers) — deferred to CI**: локальная среда не поднимает Postgres+pgvector (socket.gaierror, нет образа/сети) — как и в прежних поставках (owner/CI прогоняет реальный merge-gate). Все правки проверены статически; ключевой контракт L-3 сверен с `test_esupl_write_disabled_does_not_post` (placeholder сохранён → тест зелёный).
- **FE:** `eslint` (изменённые файлы) — ✅ clean; `vitest run` — ✅ **377 passed / 33 files** (после фикса мока AdminPage под L-11); `tsc -b` — 13 ошибок `TS18048 'res.error' possibly undefined` в admin-табах **пред-существуют на чистом develop** (не связаны с ревью, не мои — проверено stash-ом), новых ошибок мои правки не внесли.
- **Не закоммичено агентом** до подтверждения владельцем (границы агента: изменения коммитит Ivan). Ветки `fix/code-review-2026-07-21` в трёх репо.

## Раунд 2 — перепроверка ремедиации (adversarial, 45 агентов)

Свежий проход по тем же осям нашёл регрессии/недочинки в самой ремедиации. Исправлено follow-up-коммитом.

| ID | Sev | Тип | Файл | Проблема | Статус | Фикс |
|----|-----|-----|------|----------|--------|------|
| **H-A** | high | regression | mvp.be alembic/0026 | имя ревизии 42 символа > VARCHAR(32) `alembic_version` → `upgrade head` падает всегда (деплой-блокер) | ✅ | Ревизия+файл → `0026_price_proj_uq_fk_naming` (28) |
| **H-B** | high | incomplete | mvp.be auth/service.py | reuse-detection: `revoke_family` откатывается тем же `raise 401` (get_session rollback) → kill-switch кражи не срабатывает | ✅ | `await session.commit()` ДО raise в ветке reuse |
| **H-C** | high | incomplete | mvp.be auth/service.py | `/auth/refresh` не перевыпускает CSRF-куку → истекает через 30 мин → silent-refresh 403 → logout | ✅ | `issue_csrf_cookie` в refresh_tokens при csrf_enabled |
| **M-A** | med | incomplete | mvp.fe invoicesApi.ts | L-14 fallback по `\|\|` (truthiness): пробельный номер `' '` обходит content-fallback → нет idempotency-key → дубль | ✅ | `.trim()` перед `\|\|` |
| **M-B** | med | incomplete | mvp.be alembic/0026 | UNIQUE-индекс без дедупа → падение при уже накопленных дублях (P-2 до фикса) | ✅ | DELETE дублей (row_number) перед create_index |
| **L-b** | low | incomplete | mvp.be main.py | L-8 неполон: main.py:48,97 инлайнят `org.pos_provider or erp_provider` мимо SSOT | ✅ | `resolve_pos_provider_name(org)` |
| **L-c** | low | incomplete | mvp.be erp/base.py | placeholder-детект по голой подстроке `-prepared-` (риск false-positive на реальном id) | ✅ | Якорный regex `^[a-z0-9_]+-prepared-` |
| **L-d** | low | incomplete | mvp.fe prepareInvoice.ts | 32-бит djb2 → коллизия → ложный 422 | ✅ | 64-бит `stableHash` (djb2+sdbm) |
| **L-f** | low | incomplete | mvp.be ingredients.py | L-4 не покрыл read-эндпоинты (account есть, token нет → 502) | ✅ | list/search возвращают `[]` при token=None |
| **L-a** | low | missed | mvp.be order_service.py | PO-переходы confirm/cancel/replace_lines check-then-update без row-lock | ✅ | `_lock_order` = `refresh(order, ["status"], with_for_update=True)` в начале трёх переходов (раунд 3) |
| **L-e** | low | tradeoff | mvp.fe prepareInvoice.ts | контент-отпечаток: две БАЙТ-идентичные безномерные накладные того же дня коллидируют | ⏭️ | DEFER (осознанный tradeoff): условие патологическое (нет номера + идентичны + тот же день); reload-dedup важнее; пользователь различает добавив номер |

**Подтверждено корректным раундом 2:** эпоха сессий M-1 не самоблокирует свежую сессию (transaction_timestamp равенство + строгий `<`, DB-clock без skew); порядок локов users→refresh_sessions единый (нет deadlock); F24-тест placeholder цел; upsert/savepoint паттерны эквивалентны.

## Раунд 3 — стабилизация качества (перед живой регрессией)

- **FE tsc теперь ЗЕЛЁНЫЙ** ✅ — исправлены все 13 пред-существующих `TS18048 res.error possibly undefined` (admin-табы): `'error' in res` не убирал `undefined` из union `{data}|{error?:undefined}` → заменено на сужение по truthiness `if (res.error)`. Приведены к одному паттерну и login/change-password (было `'error' in res`). Тип ошибки — `{message}` (fakeBaseQuery), runtime-поведение идентично.
- **L-a закрыт** (PO row-lock).
- **РЕКОМЕНДАЦИЯ по тест-фикстуре (не тронуто — CI-side):** `tests/conftest.py::_session_override` yield-ит общую сессию БЕЗ прод-обёртки `get_session` (commit на успехе / rollback на исключении). Из-за этого класс багов «пишем-и-бросаем» (как H-B: `revoke_family` + `raise 401`) невидим сьюту — запись ложно переживает исключение. Правку НЕ вносил: она высокорисковая и непроверяема без Postgres, а взаимодействие с mid-request `session.commit()` тонкое; чинить на CI с реальной БД (обернуть override в savepoint-эквивалент commit/rollback). H-B-фикс проверить отдельным тестом, воспроизводящим boundary.

## Раунд 4 — финальный gate (go/no-go перед живой регрессией)

Вердикт workflow: **GO для single-user живой регрессии, 0 блокеров.** Найдены и закрыты пробелы консистентности, которые M-1 не покрыл:

| ID | Sev | Ось | Файл | Проблема | Статус | Фикс |
|----|-----|-----|------|----------|--------|------|
| **G-1** | med | race | mvp.be users.py:reset_password | M-1 закрыл эпоху только для self-service change_password; админский reset_password (сброс СКОМПРОМЕТИРОВАННОГО аккаунта — важнее) не ставил `sessions_valid_after` → та же concurrent-INSERT гонка открыта | ✅ | `sessions_valid_after=func.now()` в reset_password + deactivate_user (симметрия) |
| **G-2** | low | fail-closed | mvp.be auth/service.py:switch_context | не проверял `is_active`/эпоху (в отличие от refresh_tokens) → уцелевший ряд мог выпускать access через /switch | ✅ | Добавлены проверки `not is_active`→401 и `created_at < sessions_valid_after`→401 |
| **G-3** | low | ssot | mvp.be esupl.py:350, quickresto.py:376 | placeholder-id строил провайдер строковым литералом вместо `self.name` | ✅ | `write_disabled_placeholder(self.name, ...)` |
| **G-4** | low | correctness | mvp.be bootstrap.py | не элевейтит существующего non-superadmin с тем же email (необычное seeded-состояние; путь пустой prod-БД не затронут) | ⏭️ | DEFER: edge вне prod-first-run; при желании — форсить is_superadmin или падать громко |

**Что проверить первым в живом прогоне** (статикой не ловится): bootstrap→first-login→forced-change сквозняк; cookie-auth+CORS+CSRF по-живому (csrf_enabled в dev-grade); first-run пустое состояние супер-админа (0 орг / null context не роняет шелл); `alembic upgrade head` на свежем Postgres (0026 dedup+index+rename); erp_write fail-closed по факту; PO-переходы 409 на повторном confirm.

**Вердикт по осям после 4 проходов:** архитектура — **стабильно** (шов PosProvider цел, FSD держится, SSOT-хелперы единственны, alembic single-head); SSOT/DRY — **стабильно**; race — **закрыто на всех путях отзыва** (change/reset/deactivate ставят эпоху; refresh/switch её уважают; reuse-детект коммитит до raise; PO под row-lock). Остаточный concurrency-долг — только conftest-фикстура (test-only, CI-side).

## Осталось владельцу
- Прогнать полный BE `pytest -m merge_gate` + весь сьют на CI (реальный Postgres) — подтвердить M-1/M-2/H-B/L-3/P-2 регрессиями (локально testcontainers недоступны).
- Выровнять `_session_override` под прод-семантику (см. раунд 3) — иначе «write-then-raise» баги невидимы.
- L-15 (wire-shape) и L-e (контент-коллизия) — осознанные DEFER (см. таблицы).
