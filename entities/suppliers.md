---
id: suppliers
type: entity
title: suppliers — поставщики (общие для организации)
status: built
scope: org
table: suppliers
pk: id (int)
used_by: ["[[LCOS-F17-supplier-cards]]", "[[LCOS-F18-supplier-criteria]]", "[[LCOS-F11-esupl-read]]", "[[LCOS-F9-line-matching]]", "[[LCOS-F10-invoice-status-machine]]", "[[LCOS-F72-supplier-price-list-upload]]", "[[LCOS-F73-price-list-parsing]]", "[[LCOS-F74-supplier-assortment-freshness]]", "[[LCOS-F75-supplier-price-analytics]]"]
requirements: ["[[supplier-criteria-registry]]", "[[multitenancy]]", "[[ADR-021]]"]
sources: [mvp.be/app/db/models.py:198-232, 01_ARCHITECTURE.md#data-model, APP_OVERVIEW.md §10]
updated: 2026-07-13
---
# suppliers · поставщики

**Scope:** org (общие для организации, без subdivision) · **Status:** built

## Назначение
Карточка поставщика: идентификация, контакты, условия доставки и гибкий набор критериев
([[supplier-criteria-registry]]). Поставщик общий на уровне организации. Матчинг накладной
к поставщику использует **blended score** (trigram 0.65 + token Jaccard 0.35, min-порог
0.4) — НЕ «Jaccard≥0.5» (историческая формулировка в старых доках неверна). См.
[[LCOS-F17-supplier-cards]], [[LCOS-F18-supplier-criteria]].

### Происхождение и SSOT

По [[ADR-021]] `suppliers` — **локальный SSOT** справочника поставщиков: список и карточка
читаются из локальной таблицы, а не из внешнего источника. `external_id` — **опциональная**
ссылка на поставщика в Esupl following, используется ТОЛЬКО для matching и как durable
`supplier_external_id` в [[sku_mapping]]; это **не источник** списка поставщиков.

**Важно (текущее ≠ целевое):** СЕЙЧАС в коде `GET /suppliers` и `/suppliers/search` — это
живой pass-through из Esupl following (по DEC-0011 «POS = SSOT»). [[ADR-021]] реверсирует
ровно эту часть: list/search переводятся на **локальное чтение** из таблицы `suppliers`
(каталог ингредиентов остаётся POS-SSOT). Локальная карточка (create/update/get/sync/match)
уже жива и остаётся без изменений.

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | int PK | no | autoincrement |
| `organization_id` | uuid FK→organizations | no | граница изоляции, RESTRICT, индексируется |
| `external_id` | varchar(128) | yes | id поставщика в Esupl; индексируется |
| `name` | varchar(512) | no | название |
| `tax_id` | varchar(64) | yes | УНП / налоговый id |
| `contact_name` / `phone` / `messenger` | varchar | yes | контакты F3-B1 |
| `delivery_terms` | text | yes | условия доставки, свободный текст |
| `min_order_amount` | numeric(14,2) | yes | минимальный заказ (сумма) |
| `min_order_note` | varchar(512) | yes | примечание к минимальному заказу |
| `criteria` | JSONB | no | default `{}`; гибкие критерии по реестру [[supplier-criteria-registry]] |
| `is_active` | boolean | no | default true; мягкое скрытие |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Отношения, FK, уникальность
- FK `organization_id → organizations.id` **RESTRICT** (организацию с поставщиками
  нельзя удалить).
- `invoices` — one-to-many (без cascade delete; см. ниже).
- **Уникальность:** `suppliers_org_external` UNIQUE(`organization_id`, `external_id`).
- **Индекс:** `ix_suppliers_org_name`(`organization_id`, `name`).
- [[invoices]].`supplier_id → suppliers.id` **без ondelete** (семантика PG по умолчанию —
  RESTRICT) — отсюда `is_active` для мягкого скрытия вместо удаления.
- `criteria` — JSONB, а не колонки: критерии добавляются/удаляются без миграции;
  значения валидируются по реестру `app/domain/supplier_criteria`.
- **Прайс-листы и ассортимент:** поставщик — владелец прайсовых данных. [[price_list_upload]].`supplier_id → suppliers.id`
  **CASCADE** (загруженные документы/фото/сообщения) и [[price_list_line]].`supplier_id → suppliers.id`
  **CASCADE** (позиции прайса, денормализовано). Через них строится ассортимент и freshness
  ([[LCOS-F74-supplier-assortment-freshness]]) и проекция цен в единый ряд supplier_prices.

## Используется фичами
[[LCOS-F17-supplier-cards]] (CRUD карточки + условия), [[LCOS-F18-supplier-criteria]] (реестр гибких критериев),
[[LCOS-F11-esupl-read]] (чтение Esupl — `external_id`), [[LCOS-F9-line-matching]]/[[LCOS-F10-invoice-status-machine]] (авто-матч поставщика
во флоу накладной, payload), [[LCOS-F72-supplier-price-list-upload]] (загрузка прайса/буклета/фото за поставщика),
[[LCOS-F73-price-list-parsing]] (парсинг прайса в позиции), [[LCOS-F74-supplier-assortment-freshness]] (ассортимент + freshness на карточке),
[[LCOS-F75-supplier-price-analytics]] (аналитика цен/ассортимента по всем источникам).

## Источники
- `mvp.be/app/db/models.py:198-232` (модель `Supplier`)
- [[supplier-criteria-registry]], [[architecture]] — data-model, APP_OVERVIEW.md §10
