# Комплексный аудит устойчивости (BE + FE + БД) — 2026-07-08

Проверка по 6 требованиям. Многолинзовый аудит-workflow (7 линз, adversarial-verify) частично
попал под API-outage (529) — 29 сырых находок восстановлены из журнала, приоритетные
верифицированы вручную по коду. Ниже — что исправлено и что осознанно отложено.

## Итог по требованиям

1. **Архитектура/связи** — соответствует: слои `api→services→providers/repos`, ORM≠домен,
   тенант-скоуп по `organization_id`, module-gate. Нарушений на рабочих путях не найдено.
2. **Устойчивость / без эмуляций и фолбеков** — найдено и **исправлено 8** реальных мест
   (см. ниже). VPN/AI/секреты уже были корректно fail-closed (`http.py`, `ai.py`, `errors.py`).
3. **Смена провайдеров POS/AI + VPN-тумблер** — сделано корректно: registry/factory (ERP из env,
   OCR/AI из БД в рантайме), VPN fail-closed. Мелкие заметки ниже (не блокеры).
4. **Локальный тест с реального телефона в одной Wi-Fi** — было **сломано** (localhost), теперь
   работает zero-config. См. `mvp.fe/TESTING.md`.
5. **Mobile-first + desktop-паритет** — рабочие страницы адаптивны; e2e гоняет оба вьюпорта.
6. **Юнит + e2e (Playwright)** — **да, сделано**: vitest (юнит) + Playwright (e2e) настроены,
   харнесс рабочий. См. `mvp.fe/TESTING.md`.

## Исправлено (приоритет — «сделать стабильным то, что уже работает»)

| # | Проблема (эмуляция/маскировка) | Где | Фикс |
|---|---|---|---|
| 1 | Накладная в статусе `validated` (НЕ отправлена) помечалась «отправлена» → навсегда блокировала повторную отправку после починки маппинга | `mvp.fe/entities/invoice/api/invoicesApi.ts` | `markInvoiceSent` только для `written`/`prepared`/mock, не для `validated` |
| 2 | SKU-фабрики (dropdown) ходили raw `fetch` по относительному `/api/v1` → на телефоне били в dev-сервер, мимо 401-refresh | `mvp.fe/shared/sku/factory/*` | Переведены на `backendRequest` (абсолютный URL + refresh + единый контракт) |
| 3 | `IngredientSKUFactory.save()` глотал ошибку и возвращал void (неотличимо успех/провал) | там же | Бросает при ошибке (наблюдаемо); тест переписан |
| 4 | `esupl.get_ingredient` ловил ЛЮБОЕ исключение → `None` → outage/VPN-сбой выглядел как «ингредиент не найден» на fail-closed commit | `mvp.be/providers/erp/esupl.py` | Только реальный 404 → None; сетевые/5xx/VPN пробрасываются (правдивый «POS недоступен») |
| 5 | `POST /ingredients/sync-from-erp` возвращал HTTP 200 с `{"status":"error"}` | `mvp.be/api/v1/routes/ingredients.py` | Ошибки пробрасываются в глобальные хендлеры (VpnUnavailable→503 и т.д.) |
| 6 | `/health` отдавал 200 при недоступной БД | `mvp.be/api/v1/routes/health.py` | 503 когда БД недоступна (оркестратор видит нездоровый инстанс) |
| 7 | `backendRequest.parse` кидал сырой `SyntaxError` на не-JSON теле (502/504 от прокси) | `mvp.fe/shared/api/backendRequest.ts` | Защищённый парс → осмысленная `BackendError` со статусом |
| 8 | Настройка `ocr_invoice_prompt` (правится в SQLAdmin) была **мертва** — OCR всегда брал хардкод | `mvp.be/providers/ocr/{prompt,claude,gemini}.py` | Промпт резолвится из БД на каждый recognize (дефолт совпадает — поведение не меняется) |
| + | Не было React ErrorBoundary → любой throw в рендере = белый экран | `mvp.fe/shared/ui/ErrorBoundary.tsx` | Добавлен top-level boundary (честное сообщение + reload) |

## Требование 4 — LAN mobile (было сломано → чинено)

- `vite.config.ts`: `server.host: true` (dev-сервер слушает 0.0.0.0:5173).
- `src/shared/config/env.ts`: backend URL выводится из host страницы в рантайме
  (телефон на `http://PC-IP:5173` → API `http://PC-IP:8000`).
- `mvp.be/core/config.py`: CORS в local авто-разрешает приватные LAN-origin (regex, только `app_env=local`);
  `is_cors_allowed()` — единый источник для middleware и 500-хендлера.
- Куки работают на plain-HTTP LAN (same-site, `COOKIE_SECURE=false`). Единственный ручной шаг —
  открыть порты 5173/8000 в Windows Firewall (Private).

## Отложено осознанно (не блокеры для Phase 1, одиночный локальный инстанс)

- `AiVpnToggle` — process-local кэш без TTL: при мульти-воркере/внешнем изменении значение
  устаревает до рестарта/эндпоинта инвалидации. Для single-container dev не критично.
- `ai_complete` дефолтит неизвестный `ai_provider` в claude (OCR-registry — бросает). Мягкий дефолт,
  можно ужесточить до ошибки ради консистентности.
- `BackendOcrProvider` проставляет `confidence: 1` каждой строке → выключает low-confidence review.
  Требует, чтобы бэкенд отдавал per-line confidence (это доработка фичи OCR, не «починка рабочего»).
- `POST /invoices` отдаёт 201 и для business-fail (`rejected`/`failed`) — контракт по полю `status`
  работает (провайдер бросает по статусу), это REST-нюанс, не баг устойчивости.
- `match_service` при неразборном ответе AI → пустые кандидаты (подсказки — advisory).
- `_load_catalog_from_erp` — широкий except на старте (best-effort посев каталога).
- Нет CI (`.github/workflows`) — тесты гоняются вручную. Кандидат на следующий шаг.
- Полный e2e OCR-флоу требует детерминированного mock-OCR провайдера на бэке (или фикстуры).

## Проверка

- Backend: `pytest` 152 passed; `ruff` — 1 предсуществующий E501 в нетронутом файле.
- Frontend: `vitest` (юнит) + `tsc -b` + `vite build` + `playwright` (e2e, 2 вьюпорта).
