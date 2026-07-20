---
type: progress
title: "Прогресс: мульти-POS + живые поставщики + планирование закупок/сравнение"
status: done
updated: 2026-07-20
owner-session: dc515d5c
resume-hint: "Читать этот файл ПЕРВЫМ при возобновлении. Единица прогресса = коммит."
---

> **ИТОГ 2026-07-20: ВСЕ основы сделаны, проверены, закоммичены.** Коммиты (mvp.be+mvp.fe):
> FE beb96e4 (sync-кнопка), BE 8652b1c (идемпотентность+гигиена+мульти-POS), BE 38e39af
> (bootstrap поставщиков), BE f6859a2 (планирование F37), BE 78d3940 (сравнение F4),
> FE 8691200 (каркасы /orders + /compare). Регрессия: BE 321 passed, FE tsc✓/vitest 354✓.
> E2E живой стек: sync 52 поставщика; purchase-orders lifecycle (create→confirm→409 frozen);
> compare route 200. Головная миграция: 0019_purchase_orders. NB: docker restart НЕ грузит
> новые модули — нужен `docker compose up -d --force-recreate backend`. Кириллица в curl -d
> ломается в Git Bash (артефакт, не баг: браузер fetch шлёт UTF-8 корректно).
> Не сделано (вне «основы», на будущее): F38 полный экран заказа с SKU-пикером, F40 AI-план,
> склад E7, F4 экономия/тренд/алерты, QR-запись (fail-closed до sandbox), UI-e2e новых
> экранов (проверены tsc+vitest, не прогонялись через браузер).

# Прогресс — мульти-POS, живые поставщики, планирование закупок

> **Как возобновить:** прочитать этот файл → `git -C d:/_work/mvp/mvp.be log --oneline -15`
> и `git -C d:/_work/mvp/mvp.fe log --oneline -15` → сверить с разделом «Задачи» →
> продолжить с первой незакрытой. Каждая задача = один однострочный коммит. Перед
> задачей — ревью требований, после — e2e. НЕ коммитить без зелёных тестов.

## Контекст запроса пользователя (2026-07-20)

1. Поставщики в UI — фейковые (seed), нужны живые из POS-провайдера.
2. Портировать API второго провайдера (Quick Resto, https://quickresto.ru/api/description/intro/),
   чтобы разрабатываться независимо от провайдера.
3. Далее по плану: планирование закупок + сравнение поставщиков по ингредиентам —
   набросать ОСНОВУ, потом регрессия.
4. Правила процесса: однострочные коммиты по завершению задачи; ревью требований
   до и после; e2e; durable-фиксация прогресса (этот файл).

## Ключевые факты (из workflow-исследования, проверены file:line)

- **Почему фейковые поставщики:** `GET /suppliers` (suppliers.py) читает ТОЛЬКО локальную
  таблицу (ADR-021 — поставщик = локальный SSOT). Живой мост `POST /suppliers/sync`
  (→ `SupplierService.sync_from_erp` → `erp.list_suppliers` → upsert) существует, но с FE
  не вызывался и на старте не бутстрапится. Плюс демо-орг без per-org esupl-токена →
  sync всё равно 401. Видны 4 seed-поставщика (seed.py SEED_SUPPLIERS).
- **Шов POS:** `PosProvider` Protocol (app/providers/erp/base.py). Реестр
  `@register_pos(name)` + `get_pos_provider(name)` (cls() без аргументов) +
  `import_providers()` (app/providers/base.py:73-77). Выбор per-org:
  `Organization.pos_provider` (String(32), НЕ enum) → `deps.get_pos`.
- **Креды:** `get_pos_access(session, org_id)` — НОВЫЙ диспетчер (app/core/pos_access.py),
  ветвит по `pos_provider`: esupl → `get_esupl_access`; quickresto →
  (`org.quickresto_layer`, кред `CredentialProvider.quickresto` scope=org). Фолбэк
  `settings.erp_provider`. Fail-closed.
- **Quick Resto API:** база `https://{layer}.quickresto.ru/platform/online`; Basic-auth
  (login:password); операции `/api/list|read|create|update|remove` + query
  `moduleName`/`className`. Поставщики = warehouse.providers.{Organization|Businessman|
  NaturalPerson}. Ингредиенты = ...singleproduct.SingleProduct (measureUnit-объект).
  Накладные = ...documents.incoming.IncomingInvoice. **ЗАПИСЬ fail-closed:** /api/create
  для IncomingInvoice и формат позиций публично НЕ документированы → write_invoice при
  включённом тумблере кидает RuntimeError (не изобретаем wire-формат). Проверять на
  sandbox-облаке 'demo'.

## Состояние git (на момент фиксации)

НИЧЕГО ещё не закоммичено. В рабочем дереве накоплено ТРИ пласта незакоммиченной работы:
- **A (идемпотентность submit, LCOS-F43):** миграция 0014, models idempotency-колонки,
  invoice_service двухфазный submit, invoices route, core/errors, domain/errors,
  FE shared/pos/idempotency.ts, CORS expose_headers. ГОТОВО+проверено (BE 285, FE 354).
- **B (гигиена схемы):** миграции 0015-0017, models (issued_at tz, Decimal-аннотации,
  email lower, check supplier_prices), main.py чистка сессий, repositories/seed email,
  suppliers.py 422-guard, tests/test_schema_hygiene.py. ГОТОВО+проверено.
- **Wave-1 (эта задача):** app/core/pos_access.py (диспетчер), миграция 0018
  (quickresto enum+колонки), models (CredentialProvider.quickresto, quickresto_layer,
  quickresto_store_id), config.py (quickresto_api_base), base.py (import quickresto),
  call-site swaps get_esupl_access→get_pos_access (invoices/ingredients/suppliers routes,
  main, supplier_service), app/providers/erp/quickresto.py (АДАПТЕР — создан вручную
  после того, как workflow был убит), FE (suppliersApi sync mutation, SuppliersPage
  кнопка «Обновить из POS», entities/supplier types+index).

## Коммиты (сделаны)

- FE `beb96e4` — кнопка «Обновить из POS» (sync suppliers).
- BE `8652b1c` — foundation-снимок: идемпотентность submit (LCOS-F43) + гигиена схемы
  (0014-0017) + мульти-POS (диспетчер pos_access, QR-адаптер, миграция 0018). BE 303✓.
  ПРИМЕЧАНИЕ: A/B/wave-1 переплетены в общих файлах (models/repositories/routes) —
  поштучно не разделялись (нет `git add -p`); дальше строго таск=коммит.
- BE `38e39af` — авто-bootstrap синка поставщиков на старте (пустые орг).
- E2E доказано: `POST /suppliers/sync` → 52 живых поставщика из Esupl через диспетчер.

## Основы планирования/сравнения — BE СДЕЛАН (2026-07-20)

- BE `f6859a2` — планирование закупок F37: purchase_orders + purchase_order_lines
  (миграция 0019, head=0019), OrderService (create_draft/replace_lines/confirm/cancel/
  prefill из invoice_lines), 7 роутов /purchase-orders за module_orders_enabled,
  InvalidOrderTransition→409. API-контракт см. workflow wsl7ho41a.
- BE `78d3940` — сравнение F4: PriceService.compare_by_ingredient +
  GET /ingredients/{id}/compare (последняя цена/поставщик, is_cheapest per-currency).
- BE регрессия: 321 passed (+18), ruff чист, миграция 0019 применена.
- Осталось: FE-каркасы /orders и /compare/:id; финальная регрессия+e2e.
- API для FE: POST/GET/PATCH /purchase-orders, /prefill?supplier_id, /{id}/confirm|cancel;
  GET /ingredients/{id}/compare → [{supplier_id,supplier_name,price_per_base_unit,currency,
  observed_at,source,is_cheapest}].

## Задачи (ладдер; единица = коммит)

- [x] **T0.** Восстановить сборку BE: создать app/providers/erp/quickresto.py (import был
      сломан — base.py импортировал несуществующий модуль). СДЕЛАНО: import резолвится,
      ruff чист.
- [ ] **T1 (коммит A).** Идемпотентность submit (LCOS-F43). Файлы см. пласт A.
      Ревью: specs/001 + фича LCOS-F43 (уже done в доках). E2e: уже прогонялся.
- [ ] **T2 (коммит B).** Гигиена схемы (миграции 0015-0017). Пласт B.
- [ ] **T3 (коммит).** Диспетчер POS-доступа + quickresto-привязки (pos_access, 0018,
      models quickresto-поля, call-site swaps). БЕЗ адаптера и FE.
- [ ] **T4 (коммит).** Quick Resto POS-адаптер (read-only, write fail-closed) + config +
      base import + tests/test_quickresto_egress.py + contract-тест. НАПИСАТЬ тест (агент
      не успел) перед коммитом.
- [ ] **T5 (коммит).** FE: кнопка «Обновить из POS» (sync suppliers) + инвалидация.
- [ ] **T6.** Живые поставщики фактически: bootstrap sync на старте (sibling
      _load_catalog_from_erp) ЛИБО lazy pass-through в list_local, + чистка/деактивация
      фейковых seed. РЕШИТЬ вариант при ревью требований (Option 2 из исследования —
      рекомендован). Коммит.
- [ ] **T7 (коммит).** ОСНОВА планирования закупок (purchase planning). Сущности
      purchase_orders/lines уже есть в docs entities — сверить, набросать сервис+роут+FE-каркас.
- [ ] **T8 (коммит).** ОСНОВА сравнения поставщиков по ингредиентам (supplier compare).
      Опереться на supplier_prices (книга цен, F20) — уже есть.
- [ ] **T9.** Регрессия: полный BE pytest + FE vitest + e2e по всему затронутому.

## Инварианты, которые нельзя нарушить

- Esupl-организации после диспетчера — поведение бит-в-бит прежнее (весь сьют зелёный).
- Fail-closed везде: нет крединала → отказ, не тихий дефолт. QR-запись отключена.
- Тестовая БД общая — НЕ гонять pytest параллельно из нескольких мест.
- `alembic_version.version_num` = varchar(32) → id ревизий ≤32 символов.
- Головная миграция: 0018_quickresto_provider (down → 0017_email_lower_refresh_idx).

## Ревью требований планирование/сравнение — СДЕЛАНО (2026-07-20)

Полный отчёт: workflow w51a4fbja. Выводы:
- **Планирование (эпик E8, F37/F38):** код 0% (docs-only задел). Основа = ручной черновик
  заказа. Зеркалить `Invoice` (models.py:276): `SubdivisionScopedMixin`, int pk, нативный
  enum. Prefill из `invoice_lines`, индикатор min-order из `suppliers.min_order_amount`.
  РЕШЕНИЯ: pk=int; PurchaseOrderStatus=draft/confirmed/sent_manually/received/cancelled;
  origin=manual/prefill/ai; module_orders_enabled (mirror suppliers default). ВНЕ основы:
  склад E7, reorder_point, AI-планировщик F40, сверка приходов F42.
- **Сравнение (F4 superseded, но данные есть):** код 0% кросс-разреза; примитив есть
  (`PriceService.price_history(ingredient_id, supplier_id=None)`, repo.history_for_ingredient).
  Основа = `PriceService.compare_by_ingredient(ingredient_id)` (group-by-supplier, latest,
  +имя поставщика, is_cheapest в пределах валюты) + `GET /ingredients/{id}/compare`. Ключ =
  ingredient_id (uuid), НЕ pos_ingredient_id. Переиспользовать гейт suppliers. ВНЕ основы:
  экономия/мес, тренд 90д, алерты F4-B2, LLM-explain, конвертация валют (ARCH §5 запрещает).

## Открытые вопросы (решить при ревью требований)

- T6: bootstrap-sync vs lazy pass-through vs merge-on-read (см. fix_options исследования).
- QR account_id для payload записи — не нужен, пока запись fail-closed.
- Судьба 4 фейковых seed-поставщиков (external_id 501/301/302/303 не совпадут с реальными).
