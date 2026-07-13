---
id: ARCH-SUPPLIER-PRICELISTS
type: architecture
title: Архитектурные требования — Прайс-листы и ассортимент поставщика (F72–F75)
status: draft
phase: "Phase 1"
epic: "[[LCOS-E4-suppliers]]"
features: ["[[LCOS-F72-supplier-price-list-upload]]", "[[LCOS-F73-price-list-parsing]]", "[[LCOS-F74-supplier-assortment-freshness]]", "[[LCOS-F75-supplier-price-analytics]]", "[[LCOS-F20-price-history]]"]
entities: ["[[price_list_upload]]", "[[price_list_line]]", "[[suppliers]]"]
adrs: ["[[ADR-021]]"]
requirements: ["[[multitenancy]]", "[[supplier-criteria-registry]]", "[[erp-esupl-integration]]"]
updated: 2026-07-13
owner: Ivan
---

# Архитектурные требования · Прайс-листы и ассортимент поставщика (F72–F75)

Имплементационный дизайн, замыкающий feature-доки [[LCOS-F72-supplier-price-list-upload]] /
[[LCOS-F73-price-list-parsing]] / [[LCOS-F74-supplier-assortment-freshness]] /
[[LCOS-F75-supplier-price-analytics]] и решения [[ADR-021]] на уровень кода: точная схема
БД, контракты API, слои сервисов, швы (storage, OCR, SKU-резолвер), план миграций и
порядок сборки. Документ снимает блокеры, выявленные ревью документации (гейт 1).

## 0. Зафиксированные решения (D)

| # | Решение | Основание |
|---|---------|-----------|
| D1 | **Запуск парсинга — кнопкой, синхронно** в запросе `POST /price-lists/{id}/parse`. Никаких Celery/APScheduler/воркеров. | Стоп-лист roadmap Phase 1 («всё по кнопке»); паттерн `/invoices/recognize` уже синхронный OCR |
| D2 | **Хранилище файлов — локальный диск за швом `StorageProvider`** (`LocalDiskStorage`), S3 — позже без смены кода. | Пилот-одна-кофейня; провайдер-seam как у остальных швов ([[LCOS-F5-provider-seams]]) |
| D3 | **Переразбор ВЫТЕСНЯЕТ прежние строки** загрузки и их проекции (delete old lines + old `supplier_prices`-проекции → insert fresh). Идемпотентность проекции — по `source_price_list_line_id`. | Снимает конфликт append-only ↔ переразбор (ревью B#1). Append-only сохраняется на уровне «наблюдение цены неизменно», а переразбор — это замена *ошибочного распознавания*, не истории |
| D4 | **Идентичность поставщика без POS — суррогатный durable-ключ `local:{supplier_id}`**, который кладётся в `sku_mapping.supplier_external_id`. `Supplier.external_id` (Esupl) используется, если есть; иначе — суррогат. | Владелец требует локальных поставщиков без POS; иначе коллизия bucket `''` (ревью M#1, DEC-0012/ADR-019) |
| D5 | **`extract_price_list` — расширение `OcrProvider`-Protocol** + новый доменный результат `PriceListDraft`, ключ промпта в реестре `system_settings`, парсер, обновление всех реализаций/фейков. | Не «новый метод», а контрактное изменение (ревью M#4) |
| D6 | **Draft-tier SKU-резолвер выносится в переиспользуемый компонент** (`SkuResolver`), общий для строк прайса и (по возможности) draft-пути накладной. Commit-tier fail-closed резолвер `InvoiceService` НЕ трогаем. | `sku_service.py` резолвера не содержит (ревью M#3) |
| D7 | **`supplier_prices` (F20) строится ПЕРВОЙ** как предпосылка. Прайс-фичи проецируют в неё. | F20 в коде ещё не существует (ревью M#7) |
| D8 | Все FK на каталог — **`uuid`** (`ingredients.id` — uuid); durable POS id — **`String(256)`**; денежные — **`Numeric(14,4)`**; статусы/методы — **`enum.StrEnum` + `SAEnum(..., name=...)`**. | Конвенции `models.py`/`base.py` (ревью B#1, m#1) |

## 1. Модель данных (SQLAlchemy-уровень)

Все таблицы — `OrganizationScopedMixin` (даёт `organization_id` RESTRICT+index и
`created_at`/`updated_at` из `TimestampMixin`). Поставщик — org-scoped (без subdivision),
как [[suppliers]].

### 1.1. `supplier_prices` (сначала — предпосылка, [[LCOS-F20-price-history]])

Единый append-only временной ряд цен. Здесь фиксируем только поля, критичные для проекции
прайсов; полная спека — в F20.

```python
class PriceSource(enum.StrEnum):
    invoice = "invoice"
    manual = "manual"
    price_list_upload = "price_list_upload"

class SupplierPrice(OrganizationScopedMixin, Base):
    __tablename__ = "supplier_prices"
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    ingredient_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("ingredients.id", ondelete="SET NULL"))
    pos_ingredient_id: Mapped[str | None] = mapped_column(String(256))       # durable POS-SKU
    price_per_base_unit: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, server_default="BYN")
    source: Mapped[PriceSource] = mapped_column(SAEnum(PriceSource, name="price_source"), nullable=False, server_default="invoice")
    source_invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id", ondelete="SET NULL"))
    source_price_list_line_id: Mapped[int | None] = mapped_column(ForeignKey("price_list_lines.id", ondelete="SET NULL"))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # индексы: (organization_id, supplier_id, ingredient_id, observed_at); (organization_id, pos_ingredient_id, observed_at)
```

- **Идемпотентность проекции:** partial-unique на `source_price_list_line_id` (WHERE NOT NULL)
  → одна прайс-строка = максимум одно наблюдение. При переразборе (D3) старые строки прайса
  удаляются, их проекции уходят каскадом-логикой сервиса (см. §5).
- **observed_at — `timestamptz`.** Проекция из `price_list_line.observed_at` (тип `date`)
  приводится к полуночи UTC этой даты (снимает ревью m#2).

### 1.2. `price_list_uploads` (сущность [[price_list_upload]], F72)

```python
class PriceListSourceKind(enum.StrEnum):
    price_file = "price_file"   # xlsx/csv/pdf-таблица
    photo = "photo"
    booklet = "booklet"
    message = "message"         # вставленный текст, raw_text

class PriceListStatus(enum.StrEnum):
    uploaded = "uploaded"
    parsing = "parsing"
    parsed = "parsed"
    needs_review = "needs_review"
    failed = "failed"

class PriceListUpload(OrganizationScopedMixin, Base):
    __tablename__ = "price_list_uploads"
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    source_kind: Mapped[PriceListSourceKind] = mapped_column(SAEnum(PriceListSourceKind, name="price_list_source_kind"), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(128))
    original_filename: Mapped[str | None] = mapped_column(String(512))
    storage_ref: Mapped[str | None] = mapped_column(String(1024))    # относительный ключ в StorageProvider; NULL для message
    raw_text: Mapped[str | None] = mapped_column(Text)               # для source_kind=message
    effective_date: Mapped[date | None] = mapped_column(Date)        # с какой даты действует; NULL → дата загрузки
    status: Mapped[PriceListStatus] = mapped_column(SAEnum(PriceListStatus, name="price_list_status"), nullable=False, server_default="uploaded")
    parse_provider: Mapped[str | None] = mapped_column(String(64))
    parse_confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    parse_error: Mapped[str | None] = mapped_column(Text)            # заполняется при status=failed
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    note: Mapped[str | None] = mapped_column(String(1024))
    # __table_args__: UniqueConstraint(organization_id, supplier_id, version)  ← снимает гонку версий (ревью #10)
```

- **Присвоение `version`** — под `SELECT ... FOR UPDATE` по (org, supplier) или через
  `UNIQUE`+retry на IntegrityError. Гонка параллельных загрузок закрыта UNIQUE.
- `parse_error` добавлен относительно исходной сущности — для пути `failed` (ревью #5).

### 1.3. `price_list_lines` (сущность [[price_list_line]], F73)

```python
class PriceListLine(OrganizationScopedMixin, Base):
    __tablename__ = "price_list_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    price_list_upload_id: Mapped[int] = mapped_column(ForeignKey("price_list_uploads.id", ondelete="CASCADE"), nullable=False, index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    line_no: Mapped[int] = mapped_column(nullable=False)
    raw_name: Mapped[str] = mapped_column(String(512), nullable=False)
    raw_unit: Mapped[str | None] = mapped_column(String(64))
    raw_packing: Mapped[str | None] = mapped_column(String(128))
    price: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)          # CHECK price >= 0 (см. §6)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, server_default="BYN")
    price_per_base_unit: Mapped[float | None] = mapped_column(Numeric(14, 4))
    pos_ingredient_id: Mapped[str | None] = mapped_column(String(256))
    ingredient_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("ingredients.id", ondelete="SET NULL"))
    resolution_method: Mapped[MappingMethod | None] = mapped_column(_mapping_method_enum)  # NULL = unresolved
    resolution_confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    observed_at: Mapped[date] = mapped_column(Date, nullable=False)              # = upload.effective_date или дата загрузки
    # индексы: (organization_id, supplier_id, observed_at); (organization_id, pos_ingredient_id, observed_at); (price_list_upload_id)
```

- `resolution_method` переиспользует существующий `MappingMethod` (`models.py:75`). `unresolved` = `NULL`.
  **Важно (ревью M#1):** НЕ `create_type=False` per-column — под тестовым харнесом
  `Base.metadata.create_all` (`tests/conftest.py`) миграции не выполняются, и порядок создания
  таблиц не гарантирован → тип `mapping_method` может не существовать к моменту создания
  `price_list_lines`. Решение: один **общий** объект типа, разделяемый колонками:
  `_mapping_method_enum = postgresql.ENUM(MappingMethod, name="mapping_method", metadata=Base.metadata)`
  (SA сам создаёт тип один раз и переиспользует). Проверить `pytest` до мержа.
- **Инвариант append-only** уточнён: `price`/`raw_*`/`observed_at` неизменны *в пределах
  жизни строки*; при переразборе строка **удаляется и создаётся заново** (D3), а не мутирует.
  Поля `resolution_*`/`price_per_base_unit`/`ingredient_id`/`pos_ingredient_id` мутабельны
  через ручную дочистку.

## 2. Швы (провайдеры)

### 2.1. `StorageProvider` (D2)

```python
class StorageProvider(Protocol):
    async def put(self, key: str, data: bytes, content_type: str | None) -> str: ...  # → storage_ref
    async def get(self, key: str) -> bytes: ...
    async def delete(self, key: str) -> None: ...
```

- `LocalDiskStorage(base_dir)` — `base_dir` из конфига `Settings` (поле `storage_dir`, env
  `STORAGE_DIR` — БЕЗ префикса `LCOS_`, т.к. `config.py` не задаёт `env_prefix`; дефолт
  `./var/storage`), в Docker — volume. Ключ: `suppliers/{supplier_id}/price-lists/{uuid4}.{ext}`.
- **Механизм регистрации (ревью #7):** отдельный реестр `register_storage` по образцу
  `register_pos`/OCR-`_OCR_REGISTRY` (`providers/base.py`), НЕ через `ProviderContext`
  (`context.py` держит только `egress`/`ai_vpn`/`session_scope`). Резолв активного провайдера —
  как у POS/OCR. Замена на `S3Storage` — только регистрация, код фич не меняется.
- **Удаление:** при `DELETE /price-lists/{id}` сервис вызывает `storage.delete(storage_ref)`
  до удаления строки БД (best-effort; лог при ошибке).

### 2.2. OCR: `extract_price_list` (D5)

- Расширяем `OcrProvider` (Protocol, `providers/ocr/base.py`):
  `async def extract_price_list(self, content: bytes, mime_type: str) -> PriceListDraft`.
- Новый доменный результат `PriceListDraft` (`domain/entities.py`): `lines: list[PriceListLineDraft]`
  (`raw_name`, `raw_unit`, `raw_packing`, `price: Decimal`, `currency`, `line_no`,
  `confidence: float`), `overall_confidence: float`, `provider_name`.
- Промпт: новый ключ в реестре `system_settings` (`ocr_price_list_prompt`) + `resolve_price_list_prompt`
  по аналогии с `resolve_invoice_prompt` (`providers/ocr/prompt.py`).
- **Обе реализации Protocol (ревью #6):** `extract_price_list` добавить и в `ClaudeVisionOcrProvider`
  (`ocr/claude.py`), и в `GeminiVisionOcrProvider` (`ocr/gemini.py`) — иначе `isinstance(gemini,
  OcrProvider)` (`test_providers_contract.py`) упадёт. Обновить фейки в `tests/fakes.py`.
- **Масштаб (ревью #2, критично для D1):** прайс/буклет = сотни строк, не 10–30 как накладная.
  `claude_complete` дефолт `max_tokens=2048` обрежет выдачу → битый JSON → систематический
  `failed`. Для `extract_price_list` задать высокий `max_tokens` (≈16k, как gemini-путь) и
  разделить ветку `failed` на `too_large` (обрезка/таймаут) vs OCR-недоступность. Egress-таймаут
  (`egress_timeout_seconds=30`) — заложить чанкинг больших буклетов или повышенный таймаут.

### 2.3. `SkuResolver` (draft-tier, D6)

- Новый компонент `services/sku_resolver.py`: `resolve(raw_name, supplier_key, org_id) -> Resolution`
  (fuzzy/ai + `ingredient_cache`), возвращает `pos_ingredient_id`/`ingredient_id`/`method`/`confidence`
  или `unresolved`. Переиспользует `normalize_source_key` (`sku_service.py:27`) и модель
  `sku_mapping` (`scope_type='org'`, `scope_id=organization_id`).
- **Ключ поставщика (D4):** `supplier_key = supplier.external_id or f"local:{supplier.id}"`.
  Этот же ключ пишется в `sku_mapping.supplier_external_id` при обучении маппинга из ручной
  дочистки. Commit-tier резолвер накладных (`InvoiceService._resolve_commit_identities`)
  остаётся fail-closed и НЕ затрагивается.

## 3. Контракты API

Все маршруты — под гейтом `require_module("suppliers")` (404 при выключении). Тенант-скоуп из
JWT-контекста. Ошибки — существующий формат `app/core/errors.py`.

| Метод / путь | Запрос | Ответ | Ошибки |
|---|---|---|---|
| `POST /suppliers/{id}/price-lists` | multipart: `file` (bin) **или** `raw_text` (str) + `source_kind` + `effective_date?` | `201` `PriceListUploadOut` (id, version, status=uploaded) | 404 нет поставщика; 400 ни файла ни текста / оба; 413 > лимита; 415 mime не в allowlist |
| `GET /suppliers/{id}/price-lists` | — | `200` список версий (id, version, status, source_kind, effective_date, uploaded_at) | 404 поставщик |
| `GET /price-lists/{uploadId}` | — | `200` `PriceListUploadOut` + агрегаты строк (кол-во, needs_review count) | 404 |
| `POST /price-lists/{uploadId}/parse` | — (синхронно, D1) | `200` upload со статусом `parsed`/`needs_review`/`failed` + строки | 404; 409 если уже `parsing` |
| `GET /price-lists/{uploadId}/lines` | — | `200` строки (raw_*, price, resolution, is_available) | 404 |
| `PATCH /price-list-lines/{lineId}` | JSON: `ingredient_id?`/`pos_ingredient_id?`/`is_available?` | `200` строка; триггерит проекцию строки (§5) и пересчёт статуса загрузки (§4) | 404 |
| `DELETE /price-lists/{uploadId}` | — | `204`; удаляет файл (§2.1), строки (CASCADE), их проекции (§5, D3) | 404 |
| `GET /suppliers/{id}/assortment` | `?stale_days?` | `200` ассортимент (§7, F74) | 404 |

- **Allowlist mime + лимит** (ревью #4): `price_file` → xlsx/csv/pdf; `photo`/`booklet` →
  png/jpeg/pdf; лимит `PRICELIST_MAX_BYTES` (env без префикса; дефолт 15 MB). Превышение → 413, чужой mime → 415.
- **`409` требует двухфазного коммита статуса (ревью #3):** синхронный `parse` в одной
  транзакции не даст `409` работать (статус `parsing` не виден до коммита). Сервис коммитит
  `status=parsing` ОТДЕЛЬНОЙ транзакцией ДО OCR-вызова, затем коммитит результат
  (`parsed`/`needs_review`/`failed`) второй. Тогда параллельный `parse` видит `parsing` → `409`.
- `source_kind` присылает клиент; сервер валидирует соответствие mime.

## 4. Жизненный цикл статуса загрузки (снимает ревью #5/#6)

```
uploaded ──POST /parse──► parsing ──┬── все строки уверенно ──► parsed
                                    ├── есть low-confidence/unresolved ──► needs_review
                                    └── исключение OCR/битый файл/0 строк ──► failed (parse_error)

needs_review ──PATCH line (дочистка)──► [если не осталось unresolved/low-conf] ──► parsed
parsed | needs_review | failed ──POST /parse (переразбор, D3)──► parsing ──► ...
```

- Переход `needs_review → parsed` пересчитывается сервисом после каждого `PATCH`.
- `failed` фиксирует `parse_error`; проекции не пишутся.
- Пустой парс (0 строк) → `failed` с `parse_error="empty"` (ревью #12а).

## 5. Проекция в `supplier_prices` и идемпотентность

- **Когда:** (а) в конце успешного `parse` — для каждой строки с разрешённым SKU и
  `price_per_base_unit != NULL`; (б) после ручной резолюции в `PATCH` — для этой строки
  (снимает ревью #7).
- **Ключ идемпотентности:** `source_price_list_line_id` (partial-unique). Повторная проекция
  той же строки — upsert, не дубль.
- **Переразбор (D3):** `parse` при существующих строках загрузки: `DELETE FROM supplier_prices
  WHERE source_price_list_line_id IN (строки загрузки)` → `DELETE price_list_lines загрузки`
  → создать новые. Так F20 AC «переразбор не дублирует» выполняется без нарушения истории.
- **Нормализация цены:** `price_per_base_unit = price / packing_factor` (Decimal, без float),
  фактор из `packings` разрешённого SKU. Если SKU разрешён, но фактора нет → `price_per_base_unit
  = price` (фасовка = 1) + warning в лог (ревью #19).
- **Валюта (ревью #8):** `currency` переносится в проекцию as-is. Конвертации нет. Наблюдения
  в разных валютах НЕ агрегируются вместе; F75/F74 группируют по `(sku, currency)`. Не-BYN не
  блокируется.
- **Поставщик без ключа резолва:** при `supplier_key='local:{id}'` резолв работает штатно (D4).
  Если строка `unresolved` — в `supplier_prices` НЕ проецируется, но остаётся в ассортименте по
  `raw_name` (ревью #11).

## 6. Валидация и edge-cases (сводка, снимает ревью #12/#17)

| Кейс | Поведение |
|---|---|
| Цена ≤ 0 | `CHECK (price >= 0)`; строка с `price = 0` допускается (акция/«под заказ»), но НЕ проецируется в `supplier_prices` (не искажает аналитику) |
| Валюта ≠ BYN / мультивалюта | принимается; группировка по валюте (см. §5) |
| Битый файл / OCR down | `status = failed`, `parse_error`; fail-closed, проекций нет |
| Пустой прайс (0 строк) | `status = failed`, `parse_error="empty"` |
| Дубль загрузки | новая `version`; дедупликации нет (append-only версии) |
| Удаление загрузки | `DELETE` каскадит строки + удаляет проекции (D3) + файл |
| Гонка `version` | `UNIQUE(org, supplier, version)` + retry |
| Поставщик без `external_id` | суррогат `local:{id}` (D4) |

## 7. F74 — ассортимент и freshness

- Read-model: «последняя `price_list_line` на `(supplier_id, COALESCE(pos_ingredient_id, raw_name))`»
  по `observed_at`; tie-break — по `price_list_upload.version` DESC (ревью #16б).
- Фильтр `is_available = true` (ревью #16а).
- `is_stale = (now - observed_at) > stale_days`; `stale_days` из конфига `system_settings`
  (дефолт 30), переопределяется `?stale_days`.

## 8. SSOT-реверс поставщика ([[ADR-021]], снимает ревью M#2/M#6)

- `GET /suppliers` и `/suppliers/search` → читают **локальную** `suppliers`
  (`SupplierRepository.list()/search()` уже есть, `repositories.py`). Добавить
  `SupplierService.search()` (сейчас только `list_local`).
- pass-through-функции `list_suppliers`/`search_suppliers` (`routes/suppliers.py:42-73`) и
  хелпер `_ref_to_out` (`:25-33`) удаляются/переписываются на локальное чтение.
- **`SupplierOut.id` = локальный int PK; `external_id` = Esupl-id или NULL.** FE ключуется на
  `external_id` для match/prepare — зафиксировать в контракте FE (не менять на `id`).
- **Обязательный первичный backfill:** орг обязана один раз выполнить `POST /suppliers/sync`
  (иначе пустой справочник). Отразить в AC F17 и онбординге.
- `DEC-0011` частично заменён для справочника поставщиков (каталог ингредиентов — по-прежнему
  POS-SSOT). Добавить обратную ссылку `DEC-0011 → ADR-021`.

## 9. План миграций (порядок, снимает ревью #7)

1. `0011_supplier_prices` — таблица `supplier_prices` c `source`/`source_invoice_id`/
   `source_price_list_line_id` (FK на `price_list_lines` добавляется в шаге 3 или отложенным
   `ALTER` — избежать циклической зависимости: создать `supplier_prices` без этого FK, добавить
   после `price_list_lines`).
2. `0012_price_list_uploads`.
3. `0013_price_list_lines` + `ALTER supplier_prices ADD FK source_price_list_line_id`.
4. Enum-типы (`price_source`, `price_list_source_kind`, `price_list_status`) создаются в своих
   миграциях; `mapping_method` переиспользуется (`create_type=False`).
5. Тесты изоляции арендатора для каждой таблицы (`test_tenant_isolation.py`).

## 10. Порядок сборки (build order)

1. **F20 supplier_prices** (модель + авто-сбор из накладных + маршруты цен) — предпосылка (D7).
2. **StorageProvider** + `LocalDiskStorage` (шов).
3. **F72 upload** (модель `price_list_uploads`, маршруты upload/list/get/delete, версия).
4. **OCR `extract_price_list`** + `PriceListDraft` + промпт + фейки.
5. **`SkuResolver`** (draft-tier) + суррогатный ключ.
6. **F73 parse** (маршрут parse/PATCH, статус-машина, проекция, нормализация).
7. **F74 assortment** (read-model + endpoint).
8. **SSOT-реверс** (list/search локально + search-сервис + backfill).
9. **F75 analytics** (downstream, после F72–F74).

## 11. Осталось калибровать (не блокеры)

- Порог confidence-gate парсинга — конфиг `system_settings` (`price_list_confidence_min`),
  временный дефолт калибруется на пилотном наборе.
- `stale_days` для freshness (дефолт 30).
- Точность парсинга структурированного прайса — метрика на пилоте (журнал).

## 12. Трассируемость

Снимает блокеры ревью: B#1→D8/§1; #1→D3/§5; #2→D2/§2.1; M#1→D4/§2.3; M#3→D6/§2.3;
M#4→D5/§2.2; M#2/M#6→§8; #7→D7/§9; #4/#5/#6/#8/#10/#11/#12/#17/#19→§3–§6; #16→§7.
Источники кода: `db/base.py` (миксины), `db/models.py` (`Ingredient` uuid, `MappingMethod`,
`InvoiceStatus` как SAEnum-паттерн, `InvoiceLine.pos_ingredient_id String(256)`),
`api/v1/routes/suppliers.py` (pass-through → реверс), `providers/ocr/base.py`,
`services/sku_service.py`, `services/invoice_service.py`.
