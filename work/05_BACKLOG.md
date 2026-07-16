---
doc: 05_BACKLOG
title: LCOS — Бэклог (выравнивание, решения, проверки, отложенное)
version: 1.3.0
status: current
updated: 2026-07-16
verified_against_code: n/a
owner: Ivan
supersedes: []
superseded_by: none
trust_tier: 2
ssot_for: [alignment-tasks, open-decisions, verifications, deferred-items]
---

# Бэклог

Открытые задачи текущей стадии. Источник — Часть 2 анализа соответствия. Классы: **ALIGN** (нарушение заявленного принципа, надо чинить), **DEC** (незакрытое решение, нужен выбор), **VER** (проверка ради цели «мочь тестировать»), **DEFER** (осознанно отложено).

Статусы тикета: `open | decided | in-progress | done`. Приоритет: `P0` (блокер стадии) · `P1` (важно) · `P2` (позже).

---

## ALIGN — нарушают заявленный принцип

- **[ALIGN-01] `encrypt()` пишет plaintext при пустом keyring** — `status: open` · `prio: P0`
  - Проблема: «dev fallback» противоречит fail-closed (ADR-006). Phase 1 крутится локально → это операционный путь. При незаданном `SECRETS_ENC_KEY` секреты лягут открытым текстом.
  - Действие: `encrypt()` без keyring → `RuntimeError`; startup-guard требует `SECRETS_ENC_KEY` всегда (снять исключение `APP_ENV=local`) **или** гарантировать валидный dev-KEK в `lcos.env.example`. Проверить `lcos.env.example`.
  - Готово, когда: запись секрета без keyring падает; локальный Phase 1 всегда шифрует.
  - Связи: ADR-006, ADR-010, REQ R2.2.

- **[ALIGN-02] Мёртвый код на фронте** — `status: open` · `prio: P1`
  - Удалить: `shared/llm` (кроме живых `stripCodeFence/clamp01/parseJsonSafe` → перенести в `shared/lib`), `shared/ocr/prompt.ts`+`parse.ts`, `shared/match/prompt.ts`+`parse.ts`, legacy browser-direct Esupl (`VITE_POS_PROVIDER=esupl`, `VITE_ESUPL_*`), устаревшие комментарии «mock/Gemini/Claude».
  - Не трогать: `shared/ocr/rules.ts` (живые хелперы).
  - Готово, когда: grep не находит браузер-директ LLM/ERP; сборка зелёная.
  - Связи: ADR-012, REQ R9.

- **[ALIGN-03] Устаревшие docstrings** — `status: open` · `prio: P2`
  - `ErpProvider.write_invoice` говорит «None → env token», код fail-closed. Переписать; проверить прочие docstrings на «env fallback».
  - Связи: ADR-006.

## DEC — незакрытые решения (нужен выбор)

- **[DEC-01] Gemini как второй OCR/AI-вендор** — `status: open` · `prio: P1`
  - Факт: `gemini` зарегистрирован; LLM-транспорт не за Protocol; двойная роль `resolve_ai_provider`. Нарушает ADR-009.
  - Варианты: (A) claude-only — удалить gemini + ветку + enum-значения, снять двойную роль. (B) два вендора — вынести LLM за Protocol+registry, тесты на оба, инвариант «OCR name ≡ ai_provider enum».
  - **Рекомендация: (A) claude-only.**
  - Связи: ADR-009, REQ R7.3.

- **[DEC-02] `invoice_lines.sku_embedding Vector(1536)`** — `status: open` · `prio: P2`
  - Факт: колонка не читается/пишется, нет ANN-индекса, нет провайдера эмбеддингов.
  - Варианты: (A) удалить колонку; (B) достроить семантический матчинг.
  - **Рекомендация: (A) удалить** (расширение pgvector оставить).

- **[DEC-03] `CredentialScope.subdivision`** — `status: open` · `prio: P2`
  - Факт: объявлен, не используется, нет рантайм-вызова.
  - **Рекомендация: удалить** (по «none planned»); если предвидится per-subdivision POS-токен — оставить с явным комментарием-задел.

- **[DEC-04] CSRF полусобран** — `status: open` · `prio: P1`
  - Факт: сервер умеет double-submit, но `csrf_enabled=False`, фронт токен не шлёт. Включение в проде молча ломает мутации.
  - **Рекомендация: явно отложить** + внести в прод-чеклист (включение требует правки `backendRequest.ts`).
  - Связи: REQ R-Deploy.

- **[DEC-05] FE строит candidate-set, бэк игнорирует** — `status: open` · `prio: P2`
  - Варианты: (A) бэк принимает пред-фильтр; (B) FE перестаёт строить для backend-пути (оставить для mock).
  - **Рекомендация: (B).**

- **[DEC-06] `esupl.list_suppliers`/`list_ingredients` без токена** — `status: open` · `prio: P2`
  - Факт: зовут `_auth_headers()` без токена; docstrings — вне критического пути.
  - **Рекомендация: удалить или закрыть guard'ом** как недостижимые в Phase 1.

- **[DEC-07] Multi-page OCR теряет страницы** — `status: open` · `prio: P1`
  - Факт: FE `MAX_INVOICE_PAGES=3`, но шлётся `pages[0]`; бэк одностраничный → стр. 2–3 теряются молча.
  - Варианты: (A) multi-page на бэке; (B) `MAX_INVOICE_PAGES=1` сейчас, убрать тихую потерю.
  - **Рекомендация: (B) сейчас, (A) как фича.**

- **[DEC-08] POS-токен: кто ставит** — `status: open` · `prio: P2`
  - Факт: помимо SQLAdmin, org-admin ставит токен через `PUT /organizations/{id}/pos-config`.
  - **Рекомендация: оставить** (tenant-scoped, корректно для Phase 2). Подтвердить приемлемость для Phase 1.

## VER — проверки (нужны для цели «мочь тестировать»)

- **[VER-01] Merge-блокирующие тесты на non-negotiable** — `status: open` · `prio: P0`
  - Подтвердить/написать: fail-closed VPN, выбор egress-клиента, gating `ERP_WRITE_ENABLED`, tenant-isolation, refresh reuse-detection. Реальный Postgres+pgvector (testcontainers), egress через `respx`.
  - Готово, когда: тесты существуют и зелёные; закрывают перечисленное.
  - Связи: REQ R8, R3, R5; цель стабилизации.

- **[VER-02] argon2 vs bcrypt** — `status: open` · `prio: P1`
  - Подтвердить: `users.password_hash` реально argon2; bcrypt только для SQLAdmin-оператора; пути не перепутаны.
  - Связи: ADR-007, REQ R3.8.

- **[VER-03] Двойная роль `resolve_ai_provider`** — `status: open` · `prio: P1`
  - Подтвердить: нельзя зарегистрировать OCR-имя вне enum `ai_provider`. Частично снимается при DEC-01=(A).
  - Связи: DEC-01, REQ R7.3.

## Трассировка в Фазу 1 (`08_PHASE1_SPEC.md`)

Какие тикеты адресуются фичами ТЗ Фазы 1 (тикеты остаются `open` до сдачи фичи; закрывает их агент при сдаче по правилу PR):

| Тикет | Рекомендация | Фича | Примечание |
|---|---|---|---|
| ALIGN-01 | encrypt → RuntimeError | **F1.4** | fail-closed шифрование + startup-guard |
| ALIGN-03 | переписать docstrings | **F0.3** REQ-4 | докстринг `write_invoice` заодно с правкой путей |
| DEC-02 | (A) удалить колонку | **F1.3** | дроп `sku_embedding` |
| DEC-05 | (B) FE не строит для backend | **F1.3** | точка правки `invoicesApi.ts:68,139` |
| DEC-06 | закрыть/починить пути без токена | **F0.3** | пути team-scoped + резолв токена per-org |
| DEC-07 | (B) `MAX_INVOICE_PAGES=1` | **F5.3** REQ-4 | потеря страниц в `shared/ocr/providers/backend.ts:43` |
| VER-01 | merge-блокирующие тесты | **F1.5** | + pytest-маркер `non_negotiable` |
| DEFER-04 | backend-idempotency | **F5.2** | заменяет браузерный `sentRegistry` |

Вне Фазы 1 (по `06_STRATEGY.md` стоп-лист / отложено): DEC-01 (Gemini — claude-only, не сейчас), DEC-03 (`CredentialScope.subdivision`), DEC-04 (CSRF — прод-чеклист), DEC-08 (POS-токен — оставить), VER-02/03, DEFER-01/02/03/05/06.

## DEFER — осознанно отложено на текущей стадии

- **[DEFER-01]** Rate-limiting на `/auth/login` (single-tenant local; → прод-чеклист).
- **[DEFER-02]** CI-пайплайн (non-negotiables как merge-gate).
- **[DEFER-03]** Прод-хардненинг: `Dockerfile.prod`, Hetzner, `COOKIE_SECURE=true`, `CSRF_ENABLED=true`, реальный `SECRETS_ENC_KEY`.
- **[DEFER-04]** Бэкенд-idempotency ключ (заменит per-browser `sentRegistry`).
- **[DEFER-05]** `localos.lastWarehouseId` без org-scope (низкий риск).
- **[DEFER-06]** FSD-линтер (steiger/dependency-cruiser); сейчас — ревью-конвенция.

---

## DEC-0011 — SKU-идентичность и learning-loop moat (влито из `05_BACKLOG__append_2026-07-08` 2026-07-16)

Тикеты рабочего потока [[DEC-0011]] (двухконтекстная SKU-идентичность + learning-loop). Слиты из бывшего append-файла; нумерация сквозная — коллизий с ALIGN-01..03 / DEC-01..08 / VER-01..03 / DEFER-01..06 нет.

- **[VER-021] Стабильность `pos_ingredient_id` в Esupl** — `status: in-progress` · `prio: P0` (линчпин DEC-0011)
  - Полное описание, сценарии S1–S6 и критерии приёмки — [[VER-021_ESUPL_DURABILITY_TEST]] (SSOT). Здесь — только ссылка.
  - Кратко: durable ли ID при edit (переименование/`unit`/категория), при delete + пересоздании, при merge/split.
  - **Blocks:** DEC-0011 Phase 2, ALIGN-015.

- **[VER-022] Scope каталога ингредиентов в Esupl** — `status: open` · `prio: P1`
  - Вопрос: каталог ингредиентов per-subdivision или общий на организацию?
  - Acceptance: scope зафиксирован в [[architecture]]; определено значение по умолчанию для `ingredient_cache.scope_type` (`org` | `subdivision`). Для одной кофейни неблокирующе, модель уже scope-aware.

- **[ALIGN-014] READ-seam `ERPProvider` (`list_ingredients`, `get_ingredient`)** — `status: open` · `prio: P0`
  - Ввести READ-контракт провайдера ERP: `list_ingredients(scope) -> [Ingredient]`, `get_ingredient(pos_ingredient_id) -> Ingredient | None`. Одна реализация (Esupl) за seam. Сейчас интеграция — write-point only; дыра под F5–F10 и прямой пререк DEC-0011 Phase 2.
  - Acceptance: seam + Esupl-реализация + integration-тест против sandbox либо зафиксированного контракта. `get_ingredient` возвращает `None` (не бросает fallback) при отсутствии — решение о блокировке принимает commit-путь.
  - **Blocks:** DEC-0011 Phase 2, F5–F10.

- **[ALIGN-015] Схема `ingredient_cache` + `sku_mapping` + Alembic migration** — `status: open` · `prio: P0`
  - Реализовать модель данных DEC-0011: две таблицы, SQLAlchemy 2.0 async, Alembic-миграция, регистрация в SQLAdmin для инспекции.
  - Acceptance: `sku_mapping` БЕЗ FK на `ingredient_cache.id` (durable ID only); UNIQUE-констрейнты по эскизу DEC-0011; embedding/`pgvector` в этой модели не вводится; проходит `test_mapping_has_no_fk_to_cache`.
  - **Depends on:** VER-021 (форма якоря), VER-022 (значение scope).

- **[ALIGN-016] Merge-blocking тесты инвариантов DEC-0011** — `status: open` · `prio: P0`
  - Реализовать как merge-blocking (правило «тесты на архитектурные non-negotiables»): `test_cache_rebuild_preserves_mappings`, `test_commit_blocked_when_pos_unavailable`, `test_commit_blocked_when_pos_id_missing`, `test_commit_blocked_on_unit_mismatch`, `test_matching_resolves_subdivision_before_org`, `test_mapping_has_no_fk_to_cache`.
  - Acceptance: все зелёные; настроены как блокирующие merge (pytest + testcontainers).
  - **Depends on:** ALIGN-014, ALIGN-015.

- **[DEC-0012] Правило `source_key`: нормализация и ключ mapping** — `status: open` · `prio: P1` (решить до массового накопления mappings)
  - Вопрос: что является ключом `sku_mapping` — нормализованный текст строки накладной? supplier product code? композит `(supplier_id, supplier_product_code)` с fallback на нормализованный текст?
  - Почему важно: ключ определяет качество и переносимость mapping (целостность moat). Слишком свободный текст → грязный, нестабильный ключ; supplier code стабильнее, но не всегда доступен. Миграция ключа задним числом — дорогая.
  - Предварительная рекомендация: ключ = `(supplier_id, normalized_line_description)`; при наличии supplier product code использовать его как приоритетный компонент. Финализировать ДО накопления реальных mappings.
  - Acceptance: правило нормализации зафиксировано (регистр, пробелы, единицы в тексте, транслитерация) + состав ключа + зафиксировано в DEC и [[architecture]].

- **[DEFER-016] Delta-sync / webhooks каталога ингредиентов** — `status: deferred`
  - Инкрементальная синхронизация каталога (webhooks / delta polling) вместо TTL + on-open + on-commit.
  - Rationale отсрочки: Customer Zero = сотни позиций; TTL-refresh + refresh при открытии накладной + re-валидация на commit достаточны. Строить сейчас — переусложнение.
  - Trigger на пересмотр: размер каталога / латентность refresh / жалобы на staleness matching. Реализуется за существующим seam `ERPProvider` без изменения DEC-0011.

---

## DONE — завершённые работы (вне текущей очереди фич)

### SKU Factory Pattern & Dropdown Mechanism (2026-07-08)

**Статус:** `done` · **Приоритет:** P0 (foundation для F1.2, F4.2, F4.5)  
**Выполнено:** ultracode с многоагентной орхестрацией  
**Документация:** `mvp.docs/SKU_MECHANISM.md`

**Что сделано:**

- ✅ **Backend (4 файла):**
  - `mvp.be/app/services/sku_service.py` — SKUService factory с поиском, группировкой, org/subdivision логикой
  - `mvp.be/app/db/repositories.py` — добавлены `.search()` методы (IngredientRepository, SupplierRepository)
  - `mvp.be/app/api/v1/routes/ingredients.py` — API: `/search`, `/by-supplier/{id}`
  - `mvp.be/app/api/v1/routes/suppliers.py` — API: `/search`

- ✅ **Frontend (10 файлов в `mvp.fe/src/shared/sku/`):**
  - Factory pattern: `IngredientSKUFactory`, `SupplierSKUFactory`
  - Hook: `useSkuSearch` (дебаунс 300ms, группировка, live-search)
  - Component: `SKUDropdown` (универсальный, реиспользуемый)
  - Types, exports, README

**Ключевые особенности:**

- Live search (case-insensitive partial match)
- Smart grouping: search results → supplier items → all others (alphabetical)
- Org/subdivision aware: new=org, existing=subdivision
- No ESUP writes (purely local)
- Reusable factory interface

**Почему это important:**

- Foundation для маппинга SKU (F1.2: sku_mappings, авто-маппинг, localStorage миграция)
- Foundation для заказов (F4.2: purchase-draft, prefill, AI-предложения)
- Foundation для запасов (F4.4: stock levels, reorder thresholds)

**Интеграция готова для:**

1. Invoice workbench (recognizer → dropdown с supplier grouping)
2. Purchase order form (F4.2)
3. Stock management (F3.3)

**Связи:** Заполняет пробелы найденные в анализе (вторая workflow). Готово к тестированию и интеграции.

---

## Журнал изменений
- 2026-07-16 v1.3.0 — влит `05_BACKLOG__append_2026-07-08` (workstream DEC-0011: VER-021/022, ALIGN-014/015/016, DEC-0012, DEFER-016); VER-021 сведён к ссылке на [[VER-021_ESUPL_DURABILITY_TEST]] (SSOT), append-файл удалён; front-matter version синхронизирован с журналом.
- 2026-07-08 v1.2.0 — добавлена DONE секция: SKU Factory Pattern & Dropdown (14 файлов, foundation для F1.2/F4.2/F4.5).
- 2026-07-03 v1.1.0 — добавлена секция «Трассировка в Фазу 1»: сопоставление тикетов (ALIGN-01/03, DEC-02/05/06/07, VER-01, DEFER-04) с фичами `08_PHASE1_SPEC.md`.
- 2026-07-02 v1.0.0 — создан из Части 2 анализа соответствия; заведены ALIGN/DEC/VER/DEFER.
