---
id: LCOS-F58
type: feature
title: Хранение отзывов + загрузка
epic: "[[LCOS-E12-competitor-reviews]]"
status: future
phase: "Phase 2"
roles: [admin, member, superadmin]
entities: ["[[subdivisions]]", "[[integration_credentials]]"]
requirements: ["[[multitenancy]]", "[[provider-abstraction]]", "[[fail-closed]]", "[[secret-encryption]]", "[[vpn-egress]]"]
adrs: ["[[ADR-009]]", "[[ADR-012]]", "[[ADR-006]]"]
legacy_refs: [plan F8, "plan F8-B1", "plan F8-B2"]
sources: ["plan/PHASE_F8_COMPETITORS_REVIEWS.md §1 F8-B1", "plan/PHASE_F8_COMPETITORS_REVIEWS.md §1 F8-B2", "plan/00_IMPLEMENTATION_PLAN.md §6 Q5"]
updated: 2026-07-09
---
# LCOS-F58 · Хранение отзывов + загрузка
**Epic:** [[LCOS-E12-competitor-reviews]] · **Status:** future · **Phase:** Phase 2

## Описание

Основа модели данных и загрузки для эпика отзывов. Вводит две таблицы со скоупом org: `reviews` (`OrganizationScopedMixin`, uuid pk), хранящая `subject` (`self` | `competitor`), опциональный FK `competitor_id` (NULL для собственных отзывов), `source` (`google` | `manual` | `import`), `external_id`, уникальный внутри org для дедупликации, плюс `author?`, `rating?`, `text`, `posted_at`, `lang?`; и `review_analyses` (1:1 FK→`reviews` CASCADE), которая записывается в [[LCOS-F59-review-analysis]] и намеренно держится отдельно, чтобы повторный анализ более новой моделью никогда не мутировал исходный отзыв.

Загрузка имеет два пути, оба приземляются в ту же таблицу `reviews`. Основной путь MVP — ручной/массовый импорт: `POST /api/v1/reviews/import` принимает JSON-массив (собственные отзывы или отзывы, скопированные/экспортированные для конкурента) и дедуплицирует по `external_id` / хэшу текста, так что повторный импорт той же партии не создаёт дубликатов. Опциональный путь — аутентифицированная выборка собственных отзывов магазина через Google Business Profile за Protocol провайдера `reviews`; если OAuth-учётные данные не настроены, фича откатывается на ручной импорт, а API-провайдер может быть отложен решением владельца в начале фазы (фиксируется в журнале).

**Правовая граница (plan §6 Q5):** MVP работает только с официально доступными данными — собственные отзывы через Google Business Profile (API/экспорт), отзывы конкурентов через ручной импорт. Автоматический скрейпинг Google Maps явно вне объёма.

## Возможности

- Таблицы `reviews` и `review_analyses`, со скоупом org; анализ хранится отдельно от исходного отзыва (повторный анализ никогда не трогает оригинал).
- Эндпоинт массового импорта `POST /api/v1/reviews/import` (JSON-массив) с дедупликацией по `external_id` / хэшу текста — идемпотентный повторный импорт.
- Различение subject `self` vs `competitor`; отзывы конкурентов ссылаются на справочник конкурентов ([[LCOS-F54-competitor-directory]]).
- Опциональная выборка собственных отзывов через Google Business Profile за швом провайдера с одной реализацией; выключена по умолчанию (`reviews_sync_enabled` REGISTRY, default False).
- Без скрейпинга Google Maps; данные конкурентов попадают только ручным/массовым импортом.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[admin]] | Импортирует собственные и конкурентские отзывы для своего подразделения; настраивает соединение Google Business (если включено). |
| [[member]] | Импортирует отзывы в рамках своего подразделения; потребляет сохранённые отзывы далее по цепочке. |
| [[superadmin]] | То же по всем тенантам; управляет учётными данными Google Business и флагом включения синхронизации. |
| [[sqladmin-operator]] | Задаёт флаг `reviews_sync_enabled` и учётные данные провайдера в плоскости SQLAdmin (см. [[LCOS-F3-sqladmin-operator]]). |

## Задействованные сущности

- Будущие таблицы хранения `reviews` и `review_analyses` — вводятся здесь; `review_analyses` наполняется [[LCOS-F59-review-analysis]] и читается [[LCOS-F60-reviews-api]].
- [[subdivisions]] — тенант-скоуп каждой строки отзыва (mixin со скоупом org); изоляция — жёсткое требование.
- [[integration_credentials]] — зашифрованные Fernet OAuth-учётные данные Google Business Profile (`scope=org`, новое значение провайдера `google_business`), читаются только на бэкенде, когда включён опциональный путь выборки.
- Строки конкурентов, на которые ссылается `competitor_id`, живут в справочнике конкурентов [[LCOS-E11-competitor-menu]] ([[LCOS-F54-competitor-directory]]).

## Зависимости / связи

- **Requirements:** [[multitenancy]] (строки со скоупом org, изоляция протестирована), [[provider-abstraction]] (выборка Google за швом провайдера `reviews` с одной реализацией), [[fail-closed]] (выборка включена без учётных данных → явная ошибка синхронизации, никогда не тихий пропуск), [[secret-encryption]] (`enc:v2` OAuth-учётные данные), [[vpn-egress]] (любой egress живого провайдера маршрутизируется и закрывается на бэкенде).
- **Features:** питает [[LCOS-F59-review-analysis]] (анализ необработанных отзывов) и [[LCOS-F60-reviews-api]] (список/тренды/дайджест/алерт); плановая выборка, если включена, выполняется под планировщиком дайджеста, общим с [[LCOS-F48-weekly-digest]].
- **Epics:** часть [[LCOS-E12-competitor-reviews]]; дополняет количественный сигнал меню/цен [[LCOS-E11-competitor-menu]].
- **ADR:** [[ADR-009]] (шов провайдера, одна реализация), [[ADR-012]] (пути живого провайдера только на бэкенде), [[ADR-006]] (fail-closed egress).

## Критерии приёмки

- Критерии приёмки: TBD (Phase 2 — детализируются при активации). Идемпотентность импорта, тенант-изоляция и (если построено) fail-closed критерии выборки Google прорабатываются при активации эпика и повторном подтверждении правовой границы Q5 с владельцем.

## Sources

- `plan/PHASE_F8_COMPETITORS_REVIEWS.md §1 F8-B1` (модель данных: `reviews`, `review_analyses`).
- `plan/PHASE_F8_COMPETITORS_REVIEWS.md §1 F8-B2` (загрузка: `/reviews/import`, дедуп, провайдер Google Business, `reviews_sync_enabled`).
- `plan/00_IMPLEMENTATION_PLAN.md §6 Q5` (правовая граница — только официальные данные, без скрейпинга Google Maps).
