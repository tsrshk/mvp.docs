---
id: LCOS-F48
type: feature
title: Еженедельный дайджест
epic: "[[LCOS-E9-sales-analytics]]"
status: future
phase: "Phase 2"
roles: [member, admin, superadmin]
entities: ["[[subdivisions]]", "[[system_settings]]"]
requirements: ["[[multitenancy]]", "[[provider-abstraction]]", "[[fail-closed]]"]
adrs: []
legacy_refs: [plan F5-B4, plan F5-F1, 07 Э6]
sources: ["plan/PHASE_F5_SALES_ANALYTICS.md §1 F5-B4", "plan/PHASE_F5_SALES_ANALYTICS.md §2 F5-F1", "06_STRATEGY.md"]
updated: 2026-07-09
---
# LCOS-F48 · Еженедельный дайджест
**Epic:** [[LCOS-E9-sales-analytics]] · **Status:** future · **Phase:** Phase 2

## Описание

Продукт эпика, обращённый к владельцу: еженедельный дайджест, строящийся по расписанию из сохранённых продаж, чтобы владелец получал картину недели, не открывая Esupl. Это намеренно не дашборд — он приходит сам и заканчивается прочтением, в рамке AI-управляющего (см. [[LCOS-E9-sales-analytics]], продуктовую стратегию). Таблица `digests` (`SubdivisionScopedMixin`) хранит `period_start`, `period_end`, `metrics JSONB` (выручка этой недели vs прошлой и vs той же недели 4 недели назад; топ-5 по выручке; позиции с ростом/падением >20% неделя-к-неделе; средний чек при наличии), `body_md`, `created_at`, `read_at?`, уникально `(subdivision_id, period_start)`.

Вся арифметика детерминирована (SQL/Python, Decimal) и покрываема юнит-тестами; LLM (`ai_complete`, дешёвая модель) лишь превращает готовые `metrics` в читаемый текст в `body_md`. Если AI недоступен, дайджест всё равно сохраняется с шаблонным текстом из метрик и флагом `"ai_text": false` — честный вычисленный fallback, а не тихая деградация (метрики важнее прозы). Вся фича сидит за гейтом `module_analytics_enabled`. Канал доставки — только веб: страница дайджеста плюс PWA-бейдж; Telegram-канал из старой спеки вне объёма (plan §6 Q1).

## Возможности

- Таблица `digests` + плановый `DigestService.build()`, производящий детерминированные `metrics` и LLM-рендер `body_md`.
- Fallback при недоступном AI: дайджест сохраняется с шаблонным текстом метрик и флагом `ai_text=false`.
- Маршруты: `GET /api/v1/digests`, `GET /api/v1/digests/{id}`, `POST /api/v1/digests/{id}/read`, `POST /api/v1/digests/generate` (ручная перегенерация за период; нужен контекст подразделения).
- Пункт навигации «Digest» на фронтенде: список еженедельных дайджестов + карточки метрик, рендеримые из `metrics` (не парсятся из markdown), с `body_md` ниже; бейдж непрочитанного; баннер свежести данных («Данные Esupl на <последняя успешная синхронизация>», явное предупреждение при сломанной синхронизации).
- Модульный гейт `module_analytics_enabled`.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Читает дайджест своего подразделения в веб/PWA; помечает как прочитанный. |
| [[admin]] | То же, плюс ручная перегенерация за период; видит свежесть синхронизации. |
| [[superadmin]] | Кросс-тенантное чтение; переключает `module_analytics_enabled` и AI-провайдера через config-API. |
| [[sqladmin-operator]] | Переключает модульный гейт / AI-провайдера в плоскости SQLAdmin (см. [[LCOS-F3-sqladmin-operator]]). |

## Задействованные сущности

- [[subdivisions]] — скоуп дайджеста (`SubdivisionScopedMixin`, уникально `(subdivision_id, period_start)`).
- [[system_settings]] — гейт `module_analytics_enabled`, флаги расписания дайджеста, `ai_provider` для рендера текста.
- Новая таблица `digests` определяется здесь (заготовка Phase 2, отдельного документа-сущности пока нет); метрики выводятся из `daily_aggregates` / `sales_records` ([[LCOS-F46-sales-storage]]).

## Зависимости / связи

- **Requirements:** [[multitenancy]] (дайджесты по подразделению, изоляция протестирована), [[provider-abstraction]] (LLM-текст за AI-швом, дешёвая модель), [[fail-closed]] (сломанная синхронизация показывает баннер устаревших данных, а не свежую дату; недоступность AI — явный флагованный fallback).
- **Features:** потребляет [[LCOS-F46-sales-storage]], генерируется по расписанию через [[LCOS-F47-scheduler]]; механизм бейджа непрочитанного переиспользует алерты о поставщиках/ценах из [[LCOS-F21-price-change-signal]] при наличии.
- **Epics:** [[LCOS-E9-sales-analytics]]; свободные вопросы «как у нас дела» вне объёма здесь → [[LCOS-E14-strategic-insights]]; объяснения через погоду → [[LCOS-E10-local-context]].

## Критерии приёмки

- Критерии приёмки: TBD (Phase 2 — детализируются при активации). Плановая генерация, содержимое метрик, флаг AI-fallback, читаемость на мобильных, баннер устаревших данных и тенант-изоляция прорабатываются при активации.

## Sources

- `plan/PHASE_F5_SALES_ANALYTICS.md §1 F5-B4` (таблица дайджеста, детерминированные метрики, AI-fallback, маршруты).
- `plan/PHASE_F5_SALES_ANALYTICS.md §2 F5-F1` (страница дайджеста, карточки метрик, баннер свежести).
- `06_STRATEGY.md` (рамка AI-управляющего: дайджест приходит и заканчивается действием, а не дашбордом).
