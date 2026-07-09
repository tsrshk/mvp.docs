---
doc: plan/PHASE_F5_SALES_ANALYTICS
title: Фаза F5 — Аналитика продаж (read-only sync из Esupl + еженедельный дайджест)
version: 1.0.1
status: current
updated: 2026-07-03
verified_against_code: n/a
owner: Ivan
supersedes: []
superseded_by: none
trust_tier: 2
ssot_for: [phase-f5-requirements]
---

# Фаза F5 — Аналитика продаж

> Боль: нет регулярного обзора «что продавалось хорошо/плохо», ~3 ч/нед в Esupl.
> Продукт: автоматический read-only sync продаж из Esupl, еженедельный дайджест
> (выручка, топ-позиции, аномалии) в web-UI. Канал доставки: страница «Дайджест» +
> PWA-баннер; Telegram из старой спеки НЕ строим (план §6 Q1).
> Сквозные требования — `00_IMPLEMENTATION_PLAN.md` §4. Esupl — строго read-only (G6).

**Цель:** владелец получает картину недели без открытия Esupl; аномалии видны в течение недели.

**Зависимости:** S1; независима от F3/F4. **Оценка:** 3 недели (включая разведку Esupl API).

---

## 0. Неделя 1 — разведка Esupl API (гейт фазы)

- По `mvp.docs/api/esupl/*` (shifts, money-transactions, menu, warehouse, handbooks)
  и живому API (team 17957, реальный токен, READ-ONLY) определить: какие endpoints дают
  данные о продажах (чеки/транзакции/смены), их гранулярность (по позициям? по сменам?),
  пагинацию, лимиты, глубину истории.
- Результат — раздел «Контракт данных» в `work/phase-f5.md` + при необходимости обновление
  `api/esupl/*.md`. **Если позиционных продаж нет** — объём фазы пересогласовывается
  (агрегаты по сменам/категориям), это блокер-чекпойнт для владельца.

## 1. Backend

### F5-B1. Расширение ERP-провайдера (чтение)
- `ErpProvider` Protocol + `EsuplErpProvider`: новые методы чтения по результатам разведки,
  напр. `list_sales(team_id, warehouse_id?, date_from, date_to, api_token) -> list[SaleRecord]`
  (домен-DTO в `entities.py`). Только authenticated-вызовы (токен обязателен, нет токена →
  fail-closed ошибка синка, не тихий пропуск) — не воспроизводить проблему DEC-06.
- Никаких новых write-методов.

### F5-B2. Хранилище продаж
- `sales_records` (`SubdivisionScopedMixin`, int pk): `external_id` (уникален в org —
  идемпотентность), `sold_at` (DateTime tz), `sku_external_id?`, `ingredient_id?` (FK,
  nullable — маппинг на локальный каталог, где возможен), `name` (как в Esupl), `category?`,
  `qty Numeric(14,3)`, `revenue Numeric(14,2)`, `cost? Numeric(14,2)`, `currency`.
  Unique `(organization_id, external_id)`.
- `daily_aggregates` (`SubdivisionScopedMixin`): `date`, `revenue`, `receipts_count?`,
  `top_positions JSONB?` — материализуется синком (пересчитывается за затронутые дни);
  unique `(subdivision_id, date)`.

### F5-B3. Sync-джоба и планировщик (план §6 Q3 → ADR)
- Планировщик: **APScheduler (AsyncIOScheduler) в lifespan** (один процесс, Phase 1) —
  оформить ADR. Все расписания — в `system_settings` REGISTRY:
  `sales_sync_enabled` (bool, default False — включается после настройки токена),
  `sales_sync_interval_hours` (default 6), `digest_weekday`/`digest_hour` (default Mon/9).
- `SalesSyncService.sync(organization, subdivision)`: инкрементально с последней успешной
  точки (окно перекрытия 1 день), upsert по `external_id`, пересчёт `daily_aggregates`.
- Журнал синков `sync_runs` (org-scoped): `kind`, `started_at`, `finished_at`, `status`,
  `error?`, `records_upserted` — видимость «жив ли синк» в SQLAdmin.
- Fail-closed: нет POS-токена / Esupl недоступен → sync_run со статусом failed + текст
  ошибки; никаких повторов чаще расписания; следующая попытка по расписанию.

### F5-B4. Дайджест
- Таблица `digests` (`SubdivisionScopedMixin`): `period_start`, `period_end`,
  `metrics JSONB` (выручка нед/прошлая/аналогичная 4 нед назад; топ-5 по выручке;
  выросло/упало >20% неделя-к-неделе; средний чек если доступен), `body_md` (Text),
  `created_at`, `read_at?`. Unique `(subdivision_id, period_start)`.
- Генерация по расписанию: `DigestService.build()` — вся математика детерминированная
  (SQL/Python, Decimal), unit-тестируемая; LLM (`ai_complete`, дешёвая модель) — ТОЛЬКО
  превращает готовый `metrics` в связный русский текст `body_md`. AI недоступен →
  дайджест сохраняется с шаблонным текстом из метрик (метрики важнее прозы — это
  честный расчётный фолбэк, не тихая деградация: помечается `"ai_text": false`).
- Роуты: `GET /api/v1/digests` (список), `GET /api/v1/digests/{id}`,
  `POST /api/v1/digests/{id}/read`, `POST /api/v1/digests/generate` (ручной перегенерация
  за период — для отладки и «сейчас», требует контекста подразделения).
- Модульный гейт: `module_analytics_enabled`.

## 2. Frontend

### F5-F1. Страница «Дайджест» (пункт навигации)
- Список дайджестов (недели) + просмотр: карточки метрик (выручка + сравнение, топ-5,
  аномалии) рендерятся из `metrics` (не парсить markdown ради цифр), текст `body_md` ниже.
- Непрочитанный дайджест — бейдж в навигации (переиспользовать механизм алертов F4, если
  она уже сделана; иначе — свой простой счётчик).
- Статус данных: «данные Esupl на <дата последнего успешного синка>»; синк падает —
  явная плашка, не свежая дата.

### F5-F2. Настройки
- В существующей странице Settings (для admin/superadmin): состояние синка (последний
  запуск/статус из `sync_runs`), кнопка «Синхронизировать сейчас»
  (`POST /api/v1/sales/sync` — требует прав admin подразделения).

## 3. Вне объёма
- Вопросы в свободной форме («как дела с матчей?») — F10; погодные объяснения — F6;
  маржа по группам — только если Esupl отдаёт себестоимость (решается разведкой);
  push-каналы за пределами PWA.

---

## 4. Acceptance Criteria

- [ ] AC-0 (гейт). Отчёт разведки Esupl API написан; выбранные endpoints и гранулярность
      подтверждены владельцем ДО реализации B2–B4.
- [ ] AC-1. Sync идемпотентен: повторный прогон того же окна не создаёт дублей
      (unique external_id, тест с respx-фикстурами реальных ответов Esupl).
- [ ] AC-2. Ни одного не-GET запроса к Esupl во всей фазе (тест/ревью: respx ловит
      только GET; grep новых методов провайдера).
- [ ] AC-3. Нет POS-токена или Esupl 5xx → sync_run failed с сообщением; приложение живо;
      следующий запуск по расписанию (тест).
- [ ] AC-4. `daily_aggregates` за день пересчитывается корректно (unit-тест: 3 продажи →
      выручка/топ совпадают с ручным расчётом на Decimal).
- [ ] AC-5. Дайджест генерируется по расписанию (интеграционный тест с подменой clock или
      ручной триггер) и содержит: выручку недели, сравнение с прошлой, топ-5, аномалии;
      при недоступном AI — сохранён с шаблонным текстом и флагом `ai_text=false`.
- [ ] AC-6. Расписание и включение синка меняются из SQLAdmin без редеплоя (тест резолвера
      + ручная проверка перечитывания планировщиком).
- [ ] AC-7. UI: дайджест читается на телефоне; плашка устаревших данных появляется при
      сломанном синке (браузерная верификация).
- [ ] AC-8. Тенант-изоляция sales_records/digests покрыта тестом; роуты за
      `module_analytics_enabled`.
- [ ] AC-9. Сверка с реальностью: выручка за контрольную неделю совпадает с Esupl
      (spot-check владельцем, зафиксировать в `work/phase-f5.md`).
- [ ] AC-10. Общий DoD G10 + ADR на планировщик (Q3).

---

## Журнал изменений
- 2026-07-03 v1.0.1 — терминология: «жена» → «владелец».
- 2026-07-03 v1.0.0 — создан из стадии F5 (Functional_Stages); канал доставки — web (Q1), Esupl read-only.
