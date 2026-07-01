# Фича: полноценное распознавание накладной — прогресс

> Рабочий файл (результаты + промежуточные данные). Обновляется по ходу.
> Старт: 2026-06-29.

## Требования (как поставлены)

0. Тип бумажной накладной → обрезка (crop) до нужного размера → отдать на распознавание.
1. Загрузить список поставщиков из POS. По распознанному тексту накладной **подобрать**
   наиболее вероятного поставщика (не выбрать вручную, а найти из накладной). Поле редактируемо.
2. Сейчас одна кнопка «подобрать все SKU» — добавить **на каждую позицию** отдельную кнопку
   поиска SKU.
3. Бэк должен **хранить SKU**: в организации; если есть — в подразделении (org → опц. subdivision override).
4. Подтянуть доступные **фасовки** и автоподставить при нахождении соответствия позиции и SKU.
   Иначе непонятно, какая фасовка наша. Подтянуть все, выбрать нужную при получении SKU.
5. По результату — готов отправить накладную в ESUPL; полученные данные пригодны для новой накладной.

## Валидация требований (по факту кода, разведка 2026-06-29)

| # | Требование | Текущее состояние | Вывод |
|---|---|---|---|
| 0 | paper-type → crop → recognize | РАБОТАЕТ (PrepareStep paper/electronic, ImageCropper, BackendOcrProvider→POST /invoices/recognize). Шлётся только page[0]; `invoiceType` не доходит до бэка (ctx игнорируется) | мелкий апгрейд: прокинуть invoiceType-хинт в prompt |
| 1 | supplier auto-match из текста, editable | РЕАЛИЗОВАНО: `bestNameMatch(header.supplierName, suppliers)` (fuzzy, ≥0.6 авто, иначе uncertain+dropdown). Редактируется через dropdown из списка POS | нужен **seed поставщиков** (сейчас `/suppliers` пуст) |
| 2 | per-line кнопка поиска SKU | Частично: глобальная «✨ Подобрать товары» + per-line dropdown с fuzzy-кандидатами; **нет per-line AI-кнопки** | добавить per-line кнопку (suggest для одной строки) |
| 3 | бэк хранит SKU (org → опц. subdivision) | НЕТ таблицы. Только ERP-proxy (пуст). `invoice_lines.sku` — строка, есть pgvector-колонка | **добавить модель Ingredient (org NOT NULL + subdivision nullable) + миграция + repo + endpoint + seed** |
| 4 | фасовки: автоподстановка при match | `packing` есть на строке и редактируется, но НЕ автоподставляется (нет данных фасовок per SKU) | **добавить Packing на бэке; FE автоподставляет default при выборе SKU** |
| 5 | готов к отправке в ESUPL + reuse | submit (POST /invoices) есть; запись в ESUPL **stubbed** (синтет. id); reuse данных — проверить | verify; реальный ESUPL-write — вне объёма (документировано) |

**Блокер верификации:** `GET /suppliers` и `/ingredients` пусты (esupl stub) → REQ 1–4 нельзя проверить в браузере без **seed демо-каталога** (поставщики + SKU + фасовки в org/subdivision). Это первый шаг.

## План (этапы; каждый верифицируется в браузере/curl)

- **B1.** BE: модель `Ingredient` (OrganizationScopedMixin + nullable subdivision_id) + `Packing` (FK→ingredient, name, factor, is_default); миграция 0003.
- **B2.** BE: `IngredientRepository` (скоуп org, + override по subdivision); `GET /ingredients` из локальной таблицы с packings; suggest-matches использует локальный каталог.
- **B3.** BE seed: несколько поставщиков + ингредиенты с фасовками в «ООО Давай поговорим».
- **B4.** BE: прокинуть `invoiceType` в recognize-prompt (REQ 0).
- **F1.** FE: `Sku.packings` + автоподстановка default-фасовки при выборе SKU (REQ 4).
- **F2.** FE: per-line кнопка «Найти SKU» → suggest для одной строки (REQ 2).
- **V.** Верификация в браузере: recognize(mock) → supplier auto-match → per-line SKU → packing auto → submit. Скриншоты.

## Результаты реализации (2026-06-29)

### Backend (mvp.be) — 63 теста зелёные, ruff чист
- **Модели** `Ingredient` (OrganizationScopedMixin + nullable `subdivision_id`) + `Packing`
  (FK→ingredient, name/factor/is_default). Миграция **0003_ingredients_packings** (применена).
- **IngredientRepository** (скоуп org + override subdivision) + `app/services/catalog.py`
  (`list_catalog`, ORM→IngredientRef с packings).
- `GET /api/v1/ingredients` — из локальной таблицы, с фасовками. `POST /invoices/suggest-matches`
  берёт каталог из БД (MatchService.suggest(lines, catalog)).
- **Seed**: 3 поставщика + 5 SKU с 9 фасовками в «ООО Давай поговорим». Идемпотентно.
- Домен: `PackingRef`, `IngredientRef.packings`.

### Frontend (mvp.fe) — tsc + build зелёные
- `Sku.packings` (+ маппинг в BackendPosProvider.listSkus из `/ingredients`).
- **REQ 4**: helper `defaultPacking()` + `lineSkuPicked({…, packing})` — при выборе/матче SKU
  автоподставляется дефолтная фасовка. Поле «Фасовка» получило `key` по skuId, чтобы
  uncontrolled-input визуально обновлялся на матче (фикс UX-бага).
- **REQ 2**: per-line кнопка «✨ найти SKU» (LineRow/LineCard) → `onSuggestLine(lineId)` →
  suggest для одной строки; глобальная кнопка сохранена.

### Верификация в браузере (Playwright, headed) — все этапы ✓
- REQ 0: paper-type + crop («Готово») + recognize(mock) → workbench.
- REQ 1: поставщик «Кофе Импорт» выбран в редактируемом dropdown (OCR-имя «Кофеман» не дало
  уверенного матча → ветка uncertain, что корректно).
- REQ 2: на каждой непривязанной строке кнопка «найти SKU»; fuzzy-подсказки из каталога.
- REQ 3: засеянные SKU доходят до клиента (dropdown + подсказки: «Стакан бумажный 250 мл»,
  «Сахар-песок», «Сироп карамель»).
- REQ 4: клик подсказки «Стакан…» → **Фасовка = 50** (видно), база пересчиталась «50,00 шт».
- REQ 5: «Отправить в Сервер (LocalOS)» → submit прошёл (success). 3 готовы / 5 без товара
  (пропуск). Reuse: маппинги supplier→SKU+packing сохраняются на отправке (mappingStorage),
  авто-применяются на следующей накладной того же поставщика.
- Скриншоты: scratchpad `r-01..r-04`, `r-03-packing.png` — итоговый workbench.

### Отложено / вне объёма
- **B4**: прокидывание `invoiceType` в recognize-prompt (задевает OcrProvider Protocol +
  draft-схему waybill-полей). REQ 0 core (paper-type+crop+recognize) работает без этого.
- Multi-page upload (шлётся page[0]).
- Полный OCR end-to-end и AI per-line через бэк требуют реального `ANTHROPIC_API_KEY`
  (без него — fail-closed; верификация шла на mock-OCR + локальном fuzzy + засеянном каталоге).
- Реальная запись в ESUPL (`write_invoice` stubbed → синтет. external_id).

## Статус
- [x] Валидация + план
- [x] B1–B3 (backend каталог/фасовки/seed); B4 отложен
- [x] F1–F2 (packing auto + per-line кнопка)
- [x] Верификация в браузере (REQ 0–5)
- [x] Сводка

## Журнал
- 2026-06-29: файл создан; разведка (5 направлений); валидация+план; реализация B1–B3+F1–F2;
  миграция 0003 + seed каталога; pytest 63 зелёные; FE tsc зелёный; браузерная верификация
  REQ 0–5 (Playwright) — все этапы пройдены; фикс отображения фасовки. Изменения НЕ закоммичены
  (репозитории коммитит владелец).
