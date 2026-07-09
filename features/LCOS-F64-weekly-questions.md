---
id: LCOS-F64
type: feature
title: Еженедельная сессия «3 вопроса»
epic: "[[LCOS-E14-strategic-insights]]"
status: future
phase: "Phase 2"
roles: [admin, superadmin]
entities: ["[[subdivisions]]", "[[system_settings]]", "[[integration_credentials]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[vpn-egress]]", "[[multitenancy]]", "[[config-secrets]]"]
adrs: ["[[ADR-003]]"]
legacy_refs: [plan F10, "plan F10-B2", "plan F10-B4", "plan F10-F1"]
sources: ["plan/PHASE_F10_STRATEGIC_INSIGHTS.md §1 F10-B2", "plan/PHASE_F10_STRATEGIC_INSIGHTS.md §1 F10-B4", "plan/PHASE_F10_STRATEGIC_INSIGHTS.md §2 F10-F1"]
updated: 2026-07-09
---
# LCOS-F64 · Еженедельная сессия «3 вопроса»
**Epic:** [[LCOS-E14-strategic-insights]] · **Status:** future · **Phase:** Phase 2

## Описание

Флагманская фича AI-управляющего: раз в неделю продукт открывает стратегический разговор, задавая владельцу ровно **три вопроса** — а не отчёт. Задание планировщика (расписание в config-реестре, по умолчанию выровнено с дайджестом продаж) берёт снимок из [[LCOS-F63-insight-context]], вызывает `ai_complete` на **основной** модели и требует строгий JSON: `questions[{question, why_now, data_refs[], suggested_angles[]}]`, ровно три элемента.

Правило промпта твёрдое: вопросы и их обоснование могут ссылаться **только** на переданные данные и формулируются как темы для обсуждения, никогда как директивы («Стоит ли поднять цену?» — не «Поднимите цену»). `data_refs` каждого вопроса должны указывать на реальные элементы снимка, чтобы ответы оставались обоснованными. Сессия хранится в будущей таблице `insight_sessions` (скоуп подразделения, uuid pk) с `week_start`, `context_snapshot` (ровно то, что видел LLM, для аудита), `questions`, `created_at`, `read_at?` и уникальным `(subdivision_id, week_start)`.

Фронтенд рендерит mobile-first страницу «Разговор недели»: еженедельная карточка с тремя вопросами, каждый несёт своё «почему сейчас» и подкрепляющие данные, плюс бейдж непрочитанного и список истории прошлых недель. Если AI/VPN недоступен на момент прогона задания, сессия **не** создаётся, а ошибка отображается в прогоне синхронизации; ручная генерация через `POST /api/v1/insights/generate` доступна всегда и падает громко, а не тихо.

## Возможности

- Плановое еженедельное задание (расписание в реестре, по умолчанию co-scheduled с дайджестом) → контекст → `ai_complete` на основной модели.
- Строгий JSON-контракт: ровно 3 `questions`, каждый с `why_now`, `data_refs[]`, `suggested_angles[]`.
- Правило обоснованности: ссылаться только на переданные данные; формулировка вопроса для обсуждения, никогда не директива.
- Персистентность в `insight_sessions` с `context_snapshot` для аудита «что видела модель»; уникально `(subdivision_id, week_start)`.
- Ручная, всегда доступная генерация `POST /api/v1/insights/generate` (fail-closed при недоступности AI/VPN).
- API сессий: `GET /insights` (список), `GET /insights/{id}` (вопросы + сообщения), `POST /insights/{id}/read`.
- Mobile-first страница «Разговор недели» с бейджем непрочитанного и историей прошлых недель; mock-провайдер отдаёт демо-сессию.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[admin]] | Читает еженедельную сессию своего подразделения, помечает прочитанной, запускает ручную генерацию. |
| [[superadmin]] | То же по всем тенантам; настраивает расписание, модель, промпт и гейт `module_insights_enabled`. |
| [[member]] | Не является целевым пользователем стратегического разговора в Phase 2. |
| [[sqladmin-operator]] | Задаёт расписание / модель / лимиты / модульный гейт в плоскости SQLAdmin (см. [[LCOS-F3-sqladmin-operator]]). |

## Задействованные сущности

- [[subdivisions]] — каждая сессия имеет скоуп одного подразделения (граница тенанта `SubdivisionScopedMixin`).
- [[system_settings]] — рантайм-выбор AI-провайдера/модели и промпт инсайтов, редактируемые без редеплоя.
- [[integration_credentials]] — зашифрованный Fernet AI-ключ, читаемый бэкендом; egress через VPN, никогда не экспонируется фронтенду.
- Будущие таблицы `insight_sessions` (эта фича) и `insight_messages` (принадлежит [[LCOS-F65-freeform-dialog]]) вводятся в Phase 2; они не входят в замороженный набор сущностей.

## Зависимости / связи

- **Requirements:** [[provider-abstraction]] (основная модель за LLM-швом), [[fail-closed]] + [[vpn-egress]] (AI/VPN лежит → явный сбой/503, сессия не создаётся, без тихого прямого egress), [[multitenancy]] (тенант-изоляция сессий), [[config-secrets]] (расписание, модель, промпт, лимиты, гейт через трёхуровневый конфиг).
- **Features:** потребляет [[LCOS-F63-insight-context]]; та же сессия — якорь для [[LCOS-F65-freeform-dialog]]; гейтится [[LCOS-F6-module-gates]] (`module_insights_enabled`).
- **Epics / gates:** часть [[LCOS-E14-strategic-insights]]; успех питает проверку Pilot-Gate ([[ADR-003]]) — ≥1 стратегическое решение/месяц из разговора.

## Критерии приёмки

- Критерии приёмки: TBD (Phase 2 — детализируются при активации). Направление черновика: задание производит ровно 3 вопроса с `data_refs` в реальный `context_snapshot`; невалидный LLM JSON → нет сессии + залогированная ошибка; `context_snapshot` сохранён для аудита; тенант-изоляция и модульный гейт держатся; AI/VPN лежит → явный 503 на generate.

## Sources

- `plan/PHASE_F10_STRATEGIC_INSIGHTS.md §1 F10-B2` (задание планировщика, основная модель, строгий JSON из 3 вопросов, правило обоснованности промпта, схема `insight_sessions`, fail-closed генерация).
- `plan/PHASE_F10_STRATEGIC_INSIGHTS.md §1 F10-B4` (эндпоинты API инсайтов).
- `plan/PHASE_F10_STRATEGIC_INSIGHTS.md §2 F10-F1` (mobile-first страница «Разговор недели», бейдж непрочитанного, история, mock демо-сессия).
