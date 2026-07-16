# План: поставщики-таблица + страница деталей, диплинки по проекту, UX валидации воркбенча

**Дата:** 2026-07-16
**Статус:** план согласован по результатам мульти-агентного анализа (5 исследователей кода/доков + 3 независимых дизайна + адверсариальная критика)
**Скоуп:** только FE (mvp.fe). Бэкенд не меняется — все нужные эндпоинты уже существуют (`GET /suppliers/{id}` suppliers.py:75, `GET /invoices/{id}` invoices.py:117).

## Пожелания заказчика

1. Поставщики — такой же таблицей, как накладные; клик → страница деталей с крошками и табами (инфо, прайсы, обновление прайса и т.д.).
2. Диплинки по всему проекту: URL на нужную табу нужного поставщика; то же для накладных.
3. Переделать UX отображения незаполненных/ошибочных данных при вводе накладной.

Жёстко: не потерять функционал, следовать FSD и best practices.

## Что подтвердила документация

- Страница деталей с табами фактически предписана AC: F17 AC-FE-2 (карточка), F72 AC-FE-1/2 (блок «Прайсы»), F74 AC-FE-1 (слово «вкладка» в AC про ассортимент), F20 (таблица цен + история), F75 (аналитика).
- Легаси-план Э2 закладывал маршрут `/suppliers/:id` (archive/07_PHASES.md:56).
- Ограничители: mobile-first (44px, bottom-sheet), module-gate suppliers (404 при выключении), контракт id (URL = локальный `SupplierOut.id`; `external_id` — только POS match/prepare, ARCH §8), photo-first флоу воркбенча не трогать, никаких chart-библиотек, всё по кнопке.

## Схема URL (целевая)

```
/login                                  public
/                                       → /invoices
/invoices                               список (без изменений)
/invoices/new                           воркбенч (wizard остаётся в Redux — фото не переживают reload, диплинк на шаг бессмыслен; осознанное решение)
/invoices/:invoiceId                    НОВАЯ read-only деталь накладной
/suppliers                              таблица (+ ?hidden=1 — фильтр скрытых)
/suppliers/:supplierId                  layout, index → redirect на info
/suppliers/:supplierId/info             реквизиты + критерии + «Редактировать»
/suppliers/:supplierId/price-lists      прайсы (+ ?upload=<uploadId> — раскрытая версия)
/suppliers/:supplierId/assortment       ассортимент
/suppliers/:supplierId/prices           книга цен (+ ?sku=<id> — раскрытая история)
/suppliers/:supplierId/analytics        аналитика
/settings                               без изменений
*                                       НОВАЯ NotFoundPage
```

Решения:
- **Табы = сегменты пути через вложенные маршруты** (не `?tab=`): участвуют в крошках/заголовке/NavLink isActive/back-кнопке; невалидный слаг → `<Navigate to="info" replace>`. Query-вариант отвергнут критикой (ломает isActive/крошки, `setSearchParams` затирает соседние параметры).
- **Tenant в URL не кодируем**: бэкенд — граница изоляции (чужой id → 404 → экран «не найдено в текущем контексте»); при switch-context с детального маршрута — редирект на родительский список.
- searchParams — только вторичное состояние (`?hidden=`, `?upload=`, `?sku=`), сеттеры с `replace: true` (не засорять history).

## Этап 0 — фундамент роутинга (без визуальных изменений)

1. `shared/config/routes.ts` (НОВЫЙ, SSOT): константы + билдеры (`ROUTES.suppliers.detail(id, tab)`, `ROUTES.invoices.detail(id)`), `ROUTE_PATTERNS` для matchPath, `type SupplierTab` + guard `isSupplierTab`. Все строковые литералы navigate/Link по проекту → на ROUTES.
2. `shared/lib/url/`: `sanitizeInternalPath` (только пути с `/`, не `//` — защита от open redirect), обёртки над useSearchParams.
3. Intended URL: `AuthGuard.tsx` → `state={{from: pathname + search + hash}}`; `LoginPage.tsx` → `navigate(sanitizeInternalPath(state?.from) ?? ROUTES.invoices.list)`. Logout — без from.
4. `App.tsx`: новые lazy-маршруты, `path:'*'` → `pages/not-found`, метаданные `handle: {title, crumb, footer}` на маршрутах.
5. `widgets/breadcrumbs` + `HeaderTitle` + `footerActions`: со статических словарей (точное совпадение pathname — параметрные URL молча ломают все три) на `useMatches()`/`matchPath` + handle. Существующее поведение 6 маршрутов — байт-в-байт (снапшот-тесты до/после). Крошка с именем сущности — `useGetSupplierQuery(id, {skip: вне matched-маршрута})`, из тёплого кэша; пока грузится — скелетон.
6. Общие фиксы из критики:
   - footer 'back': при пустой истории (прямой заход по диплинку в новой вкладке) `navigate(-1)` мёртв → fallback на родительский список.
   - нечисловой/мусорный `:id` (`/suppliers/abc`): FastAPI отдаст 422 — маппить 422 и 404 в состояние «не найдено».
7. `shared/ui/ScrollTable.tsx`: опциональный `onRowClick` (+cursor-pointer, role, Enter для a11y). Обратная совместимость.
8. Проверить PWA `navigateFallback` (vite.config.ts:46 — уже `/index.html`, denylist для `/api` проверить).

## Этап 1 — поставщики: таблица + страница деталей

**1a. FSD-переносы (движение, не переписывание) — отдельный коммит:**
- `pages/suppliers/lib/criteria.ts` (+тест) → `entities/supplier/lib/` (нужен списку и деталям).
- `SupplierForm.tsx` + `CriteriaFields.tsx` (+тест) → `features/supplier-form/` (используется списком-create и деталью-edit; кросс-page импорт запрещён FSD). Код не меняется.
- `entities/supplier/api/suppliersApi.ts`: + endpoint `getSupplier` → `GET /suppliers/{id}`, тег `{type:'Supplier', id}`. `getManagedSuppliers`/`getSuppliers`/create/update НЕ трогать — на них SupplierSelector воркбенча и supplierFactory SKU-пикера.

**1b. Список — `SuppliersPage.tsx` по эталону InvoicesListPage:**
- Desktop (md+): ScrollTable. Колонки: Название (+бейдж «Скрыт») | УНП | Контакт (лицо+телефон) | Условия (чипы visibleCriteria, truncate) | Мин. партия. Без пагинации (список короткий).
- Mobile: существующие SupplierCard как кликабельные карточки.
- Клик → `navigate(ROUTES.suppliers.detail(id))`. Drawer и `useState detail` удаляются.
- Сохранить: «Показывать скрытых (N)» → `?hidden=1`; «Добавить» (шапка + empty-state); спиннер/ошибка/empty; тосты.
- Колонки «последняя поставка / число SKU» (F17 AC-FE-1) — осознанный дефер: нужна BE-агрегация.

**1c. Деталь — `pages/supplier-detail/`:**
- `SupplierDetailPage.tsx` — layout: `useParams`, `useGetSupplierQuery`; шапка (имя, УНП, бейдж «Скрыт», Pencil → SupplierForm-модалка — transient, без URL); таб-бар из NavLink (isActive из URL); `<Outlet/>`; 404/422 → «не найден» + CTA к списку (покрывает и module-gate, и чужой tenant).
- `tabs/InfoTab.tsx` — НОВАЯ таба: read-view всех полей карточки + критерии через visibleCriteria + CTA «Редактировать». Дефолтная таба = info (осознанная смена с 'pricelists': у страницы, в отличие от drawer, есть идентичность «карточка поставщика»).
- `tabs/PriceListsTab | AssortmentTab | PricesTab | AnalyticsTab` — перенос из SupplierDetail.tsx **вербатим, отдельным коммитом до любых улучшений** (компоненты уже принимают `supplierId: number` — миграция прямая). RTK-хуки и точечная инвалидация тегов PriceList/Assortment/SupplierPrice не меняются.
- `?upload=` — авто-раскрытие версии прайса; `?sku=` — раскрытая история цены.
- Mobile: таб-бар — горизонтальный скролл-чипсет ≥44px.
- SupplierDetail.tsx (drawer) удаляется после grep импортёров.
- UX-выигрыш бесплатно: контент выходит из тесных 92vh bottom-sheet в полноценный page-scroll; back-кнопка браузера работает.

**Acceptance: чек-лист 30 пунктов функционала** (из инвентаризации, см. Приложение А) — особо side-effects: PATCH строки прайса → запись в sku_mapping (moat, общий с накладными) + проекция в supplier_prices + пересчёт needs_review↔parsed; кросс-инвалидация табов; книга цен пополняется и из накладных.

## Этап 2 — накладные: деталь + клик из списка (независим от этапа 1)

1. `shared/pos/types.ts`: `PosOrderDetail` (+lines, деньги строками); `shared/pos/provider.ts`: метод `getOrder(id)`; реализация в `providers/backend.ts` — **прямой `GET /invoices/{id}`, мимо ordersCache** (деталь всегда свежая); mock-провайдер — честная реализация.
2. `entities/order/api/ordersApi.ts`: + `getOrder`.
3. Бейджи Submitted/Paid из InvoicesListPage → `entities/order/ui/badges.tsx` (нужны списку и детали; различие prepared/written сохраняется — F10 AC-FE-3).
4. `pages/invoice-detail/InvoiceDetailPage.tsx` — read-only: шапка (№ + CopyButton, поставщик, даты, сумма, бейджи), таблица строк (ScrollTable / mobile-карточки). Без редактирования (Esupl read-only, F11). Воркбенч в деталь НЕ превращаем — он завязан на OCR-сессию/fileHolder и не гидрируется; гидрация по id — дефер.
5. `InvoicesListPage.tsx`: `onRowClick` → `/invoices/:id`; OrderCard onClick; CopyButton — stopPropagation. Infinite scroll не трогается.

## Этап 3 — UX валидации воркбенча (только рендер; validate.ts — аддитивно)

Модель `Issue {severity, message, focusId?, lineId?}` уже спроектирована под кликабельную сводку — слабые места в рендере (подтверждено исследованием).

1. **Починить сломанные якоря**: SupplierSelector получает проп `selectId` → `id="hf-supplier"` (сейчас клик по блокеру «Поставщик не распознан» — no-op: элемента с таким id не существует); убрать дублирующий caption «Поставщик».
2. **Sticky ValidationBar** (desktop, под шапкой воркбенча) — чипы «⛔ N · ⚠ M» / зелёный «✓ Готово к отправке», `aria-live`. Клик → раскрытие полного списка (текущая ValidationPanel как IssueList). Учесть: скроллится wrapper AppLayout, не window (scroll-fix 2026-07) — sticky относительно правильного контейнера + `scroll-margin` на якорях.
3. **Mobile**: в нижний бар — чип проблем → bottom-sheet со списком issue (обобщить паттерн из SupplierForm в `shared/ui/BottomSheet`); **тап по disabled-кнопке «Отправить» открывает тот же sheet** (title-тултип на таче не существует — сейчас причина disabled недоступна вообще). Текст «Исправьте обязательные поля выше…» удалить (перекрывается баром).
4. **Навигация к строкам**: `id="line-${line.id}"` на LineRow/LineCard; `go()` для lineId — scrollIntoView({block:'center'}) + flash-ring ~1.5s; photoToggled(true) только если у строки есть bbox.
5. **Агрегаты → адресность без разворота**: validate.ts аддитивно получает `lineIds?: number[]` на агрегатных issue («В N строках qty×цена≠сумма», «N строк неуверенно»); панель рендерит кликабельные чипы «№3, №7, №12». (Разворот в per-line issues отвергнут критикой: инвазивен для SSOT, метки «стр. 4» плывут при ручном добавлении/удалении строк.)
6. **Консистентная индикация полей шапки**: единая семантика block=danger / warn=warn через `fieldToneClass(severity)` по данным issues (map focusId→severity). Сейчас: склад красный, поставщик жёлтый, дата и итог (блокеры!) — без подсветки. + `aria-invalid`/`aria-describedby`, текст ошибки = message из Issue (SSOT). Невалидная OCR-дата: helper «Распознано: „{raw}“» под пустым input.
7. **Развести sumWarn и confWarn** (сейчас сливаются в один жёлтый): чип «≠ сумма» (title с ожидаемым qty×цена) vs чип «OCR ~{conf}%» («сверьте с фото», тап → фото на bbox). Данные уже в useLine.
8. **4-state бейдж mappingState**: «✓ авто» (подставлено — глянь) / «✓ сохранено» / «✓ вручную» / «— нет товара». Данные уже ведутся в sessionSlice, UI показывает только бинарник.
9. **Новые warn'ы в validate.ts** (аддитивно, с тестами): (a) «K строк без товара — будут пропущены при отправке» при 0 < unmapped < total (сейчас панель молчит, а строки молча пропускаются); (b) «Поставщик определён неуверенно — подтвердите» (opts.supplierUncertain).
10. **Touch-targets ≥44px** (P1 #6 аудита): глаз-иконка (15px), удаление строки (p-1), ссылки-кандидаты (11px). + стэк полей шапки на <sm (P1 #4).
11. **Опционально, отдельным финальным коммитом** (изменение данных, не рендера): quick-fix «Подставить Σ строк» в итог и «принять qty×цена» в строке.

**Инварианты (не трогать):** photo-first 2 шага; блокировка по block-issues; ConfirmDialog; prepared/written-тосты; sentRegistry-дедуп; live-валидация. Новая панель = точка встраивания будущего F21 (сигнал цены).

## Этап 4 — полировка

- ContextSwitcher: перевести fire-and-forget на awaited mutation → redirect с детальных маршрутов на родительский список.
- Диплинк-матрица QA: каждый URL — reload / прямой заход разлогиненным (→ login → возврат на intended) / back-forward / switch-context / несуществующий и нечисловой id / выключенный module_suppliers_enabled.
- Viewport-чеклист из UX_AUDIT: 320/375/414/640/768/1024/1200.
- Короткий ADR «Диплинки и tenant-скоупинг» в mvp.docs/adr (URL tenant-агностичен; id локальный, не external_id; табы = path; wizard вне URL).

## Порядок и поставка

Этап 0 → (1 и 2 независимы, любым порядком) → 3 → 4. Каждый этап — отдельный PR: build green + vitest (criteria/CriteriaFields/validate-тесты обязаны пройти после перемещений) + ручной чек-лист.

## Деферы (зафиксировано, не в этом скоупе)

1. SKU-пикер вместо текстового id в строках прайса — НЕ дёшево: готового пикера в shared нет, SkuSelect2 не грузит каталог сам, развилка `ingredient_id | pos_ingredient_id` в PATCH. Отдельная задача.
2. Колонки «последняя поставка / число SKU» (F17 AC-FE-1) — нужна BE-агрегация.
3. Скрытие пункта нав «Поставщики» при выключенном модуле (F17 AC-FE-4) — существующий долг, не регресс редизайна.
4. Сортировка/фильтры/поиск в таблицах (кроме `?hidden=1`).
5. Гидрация воркбенча по id (открыть существующую накладную на редактирование).
6. Sparkline в ценах, F21-сигнал цены (planned).

## Главные риски

1. Перенос табов SupplierDetail (700+ строк, side-effects sku_mapping/проекций) → перенос вербатим отдельным коммитом, API-слой не трогается, ручная проверка «PATCH строки → цена появилась в табе Цены».
2. Рефактор Breadcrumbs/HeaderTitle/footerActions → снапшот-тесты поведения существующих маршрутов до/после.
3. Расширение PosProvider.getOrder → проверить все имплементации (backend + mock).
4. validate.ts — единственная правка SSOT-логики, строго аддитивная (lineIds + 2 warn), severity существующих правил не менять, тесты до/после.
5. PWA: старый SW после деплоя → проверить navigateFallback/denylist, механизм refresh уже есть.

## Приложение А — чек-лист сохранения функционала поставщиков (acceptance этапа 1)

Список: все поля карточки + критерии в порядке реестра; фильтр скрытых; создание (шапка+empty-state, обязательное только name); редактирование (+is_active только в edit); скрытие вместо удаления; динамическая форма критериев из criteria-schema (6 kind'ов); состояния loading/error/empty; тосты мутаций; mobile bottom-sheet + 44px.
Деталь: загрузка прайса 4 источниками (file XOR raw_text, effective_date); версионирование v1..vN; статусы uploaded/parsing/parsed/needs_review/failed + parse_error; перезапуск парсинга (идемпотентный, дифф-тосты); удаление версии (с очисткой проекций); строки прайса (raw_name/unit, цена, статус резолва manual/fuzzy/ai/нет); ручная привязка к SKU (side-effect: sku_mapping moat + проекция цен + пересчёт статуса); toggle is_available; ассортимент с freshness/stale (30 дней); книга цен (текущая/пред./Δ% с семантикой рост=красный, источник invoice/manual/price_list_upload); история цены по SKU; ручной ввод цены; аналитика (рост цен + рост ассортимента); переход к редактированию из деталей.
Инварианты: кросс-инвалидация RTK-тегов; цены пополняются из накладных, не только прайсов; sku_mapping общий с потоком накладных; module-gate 404; деньги строками; SupplierSelector/supplierFactory не сломаны.
