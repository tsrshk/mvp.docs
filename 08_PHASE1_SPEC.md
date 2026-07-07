---
doc: 08_PHASE1_SPEC
title: LCOS — ТЗ Фазы 1 по фичам (требования, AC, приёмка, референсы)
version: 1.3.0
status: current
updated: 2026-07-03
verified_against_code: 2026-07-03 (2 верификационных прохода + правки по вводным основателя: no-token/DTO-first Э0, F0.6 склад, F2.1 расширяемость условий, F4.3 канал-агностично)
owner: Ivan
supersedes: []
superseded_by: none
trust_tier: 2
ssot_for: [phase1-feature-specs, phase1-acceptance-criteria, phase1-validation-scenarios]
---

# ТЗ Фазы 1 — по фичам

**Назначение:** рабочий документ для агента-исполнителя. Каждая фича самодостаточна: требования (REQ), acceptance criteria (AC), сценарий приёмки владельцем и **проверенные референсы** (файлы, которые открыть/менять; паттерны-образцы; «не трогать»). Фичи сдаются и валидируются **по одной**. Контекст этапов — в `07_PHASES.md`; разбивка фич на подзадачи-юниты (T-коды) с оценками — в `09_PHASE1_TASKS.md`.

## 0. Общие требования ко всем фичам (Definition of Done)

- **G1. Слои BE:** `api → services → providers/repositories`; сервисы зависят только от `providers/*/base.py` (Protocols). Тенантные репозитории требуют `organization_id` в конструкторе.
- **G2. Каждая новая таблица** несёт `organization_id` (+ `subdivision_id`, если операционная), timestamps через миксины из `mvp.be/app/db/base.py` (`OrganizationScopedMixin`/`SubdivisionScopedMixin`), и — для данных с внешним источником — колонки `external_id` и `source`. Alembic-миграция с рабочим `downgrade()`, просмотрена после `--autogenerate`.
- **G3. Тесты BE:** pytest + testcontainers (реальный Postgres+pgvector, не SQLite), egress через respx. Тенант-изоляция новых эндпоинтов покрыта тестом (образец: `mvp.be/tests/test_tenant_isolation.py`).
- **G4. FE:** строгий FSD; `tsc -b && vite build` зелёный; UI-тексты русские, идентификаторы английские. Границу `mvp.fe/src/shared/pos/types.ts` не менять — расширения через локальные тип-оверлеи.
- **G5. Никаких новых фоновых задач** (Celery/APScheduler) — всё по явному запросу/кнопке. Никакой записи в Esupl, кроме существующего `write_invoice` за гейтом `ERP_WRITE_ENABLED`. Пробы Esupl — строго GET.
- **G6. Секреты** не попадают в логи и в git; ошибки — в едином envelope `{"error":{code,message}}` (`app/core/errors.py`).
- **G7. Ничего сверх ТЗ:** фичи из «НЕ строим» (`07_PHASES.md` §5) не реализовывать даже частично.

**Читать перед стартом любого этапа:** `mvp.be/CLAUDE.md` (поведенческий контракт; актуализирован 2026-07-03 — секреты/выбор провайдера/модули теперь описаны верно), `01_ARCHITECTURE.md` (карта систем), `04_DECISIONS.md` (ADR-001…015 — append-only реестр решений), `05_BACKLOG.md` (тикеты DEC/ALIGN/VER/DEFER, на которые ссылается это ТЗ — номера сверены). **Не использовать** как источник требований: `Local_OS_Specification_v04.md`, `Local_OS_MVP1_AgentSpec.md` и старые planning-доки (устаревшие; см. `OBSOLETE_DOCS.md`).

Формат AC: проверяемое утверждение; проверка = автотест или шаг сценария приёмки. Фича принята, когда **все её AC зелёные и сценарий приёмки пройден владельцем**.

---

# Этап Э0 — контракт API + разведка (без токена вперёд)

> **Ключевое ограничение (2026-07-03, решение основателя):** read-only токена Esupl вперёд НЕТ — секьюрные креды не передаются агенту. Поэтому Э0 строится **от DTO-контракта зеркала доков** (`mvp.docs/api/esupl/*` + `raw/collection.json`), а не от живых проб. Зеркало документирует пути и query-параметры, но **не содержит примеров тел ответов** — значит: реализуем провайдерные методы с **толерантным разбором** (несколько вероятных имён полей, безопасные дефолты) и фиксируем допущения. **Живая проверка отложена:** основатель сохранит токен в настройки (`integration_credentials`) в процессе имплементации, после чего реальное поведение наблюдается **через работающее приложение в браузере** (не через отдельные скрипты). Все AC вида «на реальном team 17957» — это **отложенная приёмка в браузере**, а не блокер разработки.

## F0.1 Контракт остатков Esupl (`REMAINS_CONTRACT.md`)

**Зачем:** зафиксировать ожидаемый контракт остатков (что запрашиваем, что примерно в ответе) — от него зависит архитектура Э3/Э4b. Живьём подтверждается позже в браузере.

**Требования**
- REQ-1: Из зеркала (`warehouse.md:706-747` — `GET /teams/{id}/remains`, `/remains/item`, `/remains/item/warehouses`; `raw/collection.json` при нехватке) извлечь **request-контракт**: пути, обязательные/опциональные query-параметры (`warehouse_id`, `per_page/page`, `type[]`, `name`), единицы, warehouse-разрез. Записать в `mvp.docs/api/esupl/REMAINS_CONTRACT.md`.
- REQ-2: Где зеркало не даёт тело ответа — зафиксировать **предполагаемую форму** (вероятные имена полей: `item_id`/`ingredient_id`, `quantity`/`remains`, `unit`, `warehouse_id`) как допущение с пометкой «подтвердить в браузере». Провайдер (F3.1) парсит толерантно.
- REQ-3: Вывод-рекомендация для ADR-016 (F0.5): достаточен ли контракт для варианта A (remains) — или на старте берём C (ручной ввод) как гарантированный фолбэк, а A включаем после подтверждения в браузере.

**Задачи:** (1) извлечь контракт из зеркала; (2) `REMAINS_CONTRACT.md` с допущениями; (3) рекомендация A/C для ADR-016.

**AC**
- AC-1: `REMAINS_CONTRACT.md` содержит пути, параметры, предполагаемую форму ответа и явный список «подтвердить в браузере».
- AC-2: Рекомендация A/C для ADR-016 обоснована содержимым зеркала.

**Приёмка владельцем:** отложенная — когда токен в настройках, открыть `/stock` (F3.3), нажать «Обновить» и сверить 2–3 цифры остатков со складом в Esupl UI. До этого — прочитать `REMAINS_CONTRACT.md` и согласиться с A/C.

**Референсы**
- `mvp.docs/api/esupl/warehouse.md:706-747` — пути remains + query-параметры (request-контракт); `raw/collection.json` — полный Postman-дамп.
- `.tools/probe-ingredients.mjs:38-48` — как в проекте формируют пагинацию/`include` (образец для провайдера, не для запуска сейчас).
- **НЕ вызывать live сейчас** (нет токена); реальные вызовы — из провайдера в работающем приложении после сохранения токена.

## F0.2 Контракт продаж Esupl (`SALES_CONTRACT.md`)

**Зачем:** глубина и гранулярность истории продаж определяют объём Э6 (Фаза 2) и подсказки порогов. Живьём — позже в браузере.

**Требования**
- REQ-1: Из зеркала (`warehouse.md:750-870` — `GET /teams/{id}/sales`; `shifts.md:29` — пример `include`) извлечь request-контракт продаж: параметры периода, `include=items` (состав чека), пагинацию. Записать в `mvp.docs/api/esupl/SALES_CONTRACT.md`.
- REQ-2: Зафиксировать открытые вопросы, разрешимые только живьём: максимальная глубина истории (дата старейшей продажи), гранулярность (чек/день) — пометить «подтвердить в браузере в Э6».

**AC**
- AC-1: `SALES_CONTRACT.md` содержит параметры, пагинацию, семантику `include=items` и список «подтвердить живьём».

**Приёмка владельцем:** отложенная (Э6) — когда доступна история, сверить сумму одного дня с отчётом Esupl. До этого — прочитать контракт.

**Референсы**
- `mvp.docs/api/esupl/warehouse.md:750-870` — секция sales; соседние POST/PUT/submit/cancel — **никогда не вызывать** (G5).
- `mvp.docs/api/esupl/shifts.md:29` — `include=money_transactions` как пример include-семантики.

## F0.3 Фикс путей suppliers/ingredients в `EsuplErpProvider`

**Зачем:** текущие `list_suppliers`/`list_ingredients` бьют в несуществующие пути (`{base}/suppliers` — `esupl.py:43`, `{base}/ingredients` — `esupl.py:65`) без team-скоупа и токена; для Э2/Э3 нужны рабочие team-scoped чтения.

**Требования**
- REQ-1: Пути заменить на реальные team-scoped (подтверждены зеркалом доков): поставщики — `GET /teams/{team_id}/following?is_virtual=1` (`handbooks.md:325-340`), ингредиенты — `GET /teams/{team_id}/ingredients` (`menu.md:364`); разбор ответа — толерантный (зеркало не даёт тел ответов), формы подтверждаются в браузере после сохранения токена.
- REQ-2: `team_id` и `api_token` приходят параметрами методов (как в `write_invoice`); fail-closed: нет токена → пустой список + warning-лог (поведение в докстринге).
- REQ-3: Пагинация: выкачивать все страницы (паттерн `per_page/page` из `probe-ingredients.mjs`); максимум страниц — константа с логом при достижении.
- REQ-4: Сигнатуры в `providers/erp/base.py` обновить синхронно. `SupplierService.sync_from_erp` (`supplier_service.py:50`, сейчас зовёт `self.erp.list_suppliers()` без аргументов) резолвит team_id через `session.get(Organization, organization_id).esupl_team_id` и токен через `get_active_credential(session, provider=CredentialProvider.esupl, scope=CredentialScope.org, org_id=...)` — **тот же паттерн, что в `InvoiceService.submit` (`invoice_service.py:141-143` и `:218-226`)**. `team_id is None` → sync возвращает 0 с warning (fail-closed), не исключение. Заодно исправить устаревший докстринг `write_invoice` в `base.py:28` («фолбэк на env-токен» — фолбэка нет, см. `esupl.py::_auth_headers`).

**Задачи:** (1) правка Protocol + esupl.py (толерантный разбор); (2) адаптация `sync_from_erp` и `POST /suppliers/sync`; (3) respx-тесты на смоделированных ответах.

**AC**
- AC-1 (тест, без токена): respx-тесты — пагинация из ≥2 страниц собирается целиком; отсутствие токена → `[]` + warning, не исключение.
- AC-2: Обращений к старым путям `{base}/suppliers`, `{base}/ingredients` нет (grep чистый).
- AC-3 (**отложенная приёмка в браузере**, когда токен в настройках): `POST /api/v1/suppliers/sync` на реальном team 17957 создаёт/обновляет поставщиков; при расхождении формы ответа — поправить толерантный разбор.

**Приёмка владельцем:** отложенная — после сохранения токена в настройках нажать sync и увидеть в списке поставщиков LCOS реальных поставщиков кофейни (количество совпадает с Esupl UI ± виртуальные).

**Референсы**
- `mvp.be/app/providers/erp/esupl.py:35-78` — менять здесь; `_auth_headers` (`:121-128`) переиспользовать; `write_invoice` (`:80-119`) и гейт — **не трогать**.
- `mvp.be/app/providers/erp/base.py:15-19` — Protocol; `:28` — устаревший докстринг.
- `mvp.be/app/services/supplier_service.py:50` — `sync_from_erp`; `repositories.py:67` — `upsert_by_external_id` уже есть.
- `mvp.be/app/api/v1/routes/suppliers.py:26-29` — thin-роут `POST /sync`; `SyncResult = {synced:int}` (`schemas.py:55-56`).
- `mvp.be/app/db/models.py:80` — `Organization.esupl_team_id` (seed ставит 17957 — `app/seed.py:118-124`).
- `mvp.be/app/services/invoice_service.py:141-143, 218-226` — **паттерн резолва team_id и per-org токена, копировать его**.
- Сохранить egress-обвязку (`providers/http.py`: `guard_vpn`, клиент из `ProviderContext`) в новых путях как есть.

## F0.4 Боевая запись одной накладной (в браузере, при имплементации)

**Зачем:** проверить write-путь до того, как на нём построен ежедневный цикл (Э5). Выполняется, когда токен уже сохранён в настройках (не отдельным скриптом).

**Требования**
- REQ-1: Ничего не кодировать: гейт `erp_write_enabled` включается/выключается через SQLAdmin (`SystemSettingAdmin`); токен — в `integration_credentials` (сохраняет основатель).
- REQ-2: Протокол испытания — `mvp.docs/api/esupl/WRITE_TRIAL.md`: дата, накладная, обезличенный payload, ответ Esupl, id документа, подтверждение видимости в Esupl UI, склад назначения (см. F0.6), время от фото до записи.
- REQ-3: Сразу после испытания вернуть `erp_write_enabled=false`.

**AC** (все — отложенная приёмка в браузере)
- AC-1: Накладная в статусе `written`, `external_id` заполнен, документ виден в Esupl UI на нужном складе и совпадает построчно с бумажной накладной.
- AC-2: Защита от повтора — **только браузерный гард** `shared/pos/sentRegistry.ts`: проверить UI-поведение (повторная отправка с того же устройства блокируется). **Серверной идемпотентности до F5.2 нет:** `submit` всегда создаёт новую строку, `external_id` из ответа Esupl (`invoice_service.py:229`) — **не отправлять ту же накладную повторно через API при включённом гейте** (создаст реальный дубль).
- AC-3: Гейт возвращён в OFF; `WRITE_TRIAL.md` заполнен.

**Приёмка владельцем:** открыть Esupl, найти приход на нужном складе, сверить 3 строки и итоговую сумму.

**Референсы**
- `mvp.be/app/core/system_settings.py:23,60` — ключ `erp_write_enabled` (bool, default False).
- `mvp.be/app/admin/setup.py:135-158,280` — SQLAdmin, где щёлкать гейт.
- `mvp.be/app/services/invoice_service.py:177-238` — путь submit (статусы, гейт, токен из `integration_credentials`).
- `mvp.fe/src/shared/pos/sentRegistry.ts` — существующий FE-гард повторной отправки.
- Код не менять (кроме F0.6, если склад ещё не выбирается); `WRITE_TRIAL.md` — новый файл.

## F0.5 ADR «Источник остатков и потребления»

**Требования**
- REQ-1: Записать **ADR-016** «Источник остатков и потребления» новой секцией в `mvp.docs/04_DECISIONS.md` (каталога `adr/` не существует и не создавать; ADR-001…015 заняты, реестр append-only; шаблон — `mvp.docs/README.md:173-182`). Содержание: контекст, варианты A (remains) / B (приход−расход) / C (ручные инвентаризации), решение, последствия для Э3/Э4b, kill-триггеры. Обновить журнал изменений `04_DECISIONS.md`.
- REQ-2: **Т.к. живых проб нет**, решение принимается по DTO-контрактам F0.1/F0.2 + принципу «не блокировать»: **на старте Э3 гарантируем C (ручной ввод остатков) как всегда-рабочий путь**, а A (remains из Esupl) реализуем и включаем после подтверждения контракта в браузере. То есть Э3 не ждёт живой проверки.

**AC**
- AC-1: Секция ADR-016 существует (решение с фолбэком C); в `07_PHASES.md` (строка Э3) проставлена сноска на ADR-016.

**Приёмка владельцем:** прочитать ADR-016 и утвердить (агент готовит — человек подтверждает).

**Референсы**
- `mvp.docs/04_DECISIONS.md` — ADR-016 уже заведён (status `proposed`); при уточнении по контракту — актуализировать.
- `mvp.docs/README.md:173-182` — шаблон секции ADR.

## F0.6 Выбор склада назначения для прихода

**Зачем:** приход в Esupl пишется **на конкретный склад**. Сейчас `warehouse_id` в payload берётся молча из `Subdivision.esupl_warehouse_id` (`invoice_service.py:144`), а реальной привязки/выбора склада нет — если поле пустое, накладная не готова к записи (`invoice_service.py:149-150`). Нужно: реальный список складов team и явный выбор склада на приёмке.

**Требования**
- REQ-1: BE — метод `ErpProvider.list_warehouses(team_id, api_token) -> list[WarehouseRef]` (DTO в `domain/entities.py`: `esupl_warehouse_id:int`, `name:str`); путь из зеркала (`warehouse.md` семейство `remains/item/warehouses` / искать `/teams/{id}/warehouses` в `raw/collection.json`), толерантный разбор, подтверждение в браузере. Fail-closed: нет токена → `[]` + warning.
- REQ-2: BE — на приёмке накладной выбранный `warehouse_id` кладётся в `EsuplOutgoingInvoice.warehouse_id` (уже есть поле, `entities.py:111`) вместо молчаливого дефолта; дефолт = `Subdivision.esupl_warehouse_id`, если задан. Персист выбора на `invoices` (новая колонка `target_warehouse_id int nullable` — с ней и пишем).
- REQ-3: FE — селектор склада в шаге отправки (`prepare-step`/`invoice-workbench`): дефолт из подразделения, список из нового метода; **приход нельзя отправить без выбранного склада** (валидация перед submit, закрывает `invoice_service.py:149-150`).
- REQ-4: Э3 (`stock_levels.warehouse_id`) и F0.6 используют один и тот же справочник складов — консистентность.

**AC**
- AC-1 (тест): respx — `list_warehouses` собирает список; нет токена → `[]` + warning; submit без `warehouse_id` → накладная не-ready с внятным сообщением.
- AC-2 (**отложенная приёмка в браузере**): список складов совпадает с Esupl UI; приход, записанный F0.4, лёг на выбранный склад.

**Приёмка владельцем:** при вводе накладной выбрать склад (по умолчанию — склад кофейни), отправить; в Esupl приход виден на этом складе.

**Референсы**
- `mvp.be/app/services/invoice_service.py:144,149-150,161-169` — где сейчас берётся/проверяется `warehouse_id` и строится payload.
- `mvp.be/app/domain/entities.py:106-111` — `EsuplOutgoingInvoice.warehouse_id` (поле уже есть).
- `mvp.be/app/db/models.py` — `Subdivision.esupl_warehouse_id` (дефолт), `Invoice` (добавить `target_warehouse_id`).
- `mvp.docs/api/esupl/warehouse.md:737-747`, `raw/collection.json` — эндпоинты складов (контракт, live позже).
- `mvp.fe/src/widgets/prepare-step/ui/PrepareStep.tsx`, `widgets/invoice-workbench/ui/InvoiceWorkbench.tsx` — куда встроить селектор.

---

# Этап Э1 — серверная маппинг-память + P0-долг

## F1.1 Таблица `sku_mappings` + API

**Зачем:** маппинг-память — главный retention-актив; сейчас в localStorage и теряется при смене устройства.

**Требования**
- REQ-1: Таблица `sku_mappings`: `id (uuid pk)`, `organization_id` (`OrganizationScopedMixin`), `supplier_id (FK suppliers int, CASCADE)`, `normalized_description (Text)`, `ingredient_id (FK ingredients uuid, CASCADE)`, `packing_id (FK packings uuid, SET NULL, nullable)`, `source ('user'|'import')`, `confirmed_at`. Unique `(organization_id, supplier_id, normalized_description)` (образец составного unique с org — `suppliers_org_external`, `models.py:199`).
- REQ-2: Нормализация описания — **SSOT на BE** (функция в `app/services/`): **точно воспроизвести** алгоритм FE-функции `canonicalText`/`normalizeName` (`mvp.fe/src/shared/lib/format.ts:19-30`): lower → ё→е → **заменить каждую последовательность не-`[0-9a-zа-я]` символов (пунктуация, `%`, запятые, точки, пробелы) на один пробел** → trim. Свёртка пунктуации/процента — несущая (докстринг `format.ts:10-17`), не пропускать её. FE шлёт сырое описание, BE нормализует. В обязательных общих тест-кейсах с FE — не только двойные пробелы/регистр/ё, но и пунктуация/процент: `«Молоко 3,2%»` ≡ `«молоко 3.2 %»`. Расхождение нормализаций = промахи авто-маппинга.
- REQ-3: API: `GET /api/v1/suppliers/{id}/sku-mappings`, `PUT /api/v1/suppliers/{id}/sku-mappings` (bulk upsert; по unique-ключу, `confirmed_at=now`). Тенант-скоуп из JWT.
- REQ-4: Репозиторий по образцу существующих (конструктор требует `organization_id`).

**AC**
- AC-1: Повторный PUT той же пары не плодит строк, обновляет `confirmed_at`.
- AC-2: Пары изолированы по поставщикам и организациям (тест).
- AC-3: GET возвращает только маппинги своего org (тест изоляции).

**Приёмка владельцем:** через F1.2.

**Референсы**
- `mvp.fe/src/shared/lib/format.ts:19-30` — `canonicalText`/`normalizeName`, поведение которого BE обязан повторить (см. REQ-2).
- `mvp.be/app/db/models.py:199` — `suppliers_org_external`, образец составного unique с org; `repositories.py:33-36` — образец тенантного репозитория (`SupplierRepository`, конструктор требует `organization_id`).
- `mvp.be/app/api/v1/routes/suppliers.py:13-29` — thin-роут паттерн; схемы — `api/v1/schemas.py`.

## F1.2 FE: маппинг-память с backend + one-shot импорт из localStorage

**Требования**
- REQ-1: Подтверждённые маппинги строк отправляются на `PUT .../sku-mappings` в момент отправки накладной (авто-персист; точка — где сейчас `saveMapping`: `InvoiceWorkbench.tsx:220`).
- REQ-2: На входе в маппинг FE тянет `GET .../sku-mappings` поставщика и авто-применяет (точки текущей загрузки: `InvoiceImportPage.tsx:123`, `InvoiceWorkbench.tsx:325` — `loadMappingsForSupplier`).
- REQ-3: One-shot импорт из localStorage: ключ `localos.skuMappings.v5`, формат `provider::org::supplier::name` → `SavedMapping {skuId, packing}` (`entities/invoice/model/types.ts:44-47`). Переносить **только** записи текущего боевого POS-провайдера и текущего org; демо-сид `SEED_MAPPINGS` (из `shared/api/mockData`, живёт под `mock::`) **не переносить**. После успеха — localStorage помечается мигрированным и не используется как источник.
- REQ-4: Авто-замапленные строки помечаются в UI (бейдж «авто»), ручная правка снимает пометку — разметка нужна метрике Э5 (F5.3).

**AC**
- AC-1: Накладная знакомого поставщика: ≥80% строк маппятся автоматически (после 2–3 накладных этого поставщика).
- AC-2: Два устройства: маппинг подтверждён на устройстве 1 → накладная на устройстве 2 маппится этими парами.
- AC-3: После миграции очистка localStorage не теряет маппинги; `mock::`-записи на backend не попали.
- AC-4: Ошибка сети при PUT не блокирует отправку накладной (best-effort + toast-предупреждение).

**Приёмка владельцем:** сфотографировать накладную знакомого поставщика с телефона — строки уже замаплены с бейджем «авто»; повторить с другого устройства.

**Референсы**
- `mvp.fe/src/entities/invoice/lib/mappingStorage.ts` — весь текущий механизм (ключи:26-31, load:64, save:86, seed:35-43); докстринг в нём прямо обещает переезд в `sku_mappings`.
- `mvp.fe/src/widgets/invoice-workbench/ui/InvoiceWorkbench.tsx:9,220,325` и `pages/invoice-import/ui/InvoiceImportPage.tsx:123` — все call-sites.
- `mvp.fe/src/entities/invoice/model/sessionSlice.ts:4` — использует `mappingKey`; править синхронно.
- `mvp.fe/src/entities/supplier/api/suppliersApi.ts` — образец RTK Query API-модуля.

## F1.3 Чистка: DEC-02 (sku_embedding) + DEC-05 (candidate-set)

**Требования**
- REQ-1: Миграция: дроп `invoice_lines.sku_embedding` (extension `vector` оставить); удалить `SKU_EMBEDDING_DIM`.
- REQ-2: DEC-05 вариант B: точка правки — `entities/invoice/api/invoicesApi.ts` (`buildMatchCandidates`:68 и его вызов в `suggestMatches`:139, кладёт `req.candidates` **обоим** провайдерам). Перестать строить/передавать `candidates`, когда активный match-провайдер = backend; построение оставить только для mock. **`shared/match/providers/backend.ts` кандидаты уже игнорирует** (шлёт только `{line_no, description}`) — там правок не требуется.

**AC**
- AC-1: Миграция up/down; pytest зелёный; grep `sku_embedding` в `app/` пуст.
- AC-2: Payload запроса suggest-matches (backend-путь) без `candidates` (devtools).

**Референсы**
- `mvp.fe/src/entities/invoice/api/invoicesApi.ts:68,139` — реальное место построения/передачи candidate-set (обоим провайдерам); это и есть точка правки.
- `mvp.fe/src/shared/match/providers/backend.ts:14-40` — уже игнорирует `candidates` (не трогать); `shared/match/providers/mock.ts:15-38` — потребитель `req.candidates`, остаётся.
- `mvp.be/app/db/models.py:41` — `SKU_EMBEDDING_DIM`; `:262` — `invoice_lines.sku_embedding Vector(...)` (дропнуть).
- `mvp.be/alembic/versions/0003_integration_credentials.py` — образец миграции с data-логикой (op.execute) и рабочим downgrade.

## F1.4 ALIGN-01: fail-closed шифрование секретов

**Требования**
- REQ-1: `encrypt()` (`app/core/secrets.py:78+`) при пустой связке (`_keyring() is None`) → `RuntimeError` вместо «вернуть как есть + warning» (текущее поведение задокументировано в докстринге модуля, строки 14-16).
- REQ-2: Startup-guard `app/main.py::_ensure_strong_secrets` требует `SECRETS_ENC_KEY` во всех окружениях (снять исключение для local); `lcos.env.example` содержит рабочий dev-KEK с комментарием «заменить в проде».

**AC**
- AC-1: Тест: encrypt без keyring → RuntimeError; секрет через SQLAdmin — ciphertext `enc:v2:*` в БД.
- AC-2: Запуск без `SECRETS_ENC_KEY` → отказ старта с понятной ошибкой.

**Референсы**
- `mvp.be/app/core/secrets.py` — `_keyring`:34, `encrypt`:78, докстринг с описанием текущего fallback:14-16.
- `mvp.be/app/main.py` — `_ensure_strong_secrets`; `mvp.be/lcos.env.example`.
- `mvp.be/tests/test_secrets.py` — существующие тесты шифрования, расширять здесь.

## F1.5 VER-01: merge-блокирующие тесты non-negotiables

**Требования**
- REQ-1: **Подтвердить покрытие в существующих тестах и дописать недостающее** (test-suite уже большой): fail-closed VPN и выбор egress-клиента (`tests/test_egress.py`, `test_provider_egress.py`, `test_vpn_toggle.py`), гейт `ERP_WRITE_ENABLED` (OFF → синтетический id, ноль egress; ON → POST с токеном), тенант-изоляция (`test_tenant_isolation.py`, `test_tenant.py`), refresh reuse-detection (`test_auth.py`), шифрование (`test_secrets.py`, `test_secret_isolation.py`). Каждый пункт: либо ссылка на существующий тест, либо новый.
- REQ-2: pytest-маркер `non_negotiable` на всех этих тестах + регистрация маркера в `pyproject.toml` (`[tool.pytest.ini_options] markers` — сейчас маркеров нет); `pytest -m non_negotiable` — единый вход (кандидат в CI-гейт, сам CI — DEFER-02).

**AC**
- AC-1: `pytest -m non_negotiable` зелёный и покрывает все перечисленные сценарии; для каждого сценария в PR указано, каким тестом закрыт.

**Референсы**
- `mvp.be/tests/` — существующие: test_egress, test_provider_egress, test_vpn_toggle, test_tenant_isolation, test_tenant, test_auth, test_secrets, test_secret_isolation, test_invoice_service (гейт записи проверить здесь).
- `mvp.be/pyproject.toml` — добавить markers.

## F1.6 FE: переименование `entities/order` → `entities/receipts`

**Зачем:** снять коллизию имён до появления `entities/purchase-draft` (Э4a). Объём мал: снаружи импортирует только `pages/invoices-list/ui/InvoicesListPage.tsx:4` (`useGetOrdersQuery`, `PosOrder`).

**AC**
- AC-1: `src/entities/order` не существует; импорт в InvoicesListPage обновлён; build зелёный; поведение не изменилось.

---

# Этап Э2 — настройки поставщика + задел self-service

## F2.1 Таблица `supplier_settings` + API

Условия у разных поставщиков разные — схема **расширяемая** (решение основателя): частые/используемые планировщиком условия — колонками; редкие/специфичные — в `extra_terms jsonb`, без миграции под каждого поставщика.

**Требования**
- REQ-1: Отдельная таблица (не колонки на `suppliers` — тот остаётся зеркалом Esupl): `id (uuid pk)`, `organization_id`, `supplier_id (FK int, CASCADE)`, unique `(organization_id, supplier_id)`, `is_active (bool, default true)`, `notes (Text, nullable)`. **Условия-колонки** (нужны планировщику F4.4 / индикатору F4.2): `delivery_days (jsonb — дни недели 0–6)`, `lead_time_days (int, nullable)`, `min_order_amount (Numeric(14,2), nullable)` + `min_order_currency (str, nullable)`, `free_delivery_threshold (Numeric(14,2), nullable)` (порог бесплатной доставки — отдельно от мин. суммы). **`extra_terms (jsonb, nullable)`** — расширение под редкие условия (мин. количество/кратность и пр.); задокументировать well-known ключи, чтобы FE и планировщик читали их единообразно.
- REQ-2: **Канал связи** (решение основателя — выбор канала): `contact_channel (enum: whatsapp|telegram|viber|phone|email|other, nullable)` + `contact_value (str, nullable — телефон/username/email)`. Пока это лишь метка канала для F4.3 (само сообщение копируется вручную), но поле закладываем сейчас.
- REQ-3: API: `GET /api/v1/suppliers/{id}/settings`, `PATCH /api/v1/suppliers/{id}/settings` (upsert). Валидация: `delivery_days` ⊆ 0–6, суммы ≥ 0, `contact_channel` из enum.
- REQ-4: `GET /api/v1/suppliers` (существующий `routes/suppliers.py:13-16`) дополнить признаком заполненности настроек.
- Мин. количество/кратность на позицию — не отдельная колонка (это свойство пары поставщик×SKU); в Фазе 1 округление к упаковке уже делает `packings.factor` (F4.4). Если понадобится supplier-level — через `extra_terms`.

**AC**
- AC-1: PATCH создаёт при отсутствии, обновляет при наличии; одна строка на поставщика (constraint-тест).
- AC-2: `extra_terms` сохраняется/читается как произвольный JSON; `contact_channel` вне enum → 422 (тест).
- AC-3: Тенант-изоляция (тест).

**Референсы**
- `mvp.be/app/api/v1/routes/suppliers.py:13-29` — существующие GET/`/match`/`/sync`; PATCH добавлять сюда же.
- `mvp.be/app/api/v1/routes/organizations.py:60` — `PUT /{org_id}/pos-config`, **единственный существующий write-роут с телом** (образец декоратора/сигнатуры; PATCH в проекте появляется впервые).
- `mvp.be/app/services/supplier_service.py:38-61`, `db/repositories.py::SupplierRepository` — расширять; `api/deps.py:55-64` — `SupplierServiceDep` уже готов.
- `mvp.be/app/api/v1/schemas.py:13-19` — `SupplierOut` (from_attributes-схема, образец); новые схемы `SupplierSettings*` добавлять в этот же файл.

## F2.2 FE: экраны `/suppliers` и `/suppliers/:id`

**Требования**
- REQ-1: Роут в `src/app/App.tsx` (createBrowserRouter) + пункт «Поставщики» в `widgets/app-layout/ui/AppLayout.tsx`. Список: имя, телефон, мин. сумма, дни доставки, индикатор «не заполнено».
- REQ-2: Карточка: форма настроек (дни доставки, lead time, мин. сумма + валюта, порог бесплатной доставки, канал связи + значение, заметки), мобильная вёрстка, сохранение по кнопке + toast (паттерн формы — `pages/settings/ui/SettingsPage.tsx`). `extra_terms` в Фазе 1 в UI можно не редактировать (только схема).
- REQ-3: Типы — локальный оверлей в `entities/supplier` (API-модуль там уже есть: `entities/supplier/api/suppliersApi.ts`); `shared/pos/types.ts` не трогать (G4).

**AC**
- AC-1: С телефона: заполнить дни/мин. сумму/канал связи, сохранить, перезагрузить — данные на месте.
- AC-2: В списке видно, у кого настройки не заполнены.

**Приёмка владельцем:** заполнить карточки 5–7 реальных поставщиков с телефона; при следующем заказе воспользоваться карточкой.

## F2.3 Задел supplier self-service

**Требования**
- REQ-1: В той же миграции, что F2.1: значение `supplier` в enum `Role` (`models.py:44` — `enum.StrEnum`, native PG enum) и nullable `suppliers.portal_user_id (FK users uuid, SET NULL)`. **Внимание:** autogenerate не видит добавление значения в PG-enum — писать вручную `op.execute("ALTER TYPE role ADD VALUE IF NOT EXISTS 'supplier'")`; downgrade — no-op с комментарием (удаление значения из PG-enum небезопасно).
- REQ-2: Ни роутов, ни UI, ни веток в auth — только схема.
- REQ-3: ADR **ADR-017** «Self-service поставщиков: дверь открыта» — секцией в `mvp.docs/04_DECISIONS.md` (не отдельным файлом; номер 017 — следующий свободный после ADR-016 из F0.5): что отложено (глобальный supplier-пользователь, invite-токены, скоуп «только свои settings»).

**AC**
- AC-1: Миграция up/down; enum содержит `supplier`; колонка есть; полный pytest зелёный (поведение не изменилось).
- AC-2: Секция ADR-017 существует.

**Референсы**
- `mvp.be/app/db/models.py:44` — `Role(enum.StrEnum)`; `users` PK — uuid.
- `mvp.be/alembic/versions/` — существующие ревизии как образец структуры; ALTER TYPE — вручную, см. REQ-1.

---

# Этап Э3 — остатки

> Состав уточняется ADR-016 (F0.5). Ниже — вариант A (remains работают); при B/C `get_stock` заменяется ручным вводом, остальное без изменений.

## F3.1 `ErpProvider.get_stock()` + `stock_levels` + sync

**Требования**
- REQ-1: Protocol `providers/erp/base.py`: `get_stock(team_id, warehouse_id, api_token) -> list[StockItemRef]`; DTO `StockItemRef` в `domain/entities.py` (образец — `IngredientRef` там же): ingredient external_id, quantity, unit, as_of.
- REQ-2: Таблица `stock_levels`: `organization_id`, `subdivision_id`, `ingredient_id (FK uuid)`, `warehouse_id (int)`, `quantity Numeric(14,3)`, `as_of (timestamptz)`, `source ('esupl'|'manual')`. Снимки (история); unique `(organization_id, ingredient_id, warehouse_id, as_of)`.
- REQ-3: `POST /api/v1/stock/sync` — ручной триггер (паттерн `POST /suppliers/sync` + резолв team/token из F0.3 REQ-4; warehouse_id — из `Subdivision.esupl_warehouse_id`): тянет remains, матчит на `ingredients.esupl_item_id`, пишет снимок; несматченные — warnings в ответе.
- REQ-4: `GET /api/v1/stock` — последний снимок по каждому ингредиенту субдивизиона (`as_of`, `is_low = quantity <= reorder_point`, при NULL-пороге false).

**AC**
- AC-1: respx-тест: sync создаёт снимок; повтор с тем же `as_of` идемпотентен; несматченные в warnings.
- AC-2: Живой sync: количества и единицы 5 выборочных ингредиентов совпадают с Esupl UI.
- AC-3: Тенант-изоляция stock-эндпоинтов (тест).

**Референсы**
- `mvp.be/app/providers/erp/base.py`, `domain/entities.py` (`IngredientRef` — образец DTO).
- `mvp.be/app/db/models.py` — `Subdivision.esupl_warehouse_id`, `Ingredient.esupl_item_id`.
- Роут-паттерн sync: `routes/suppliers.py:26-29`.

## F3.2 `ingredients.reorder_point`

**Требования**
- REQ-1: Колонка `ingredients.reorder_point Numeric(14,3), nullable`. Новый `PATCH /api/v1/ingredients/{id}` в `routes/ingredients.py` (сейчас там только `GET`, отдающий `IngredientRef` через `services/catalog.py::list_catalog`); в ответ каталога добавить `reorder_point` (расширить `IngredientRef` или отдельная Out-схема — выбрать расширение `IngredientRef`).

**AC**
- AC-1: Порог сохраняется/читается; `is_low` в `GET /stock` корректен (тест: ниже/выше/равно/NULL).

**Референсы**
- `mvp.be/app/api/v1/routes/ingredients.py` — весь файл (22 строки); `services/catalog.py`.

## F3.3 FE: экран `/stock`

**Требования**
- REQ-1: Роут `/stock` + «Остатки» в навигации (`App.tsx`, `AppLayout.tsx`). Таблица: ингредиент, остаток, единица, порог, свежесть снимка (заметно, если старше 24 ч).
- REQ-2: Блок «Мало» сверху (`is_low`, сортировка по quantity/reorder_point) — готовый shopping-list.
- REQ-3: Кнопка «Обновить остатки» → `POST /stock/sync` со спиннером и итогом («обновлено M, не сматчено K»).
- REQ-4: Инлайн-корректировка остатка (создаёт снимок `source=manual`) и установка порога из той же строки. Правило конфликтов: побеждает max(as_of).
- REQ-5: FE-доступ к остаткам — через новый метод `PosProvider.listStock()`: интерфейс `shared/pos/provider.ts:25` (рядом `listSuppliers`:37, `sendInvoice`:54), реализации `shared/pos/providers/backend.ts` и `mock.ts`, фабрика `shared/pos/factory.ts`.
- REQ-6: Мобильная вёрстка (сверка у полки).

**AC**
- AC-1: Обновление с телефона ≤1 мин от нажатия до результата.
- AC-2: Ручная корректировка видна сразу и переживает следующий sync (max(as_of)).
- AC-3: Блок «Мало» корректно наполняется/пустеет при манипуляции порогом.

**Приёмка владельцем (весь Э3):** перед закупкой открыть `/stock`, «Обновить», пройти блок «Мало» у полки: список совпадает с реальностью (единичные расхождения лечатся инлайн). **Kill-check:** расхождение >50% позиций — стоп, возврат к ADR-016.

---

# Этап Э4a — черновик заказа руками

## F4.1 BE: `purchase_orders` + API

**Требования**
- REQ-1: `purchase_orders`: `id (uuid pk)`, `organization_id`, `subdivision_id`, `supplier_id (FK int)`, `status` (native enum `purchase_order_status`: `draft/confirmed/sent_manually/received/cancelled` — образец объявления: `InvoiceStatus`, `models.py`), `total_amount Numeric(14,2)` (денормализ., пересчёт при изменении строк), `confirmed_by (FK users uuid, nullable)`, `confirmed_at`, `notes`. `purchase_order_lines`: `po_id (FK CASCADE)`, `line_no`, `ingredient_id (FK uuid)`, `packing_id (FK uuid, nullable)`, `quantity Numeric(14,3)`, `unit_price Numeric(14,4), nullable`, `origin` enum(`manual/ai/prefill`).
- REQ-2: API: `POST /purchase-orders` (draft), `GET /purchase-orders?status=`, `GET/PATCH /purchase-orders/{id}` (строки заменяющим PUT), `POST /{id}/confirm`, `POST /{id}/cancel`. Валидные переходы: `draft→confirmed→sent_manually→received`, `draft|confirmed→cancelled`; иначе 409.
- REQ-3: Никакой записи в Esupl (G5). После `confirm` правка строк → 409.
- REQ-4: `GET /purchase-orders/prefill?supplier_id=` — позиции, которые поставщик привозил (по `invoice_lines` его накладных: ingredient, последняя `unit_price`, последняя `quantity`). Строить на BE из `invoice_lines` (у строк есть `sku`, `quantity`, `unit_price`, `line_total` — `models.py`), а не на FE.

**AC**
- AC-1: Статус-машина: тесты всех валидных/невалидных переходов.
- AC-2: `total_amount` = сумма строк всегда (тест пересчёта).
- AC-3: prefill — только позиции данного поставщика данного org (тест).

**Референсы**
- `mvp.be/app/db/models.py:60-66,219-220` — `InvoiceStatus` + маппинг `SAEnum(..., name="invoice_status")` (образец native PG-enum для `purchase_order_status`); `:247-260` — `invoice_lines` (`sku`, `quantity`, `unit_price`, `line_total` — данных для prefill достаточно); `:112-117` — `users` uuid PK.
- `mvp.be/app/api/v1/routes/invoices.py:45-49` — образец POST-роута (`submit_invoice`); `routes/suppliers.py` — thin-паттерн.
- prefill (REQ-4) строится **с нуля на BE** из `invoice_lines`. FE-функция `entities/sku/api/skusApi.ts::getSupplierProductIds` даёт лишь **список product-id** (для группировки в пикере) и реально наполнена только в mock-провайдере; backend-провайдер (`shared/pos/providers/backend.ts:75-77`) возвращает `[]`-стуб — сверять семантику prefill на бэке не с чем.

## F4.2 FE: экран заказа `/orders`

**Требования**
- REQ-1: Роут `/orders` («Заказы») — список PO по статусам + «Новый заказ» (выбор поставщика; с заполненными настройками — первыми).
- REQ-2: Таблица строк черновика: **НЕ параметризовать `features/lines-table`** — компонент жёстко привязан к Redux-слайсу накладной (`LinesTable.tsx:37` читает `s.invoiceSession.lines`). Решение: собственная таблица в новой фиче (`features/order-lines-table` или ui внутри `entities/purchase-draft`), **переиспользуя субкомпоненты**: `features/lines-table/ui/SkuSelect.tsx` (поиск по каталогу) и разметку/паттерны `LineRow.tsx`/`LineCard.tsx` (десктоп-таблица + мобильные карточки). `LinesTable` не рефакторить.
- REQ-3: Prefill: при создании черновика — предложение «добавить то, что возили раньше» (F4.1 REQ-4), строки `origin=prefill`.
- REQ-4: Индикатор «сумма vs `min_order_amount`»: прогресс/предупреждение «до минимальной суммы не хватает X».
- REQ-5: Новая сущность `entities/purchase-draft` (FSD); черновик персистится на BE (не localStorage).

**AC**
- AC-1: Полный путь: новый заказ → prefill → правка количеств → сумма и индикатор пересчитываются на лету.
- AC-2: Перезагрузка не теряет строк.
- AC-3: Мобильная вёрстка пригодна для набора заказа с телефона.

**Референсы**
- `mvp.fe/src/features/lines-table/ui/` — `SkuSelect.tsx` (реюз), `LineRow.tsx`/`LineCard.tsx` (образцы), `LinesTable.tsx:24-38` (почему не реюзаем целиком).
- `mvp.fe/src/app/App.tsx`, `widgets/app-layout/ui/AppLayout.tsx` — роут+нав.

## F4.3 Подтверждение → сообщение поставщику (копирование)

**Зачем/подход:** канал у поставщиков разный (WhatsApp/Telegram/Viber/телефон/email — `supplier_settings.contact_channel`). В Фазе 1 — **канал-агностично: формируем текст, который копируется и отправляется вручную**; интеграций с мессенджерами нет. Канал используется только как подсказка (куда отправить), не как способ отправки.

**Требования**
- REQ-1: «Подтвердить заказ» → confirm на BE → модал с готовым текстом: приветствие, «позиция — количество упаковок/единиц», сумма, подпись кофейни. Русский, человекочитаемый. Показать подсказку канала из `contact_channel`/`contact_value` («отправить в Telegram @…», кнопка-ссылка при наличии), но сам текст — универсальный.
- REQ-2: «Скопировать» (navigator.clipboard) + перевод PO в `sent_manually` (ручная отметка как альтернатива).
- REQ-3: Без интеграций с мессенджерами/почтой (G7) — только копируемый текст. (Deep-link `tel:`/`https://t.me/…` из `contact_value` допустим как удобство, без API.)

**AC**
- AC-1: Текст содержит все строки, количества с единицами, сумму; вставка в любой мессенджер сохраняет переносы.
- AC-2: После «Скопировать» PO → `sent_manually`, в списке с датой.
- AC-3: Подсказка канала соответствует `contact_channel` поставщика (или скрыта, если не задан).

**Приёмка владельцем (весь Э4a):** собрать реальный недельный заказ: prefill → правка → «не хватает X до минимума» → добить → подтвердить → скопировать → отправить поставщику его каналом. Поставщик принял без вопросов по формату.

---

# Этап Э4b — AI-предзаполнение черновика

## F4.4 BE: `order_planning_service` + propose

**Требования**
- REQ-1: `app/services/order_planning_service.py`: вход supplier_id; данные: последние снимки `stock_levels`, `ingredients.reorder_point`, `supplier_settings` (delivery_days → дней до следующей поставки, lead_time_days), последние цены/объёмы из `invoice_lines` поставщика. **Основной путь (обязателен, покрыт AC-1):** строки с остатком `≤ reorder_point`; количество — округление вверх до целых упаковок (default packing: `packings.is_default`, `factor`); цена — последняя. **Опциональный consumption-путь (можно НЕ реализовывать в Фазе 1 — нет AC):** «остаток не дотянет до следующей поставки», где «средний дневной расход» — это **ПРОКСИ по приходам** (в Фазе 1 продаж нет): сумма `quantity` из `invoice_lines` поставщика за фиксированное окно (напр. 30 дней) ÷ дни окна; при `<2` приходов в окне путь недоступен — откат на `≤ reorder_point`. Прямой расход появится в Э6 (история продаж).
- REQ-2: Расчёт детерминированный (правила, не LLM); каждая строка несёт `reason` («остаток 1.2 кг ниже порога 2 кг»).
- REQ-3: `POST /purchase-orders/propose?supplier_id=` → draft со строками `origin='ai'` + reasons.
- REQ-4: Пустое предложение — валидный ответ; нет снимка свежее 7 дней → 409 «обновите остатки».

**AC**
- AC-1: Юнит-тесты: ниже/выше порога; округление к упаковке (1.2 → 2); NULL-порог → не предлагается; несвежий снимок → 409.
- AC-2: Только позиции этого поставщика и этого org (тест).

**Референсы**
- `mvp.be/app/db/models.py` — `packings.factor`, `is_default` (партиальный unique «один default на SKU» уже есть — `uq_packings_default_per_ingredient`).
- `mvp.be/app/services/invoice_service.py` — образец сервиса с несколькими репозиториями.

## F4.5 FE: «Предложить заказ» + разметка AI-строк

**Требования**
- REQ-1: Кнопка у поставщика на `/orders`; результат — обычный черновик: AI-строки с бейджем и reason.
- REQ-2: Правка AI-строки → `origin='manual'` (метрика Э5).
- REQ-3: Пустое предложение → «всё в норме» + ссылка на `/stock`.

**AC**
- AC-1: Черновик из предложения редактируется/подтверждается как ручной (реюз F4.2/F4.3 без ветвлений).
- AC-2: Бейджи/reasons видны; правка снимает бейдж.

**Приёмка владельцем (весь Э4b):** перед реальным заказом «Предложить заказ»: черновик содержит то, что заканчивается, количества разумны (правки ≤30% строк); 2–3 недели подряд. **Kill-check:** правки >70% три цикла — откат к чек-листу (решение основателя).

---

# Этап Э5 — замыкание петли + боевой режим

## F5.1 Сверка прихода с заказом

**Требования**
- REQ-1: Колонка `invoices.purchase_order_id (FK uuid, nullable, SET NULL)`. На submit — авто-матч: открытый (`confirmed`/`sent_manually`) PO того же поставщика, ближайший по дате; >1 кандидата → выбор в UI, не угадывание. Точка встраивания — `InvoiceService.submit` (`invoice_service.py:177-238`).
- REQ-2: Экран расхождений в `widgets/invoice-workbench/ui/InvoiceWorkbench.tsx` (виджет — один файл; встраивать секцией перед отправкой): «заказано N — привезли M», расхождения цен, позиции вне заказа, недовоз. Информирующий, не блокирующий.
- REQ-3: Подтверждение с привязкой → PO `received`; недовоз — автотекстом в `notes` PO.

**AC**
- AC-1: Матчер: один кандидат — привязан; ноль — накладная без PO; два — требует выбора (тесты).
- AC-2: Сценарий «10 заказано → 8 привезли, 1 цена выше»: экран показывает 2 недовоза + 1 ценовое; PO `received` с notes.

## F5.2 DEFER-04: серверная идемпотентность отправки

**Требования**
- REQ-1: Заголовок `Idempotency-Key` (uuid с FE на `POST /invoices`); BE хранит ключ (колонка на `invoices` + unique) и на повтор возвращает исходный результат без второго ERP-вызова.
- REQ-2: FE: retry с тем же ключом безопасен; браузерный гард `shared/pos/sentRegistry.ts` удаляется (вместе с реэкспортом в `shared/pos/index.ts`).

**AC**
- AC-1: Тест: два submit с одним ключом → одна накладная, один ERP-вызов (respx).
- AC-2: grep `sentRegistry` пуст.

## F5.3 Боевой режим + метрика

**Требования**
- REQ-1: Тело `POST /invoices` — доменный `InvoiceDraft` (`routes/invoices.py:46`), поэтому разметку переносим доменом: опциональное поле `match_origin ('auto'|'manual'|None)` на `InvoiceLineDraft` (`domain/entities.py`), FE проставляет из бейджей F1.2. На submit BE сохраняет на `invoices` счётчики: `auto_mapped_lines`, `total_lines`, `edited_ai_lines`, `processing_ms`.
- REQ-2: Блок «Метрики» на `pages/settings/ui/SettingsPage.tsx`: за 30 дней — накладных, % авто-строк, медиана «фото→отправка», % AI-строк заказа без правок (из `purchase_order_lines.origin`). Единственный «показывающий» экран — для валидации закрытия фазы, не для продукта.
- REQ-3: `erp_write_enabled=true` на постоянку (после F0.4 и F5.2); чек-лист включения — дополнением в `WRITE_TRIAL.md`.
- REQ-4: DEC-07 вариант B, если журнал боевого использования не потребует иного: `MAX_INVOICE_PAGES` (=3, `entities/invoice/model/sessionSlice.ts:22`) → 1 и честное сообщение в `widgets/prepare-step/ui/PrepareStep.tsx` (тексты «до 3 листов» — `:81,:104-105,:163`). **Где реально теряются страницы:** FE отдаёт OCR-провайдеру ВСЕ страницы (`invoicesApi.ts:106-114`), но боевой провайдер берёт только первую — `shared/ocr/providers/backend.ts:43` (`const page = pages[0]`, комментарий `:35-37`); тихой потери быть не должно. **Альтернатива «явная склейка страниц» выходит за рамки перечисленных FE-файлов:** боевой `POST /invoices/recognize` (`routes/invoices.py:23-35`) принимает ровно один `file: UploadFile` — мультистраничность потребовала бы правки роута/сервиса BE (несколько файлов или серверная склейка). Поэтому в рамках Фазы 1 — только ветка «→ 1 лист + честное сообщение».

**AC**
- AC-1: Метрики совпадают с ручной сверкой одного дня.
- AC-2: Тихой потери страниц нет (загрузка 2 страниц → либо обе обработаны, либо явное сообщение).
- AC-3: 10 боевых накладных подряд: фото → `written` без ручного дублирования в Esupl.

**Приёмка владельцем (весь Э5 = закрытие Фазы 1):** две недели полного цикла без блокнота: заказ (AI-черновик) → отправка поставщику его каналом → приход по фото с выбором склада → расхождения → received → накладная в Esupl автоматически. Метрики: ≥95% строк без правок, ≤30 сек на накладную, AI-черновик правится ≤30%. Если да — **Фаза 1 закрыта**.

---

## Трассировка и порядок сдачи

| Этап | Фичи | Блокирует |
|---|---|---|
| Э0 | F0.1–F0.6 | Э3 (ADR-016), Э6; F0.3 блокирует Э2-sync и Э3; F0.6 блокирует боевую запись (F0.4/Э5) |
| Э1 | F1.1→F1.2; F1.3–F1.6 независимы | Э4a (F1.6), метрику Э5 (F1.2) |
| Э2 | F2.1→F2.2; F2.3 в той же миграции | Э4a (мин. сумма, выбор поставщика) |
| Э3 | F3.1→F3.3; F3.2 параллельно | Э4b |
| Э4a | F4.1→F4.2→F4.3 | Э4b, Э5 |
| Э4b | F4.4→F4.5 | Э5 (метрика AI-правок) |
| Э5 | F5.1, F5.2 → F5.3 | закрытие Фазы 1 |

Правило сдачи: одна фича = одна ветка/PR = один прогон приёмки. Агент при сдаче прикладывает: список AC с доказательствами (вывод тестов, скрины/записи для FE), отклонения от ТЗ (почему), обновление `05_BACKLOG.md` по закрытым тикетам (DEC-02, DEC-05, DEC-07, ALIGN-01, VER-01, DEFER-04 — номера сверены с бэклогом).

## Журнал изменений

- 2026-07-03 v1.3.0 — по вводным основателя: (1) **токена Esupl вперёд нет** → Э0 перестроен с «живых проб» на «DTO-контракт из зеркала + толерантный разбор + отложенная приёмка в браузере после сохранения токена в настройках»; F0.1/F0.2 → `REMAINS_CONTRACT.md`/`SALES_CONTRACT.md` (не probe-скрипты), F0.3/F0.4 AC помечены отложенными; ADR-016 гарантирует фолбэк C (ручной ввод), чтобы Э3 не ждал живой проверки. (2) **Добавлен F0.6 «Выбор склада назначения для прихода»** — приход пишется на конкретный склад, привязки не было; `list_warehouses` + селектор склада на приёмке + `invoices.target_warehouse_id`. (3) **F2.1 — расширяемые условия поставщика** (`extra_terms jsonb` + `free_delivery_threshold` + `contact_channel/contact_value`), т.к. условия у поставщиков разные. (4) **F4.3 — канал-агностично** (копируемый текст + подсказка канала, без интеграций).
- 2026-07-03 v1.2.0 — второй верификационный проход (Э1–Э5 + консистентность, 6 агентов, 0 блокеров): F1.1 нормализация переписана по фактическому `canonicalText` (свёртка пунктуации/процента) + имя unique-образца исправлено на `suppliers_org_external`; F1.3 точка правки candidate-set перенесена на `invoicesApi.ts:68,139` (backend-провайдер уже игнорирует); F2.1 референс `SupplierOut` → `:13-19` + добавлен образец write-роута `organizations.py:60`; F4.1 референс `getSupplierProductIds` смягчён (backend-стуб `[]`, prefill строится на BE); F4.4 consumption-путь помечен опциональным ПРОКСИ по приходам с формулой; F5.3 место потери страниц перенесено на `shared/ocr/providers/backend.ts:43`, «склейка» помечена как выходящая за FE-scope; 07_PHASES.md Э4a синхронизирован с F4.1/F4.2; F0.5 README-ссылка → `:173-182`.
- 2026-07-03 v1.1.0 — верификационный проход против кода: исправлены 2 блокера (источник токена проб — process.env, а не mvp.fe/.env; F0.4 AC-2 — серверной идемпотентности нет до F5.2, повторно не отправлять); ADR-номера исправлены на 016/017 внутри 04_DECISIONS.md (каталог adr/ не существует); F0.3 дополнен паттерном резолва team/token; F1.1 — согласование нормализации с FE normalizeName; F1.2 — фильтр SEED_MAPPINGS/mock при миграции; F1.5 — переориентирован на существующий test-suite + pytest-маркер; F2.3 — ручной ALTER TYPE для PG-enum; F4.2 — отказ от параметризации LinesTable (привязан к invoiceSession), реюз субкомпонентов; F5.3 — перенос разметки через InvoiceLineDraft.match_origin; добавлены блоки «Референсы» ко всем фичам (пути проверены); обновлён mvp.be/CLAUDE.md (секреты/провайдеры/модули).
- 2026-07-03 v1.0.0 — создан: 19 фич Э0–Э5 с REQ/задачами/AC/приёмкой; общий DoD; трассировка.
