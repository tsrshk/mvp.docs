# Прогресс: UX + код-ревью всех страниц и фикс значимых багов (2026-07-20)

**Роль:** код-ревьювер + UX-ревьювер. Обход всех страниц в реальном браузере (headless
Chrome CDP, desktop 1440 + mobile 390), UX+code review через workflow с адверсариал-
верификацией, затем фикс самых значительных багов с проверкой в браузере.

## Сделано
- Обход 13 роутов × 2 вьюпорта: скриншоты+консоль+метрики в
  `scratchpad/ux/report.json` (+ PNG). Ни одной JS-ошибки, ни одного overflow-X кроме
  /invoices/new (см. ниже).
- Ревью-workflow (10 агентов review + 28 verify): **39 находок, 38 подтверждено, 1 отклонена.**
  Полный список — `scratchpad/ux/report.json` (task w8i67wcmp.output).
- Проверено вручную и признано НЕ-багами: `/orders` использует `/purchase-orders`
  (пустое состояние легитимно); кнопка «Сравнить» защищена `ingredient_id != null`.

## План фиксов (самые значительные) — ВСЕ СДЕЛАНЫ и проверены в браузере (7 коммитов в mvp.fe)
- [x] FIX-1 [security] `.env.example` → одна строка `VITE_DEBUG_MOBILE=false`; гейт
  `mobileDebug.ts` захардкожен на `import.meta.env.DEV` (в проде оверлей не смонтируется).
  Проверка: grep → 1×false; tsc.
- [x] FIX-2 [mobile nav] `HeaderDrawer` `<a>` → `NavLink onClick={onClose}` (через ROUTES).
  Проверка в браузере (390px): маркер `window` пережил переход /invoices→/orders → SPA, без релоада.
- [x] FIX-3 [settings] Убран мёртвый мобильный футер-save (`App.tsx`: `footer:null`); рабочая
  in-card «Сохранить» остаётся. Проверка (390px): `<footer>` отсутствует, in-card кнопка есть.
- [x] FIX-4 [invoice-import] `InvoiceImportPage` — recognize-флаг снимается всегда (нет latch);
  без фото тост «Сначала прикрепите…» вместо тихого no-op. Проверка (390px): тост + остаёмся на prepare.
- [x] FIX-5 [invoice-import] Степпер — свои gutters `px-4 md:px-5.5` вместо breakout `-mx-*`.
  Проверка: overflowX=false на 1440 и 390.
- [x] FIX-6 [compare] `IngredientComparePage` — ArrowLeft в шапке, `navigate(-1)`/fallback на
  /suppliers при deep-link. Проверка: кнопка есть, клик на deep-link → /suppliers.
- [x] FIX-7 [orders] Обе «Отменить» → `ConfirmButton` (двухтап). Проверка в браузере: 1-й тап
  взвёл «Точно отменить?», статус остался draft; тестовая заявка id=2 удалена из БД.

**Регрессия после фиксов:** tsc ✓, vitest **354/354** ✓.

## Punch-list (значимо, но не в этой волне — для владельца)
a11y-метки форм (login/settings/supplier — label без htmlFor/id) · RU-формат сумм в orders
(сырой Decimal «151.920») · перевод технических англ. ошибок в UI (compare/invoice-detail) ·
поиск/фильтр в длинном списке поставщиков · мёртвый колокольчик + мёртвая смена
подразделения в мобильном drawer · заголовок ингредиента на экране compare (нужна
доработка BE — вернуть имя SKU) · арифметика построчки invoice-detail (1 × 52,80 → 63,36) ·
дубль-заголовки «Условия поставок/поставки» в карточке · и пр. косметика.

## Гигиена данных
Пилотная орг забита тестовым мусором («E2E Поставщик …», «E2E Прайс …», ~60 строк) от
прежних e2e-прогонов — почистить (SQL DELETE по префиксу E2E в этой орг).

## Как возобновить
Стек: BE docker (healthy, порт 8000), FE `npm run dev` (5173), headless Chrome CDP 9222
(профиль scratchpad/chrome-ux). Логин e2e: **oter/oter** (admin/admin — это SQLAdmin).
Скрипт обхода: `scratchpad/ux-capture.mjs`. Верификация фиксов — CDP-эвал в браузере.
