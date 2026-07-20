# Код-ревью: SSOT / DRY / race conditions / drift требований — 2026-07-20

Метод: adversarial-воркфлоу, 10 измерений (BE races ×2, BE SSOT, BE DRY, BE tenant/security, BE req-drift, FE SSOT/DRY, FE race/state, docs-consistency, BE migrations). Каждая находка проверялась отдельным скептиком, задача которого — **опровергнуть** (по умолчанию REFUTED). 58 агентов, 0 ошибок. Сырых находок 47, пережили верификацию **43** (41 CONFIRMED, 2 PLAUSIBLE, 4 опровергнуты).

Итог по серьёзности (после коррекции верификаторами): **5 high · 19 medium · 19 low**. Категории: race-condition 13, dry 14, ssot 7, requirements-drift 8, correctness 1.

> Многие проблемы гонок **сегодня не «стреляют»**, т.к. запись в ERP закрыта флагом `ERP_WRITE_ENABLED` (default off) — но это долг, который активируется на F44 (live-closeout).
>
> **СТАТУС 2026-07-20: все находки отработаны** (ветка `fix/code-review-2026-07-20` в mvp.be/mvp.fe/mvp.docs, один фикс — один коммит). Дефекты и DRY/SSOT исправлены с тестами; drift-требования приведены в соответствие правкой доков; RBAC-пункт критика **опровергнут** (см. ниже — Role в Phase 1 = только admin, матрица прав = задокументированный non-goal, код не менялся); `ingredient_cache` помечен reserved (схема есть, runtime не подключён — не удаляли: инварианты стережёт merge-gate). BE 329✓ / FE 357✓, tsc/ruff чисто.

---

## HIGH (4 различных корня; #3 и #5 — один баг из двух измерений)

### H1. Гонка ротации refresh-токена — два живых токена + отключение reuse-detection
`app/auth/service.py:138` (`refresh_tokens`, тот же паттерн в `switch_context:229`)
`get_by_token_hash` → проверка `row.revoked` → мутация — без `FOR UPDATE`, без `UPDATE ... WHERE revoked=false`, без version-guard. Два параллельных запроса с одной refresh-cookie (две вкладки / retry / attacker+victim) оба читают `revoked=False`, оба проходят reuse-check, оба выпускают новый токен той же family. Результат: **два валидных refresh-токена на одну ротацию, сигнал кражи не срабатывает**. Fix: атомарный `UPDATE refresh_sessions SET revoked=true WHERE token_hash=:h AND revoked=false`, `rowcount==0` → 401 + `revoke_family`; минтить новый токен вправе только транзакция, перевернувшая флаг.

### H2/H3. Дублирование org-level каталога ингредиентов при конкурентной синхронизации
`app/services/catalog.py:77` + корень в схеме `app/db/models.py:412`
`sync_catalog_from_erp` дедупит только in-memory сетом `existing_keys`, прочитанным в начале транзакции; DB-гарда нет. `UniqueConstraint(organization_id, subdivision_id, external_id)` **не срабатывает**, потому что у всех синкнутых строк `subdivision_id IS NULL`, а Postgres считает NULL-ы различными. Два параллельных `POST /ingredients/sync-from-erp` (или bootstrap на старте против ручного синка) → дубли строк на один SKU. Дальше `get_by_external_id` (`repositories.py:178`, `scalar_one_or_none`) → `MultipleResultsFound` → **HTTP 500** на этом SKU; `sku_resolver` строит `external_id→id` произвольно по одному из дублей. Fix: частичный уникальный индекс `ON ingredients(organization_id, external_id) WHERE subdivision_id IS NULL AND external_id IS NOT NULL` + `INSERT ... ON CONFLICT DO NOTHING`. Автор уже применил COALESCE-sentinel индекс для `integration_credentials` (`models.py:499-505`) — тот же приём просто не перенесён на ingredients.

### H4. AI-автоподбор SKU затирает ручной выбор пользователя, сделанный «в полёте»
`mvp.fe/src/widgets/invoice-workbench/ui/InvoiceWorkbench.tsx:274`
После OCR запускается ~2-3с авто-suggest на все несматченные строки. Если пользователь за это время вручную выбрал SKU (`mappingState='unsaved'`), пришедший ответ диспатчит `lineSkuPicked` на тот же `lineId` и **молча заменяет ручной выбор догадкой модели** (+ сбрасывает packing). Fix: перед применением каждого suggestion перечитывать живую строку из стора и пропускать те, у кого уже есть `skuId` или `mappingState` ∈ {unsaved, saved}; либо per-run токен и отмена батча, если `skuId` целевой строки изменился.

### H5 (dry, но high-impact). Дублируется алгоритм scope-precedence sku_mapping между draft- и commit-резолверами
`app/services/invoice_service.py:455` vs `SkuResolver`
Precedence + «subdivision wins» реализованы дважды. Если правило поменять в одном месте — **preview показывает один SKU, commit пишет в ERP другой** (тихий mis-mapping, подрыв доверия к «рву»). Fix: единый scoped-resolver с опциональным `commit_eligible`-предикатом.

---

## RBAC / вертикальные привилегии — ОПРОВЕРГНУТО при проверке (2026-07-20)

> **Коррекция.** Completeness-критик утверждал, что `Role` = admin/operator и что «operator == admin» из-за неэнфорса роли. Это **ложная посылка**: enum `Role` в Phase 1 несёт **только `admin`** (`app/db/models.py`), app-plane роли «operator» не существует (operator — это отдельная плоскость sqladmin-operator, ADR-007). Каждый tenant-пользователь и есть admin по дизайну. Доки прямо фиксируют: *«Матрицы прав нет — это явный non-goal»* (`roles/admin.md:36`, `roles/member.md:34`). Реализовывать ограничительную RBAC-матрицу означало бы **нарушить задокументированное решение** и сломать одноролевую модель — поэтому кода не меняли (работает по спеке). Осталось два уровня авторизации, как и задумано: `superadmin` (флаг) и `admin` (роль membership); плюс POS-config проверяет admin данной org (`organizations.py:32`).

Мелочи оттуда же: stale-privilege окно на stateless access-JWT (bounded 15 мин, low); unbounded `list()` в `SupplierRepository`/`IngredientRepository` (растут через синк, low). Чистыми признаны: secret crypto, storage path-traversal, secret-in-logs.

---

## Ключевые MEDIUM

**Гонки/консистентность:**
- `invoice_service.py:378` — non-atomic dual-write: Esupl создал документ, ответ потерян (timeout/5xx) → LCOS пишет `failed`, replay по тому же ключу **не повторяет write** → тихая перманентная расходимость. Активно только при `ERP_WRITE_ENABLED`. Fix: idempotency-token в Esupl + статус `needs_reconcile` вместо терминального `failed`.
- `ingredients.py:145` (и `price_list_service.py:_learn_mapping`) — SkuMapping upsert = check-then-insert без `ON CONFLICT`/`IntegrityError` → конкурентный create даёт **500**. Паттерн-эталон уже есть в `invoice_service.py:411` (SAVEPOINT+replay), просто не применён.
- `InvoiceWorkbench.tsx:201` — Send дважды-нажимаем в окне pre-send persist mapping; у инвойса с пустой identity нет idempotency-key → **дублирует POS-write**.
- `InvoiceImportPage.tsx:84` — OCR стартует до резолва списка поставщиков → распознавание на пустом списке.

**SSOT/DRY (BE):**
- `pos_access.py:41` — имена POS-провайдеров сравниваются строковыми литералами `=="esupl"/"quickresto"` вместо `CredentialProvider`/реестра (файл сам внутренне непоследователен: строка 45 — литерал, 49 — enum).
- `esupl.py:282` vs `quickresto.py` — `validate_ingredient_on_commit` (fail-closed commit-gate) продублирован целиком между двумя ERP-адаптерами.
- `repositories.py:202` — org_id scope-filter повторён дословно в каждом методе; `_scope` извлечён лишь для 2 из 6 tenant-репозиториев.
- `esupl.py:173` — `_get`/`_unwrap` egress-обёртки дублируются между esupl и quickresto (место для `erp/base.py`).
- `supplier_analytics.py:36` — `_identity()`, group-by-identity, change-pct дублируются с `PriceService`.
- `repositories.py:142` — subdivision-visibility filter копипастнут между `list()` и `search()`.

**SSOT/DRY (FE):**
- `format.ts:5` — **три** реализации `fmtDate`, две байт-в-байт, все расходятся у TZ-границ (перекликается с историей `parseIsoDate`).
- `OrdersPage.tsx:408` — деньги рендерятся ad-hoc `toFixed(2)` мимо `fmtMoney` SSOT.
- `purchaseOrder/types.ts:9`, `shared/pos/types.ts:185` — статус-энумы FE вручную зеркалят BE, нет codegen → тихий drift при добавлении статуса.

---

## Requirements / docs drift

- **DEC-0011** (`adr/DEC-0011.md:44`) — правило unit-mismatch MUST реализовано не как написано: сравнивается OCR-unit, а не unit на момент маппинга; нет ре-валидации маппинга.
- **invoice-status-machine.md:45** — заявленный failure-mode «строки без SKU дропаются при send» противоречит fail-closed блокировке в коде.
- **ingredient_cache** (`models.py:515`) — таблица смоделирована/мигрирована/задокументирована как рабочая, но в коде **ноль сайтов чтения/записи** (мёртвая схема).
- **E8/roadmap** помечают закупочный эпик «planned», а сам эпик и F43 — «done».
- **MOC.md** устарел: роспись фич обрывается на F71 (нет F72–F75); часть entity-доков не перечислена.
- Мелочи: `config-secrets.md:25` N2-реестр не содержит OCR-prompt settings; `DEC-0013.md:53` ссылается на несуществующий символ `_resolve_commit_identity`; `entities/purchase_orders.md:33` ссылается на несуществующий FK `invoices.purchase_order_id`; `effective_config.py:69` `Resolved.valid` всегда True (противоречит документированной семантике); `ADR-021` «F4» коллизится с `LCOS-F4-config-secrets`.

---

## Приоритеты исправления

1. **Сейчас (активно):** H1 (refresh-ротация), RBAC-разрыв, H2/H3 (частичный уникальный индекс — дёшево и убирает 500-е), H4 (FE-затирание выбора).
2. **До включения F44 (`ERP_WRITE_ENABLED`):** dual-write reconcile (`invoice_service.py:378`), FE double-submit Send (`:201`).
3. **Гигиена/анти-drift:** H5 + SkuMapping/next_version upsert через общий SAVEPOINT-паттерн; единый resolver; codegen статус-энумов; `fmtDate`/`fmtMoney` SSOT; чистка `ingredient_cache` (реализовать или удалить); синхронизация MOC/DEC/entity-доков.

Опровергнуто верификаторами (4): в отчёте не приводятся — не подтвердились при чтении кода.
