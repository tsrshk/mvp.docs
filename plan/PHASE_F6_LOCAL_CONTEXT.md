---
doc: plan/PHASE_F6_LOCAL_CONTEXT
title: Фаза F6 — Локальный контекст (погода + события района в дайджесте)
version: 1.0.0
status: current
updated: 2026-07-03
verified_against_code: n/a
owner: Ivan
supersedes: []
superseded_by: none
trust_tier: 2
ssot_for: [phase-f6-requirements]
---

# Фаза F6 — Локальный контекст

> Боль: аномалии продаж без объяснения «почему» (ливень? фестиваль?). Продукт: погода
> подтягивается автоматически (OpenWeather), события района ведутся вручную (MVP, план §6 Q4);
> дайджест F5 объясняет аномалии контекстом и предупреждает о будущих событиях.
> Сквозные требования — `00_IMPLEMENTATION_PLAN.md` §4.

**Цель:** ≥90% аномалий продаж в дайджесте имеют объяснение или явное «причина не найдена»;
≥2 предупреждения о будущих событиях/погоде в месяц.

**Зависимости:** F5 (дайджест, daily_aggregates). **Оценка:** 2 недели.

---

## 1. Backend

### F6-B1. Погодный провайдер (новый seam, одна реализация — G1)
- `providers/weather/base.py`: Protocol `WeatherProvider`
  (`get_daily(lat, lon, date_from, date_to) -> list[WeatherDay]`,
  `get_forecast(lat, lon, days) -> list[WeatherDay]`); DTO `WeatherDay` в домене:
  `date`, `temp_min/max`, `precipitation_mm`, `condition` (enum-строка), `wind?`.
- Реализация `openweather` + registry по образцу OCR/ERP. Egress — через `ProviderContext`
  direct-клиент (не AI — VPN не требуется; `requires_vpn=False`).
- Ключ — `integration_credentials(scope=platform, provider=openweather)` (новое значение
  `CredentialProvider.openweather` + миграция enum). Без ключа → fetch падает с явной
  ошибкой в sync_run (fail-closed), приложение живо.
- `OPENWEATHER_API_BASE` — в `.env` (статический URL, аналог `ESUPL_API_BASE`).

### F6-B2. Координаты точки
- `subdivisions`: добавить `lat`/`lon` (Numeric(9,6), nullable) — редактируются в SQLAdmin
  и в Settings (org-admin). Нет координат → погодный синк для подразделения пропускается
  с пометкой в sync_run (явной, не тихой).

### F6-B3. Хранилище контекста
- `weather_days` (`SubdivisionScopedMixin`): `date`, `temp_min/max`, `precipitation_mm`,
  `condition`, `is_forecast` (bool); unique `(subdivision_id, date)`; прогнозные строки
  перезаписываются фактом.
- `local_events` (`SubdivisionScopedMixin`, ручной ввод): `title`, `starts_on`, `ends_on?`,
  `expected_impact` (enum: `traffic_up|traffic_down|unknown`), `note?`, `source?`.
- Синк погоды — джоба в планировщике F5 (раз в сутки: факт вчера + прогноз 7–14 дней),
  расписание/флаг в REGISTRY (`weather_sync_enabled`, default False до настройки ключа).

### F6-B4. Обогащение дайджеста (DigestService)
- Детерминированная корреляция (без LLM): для каждого аномального дня из F5 (>±20%
  к среднему того же дня недели за 4 недели) приложить контекст дня: осадки > X мм /
  |t − средняя| > Y ° / событие. Пороги — REGISTRY (`anomaly_rain_mm` default 5,
  `anomaly_temp_delta` default 8).
- В `metrics` дайджеста добавляются `anomalies[{date, delta_pct, context[]}]`
  и `upcoming[{date, kind, title}]` (события + экстремальный прогноз на следующую неделю);
  LLM-текст (F5-B4) получает эти данные и обязан упоминать контекст ТОЛЬКО из них
  (анти-галлюцинация — как в F4).
- `GET /api/v1/context/days?from=&to=` — погода+события для UI;
  CRUD `local_events` (`POST/PATCH/DELETE /api/v1/context/events...`).

## 2. Frontend

### F6-F1. События района
- Раздел «События» (внутри страницы Дайджест или Settings): список будущих/прошлых,
  форма добавления (название, даты, ожидаемое влияние, заметка). Мобильная форма.
- mock-провайдер — демо-события.

### F6-F2. Дайджест
- Блок аномалий: «Чт −30% · ливень 12 мм»; блок «На следующей неделе»: события + прогноз.
- Погода дня в детализации (иконка/температура) — по данным `context/days`.

## 3. Вне объёма
- Автопарсер афиш (relax.by и т.п.) — после проверки ценности ручного ввода (Q4);
  корректировка прогноза закупок — F9/F10; исторический бэкфилл погоды глубже 90 дней.

---

## 4. Acceptance Criteria

- [ ] AC-1. Ключ OpenWeather ставится через SQLAdmin, хранится `enc:v2:*`; без ключа
      погодный синк падает с явной ошибкой в sync_run, без чтения env (тест).
- [ ] AC-2. Погодный синк (respx-фикстуры OpenWeather) заполняет `weather_days`; прогноз
      перезаписывается фактом; идемпотентен (unique subdivision+date) (тест).
- [ ] AC-3. Подразделение без координат — синк пропущен с пометкой, не исключение (тест).
- [ ] AC-4. Корреляция: фикстура «аномальный день + дождь 12мм» даёт anomaly с контекстом
      дождя; «аномалия без причин» даёт context=[] и текст «причина не найдена» (unit-тесты
      детерминированной логики, без LLM).
- [ ] AC-5. Событие, добавленное через UI, появляется в блоке «на следующей неделе»
      ближайшего дайджеста (интеграционный тест генерации + браузерная проверка).
- [ ] AC-6. LLM-текст дайджеста не содержит контекстных причин, отсутствующих в metrics
      (промпт-тест на фикстуре).
- [ ] AC-7. Пороги аномалий/расписание меняются из SQLAdmin без редеплоя (тест резолвера).
- [ ] AC-8. Тенант-изоляция weather_days/local_events; роуты за `module_analytics_enabled`
      (или отдельным `module_context_enabled` — решение исполнителя, оформить в журнале).
- [ ] AC-9. Общий DoD G10 (в 01_ARCHITECTURE — новый weather-seam).

---

## Журнал изменений
- 2026-07-03 v1.0.0 — создан из стадии F6 (Functional_Stages); события — ручной ввод (Q4), парсер отложен.
