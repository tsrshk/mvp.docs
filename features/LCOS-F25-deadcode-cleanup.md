---
id: LCOS-F25
type: feature
title: Пакет очистки мёртвого кода / швов
epic: "[[LCOS-E5-stabilization]]"
status: planned
phase: "Phase 1"
roles: [superadmin]
entities: ["[[invoice_lines]]", "[[integration_credentials]]", "[[sku_mapping]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[erp-esupl-integration]]", "[[global-requirements]]"]
adrs: ["[[DEC-0011]]"]
legacy_refs: [plan S1-B2 S1-B3 S1-B4 S1-B5 S1-B6 S1-F1 S1-F2, 08 F1.3, backlog DEC-01 DEC-02 DEC-03 DEC-05 DEC-06 ALIGN-02 ALIGN-03, Conformance D-a D-b D-c D-e D-f A2 A3]
sources: ["plan/PHASE_S1_STABILIZATION.md §S1-B2..B6 §S1-F1 §S1-F2 §AC-4..AC-7", "08_PHASE1_SPEC.md F1.3", "LCOS_Conformance_Alignment_GlobalRequirements.md 2.1/2.2", "APP_OVERVIEW.md §11", "TZ__STABILIZATION_2026-07-09__ALIGNED.md S6"]
updated: 2026-07-09
---
# LCOS-F25 · Пакет очистки мёртвого кода / швов

**Epic:** [[LCOS-E5-stabilization]] · **Status:** planned · **Phase:** Phase 1

## Описание

Заявленные принципы — «одна реализация на шов» и «нет мёртвого кода / нет незапланированных компонентов». Несколько мест их нарушают: вторая (Gemini) OCR/AI-реализация, неиспользуемая векторная колонка, объявленный, но неиспользуемый scope учётных данных, неаутентифицированный путь кода Esupl, устаревшие docstring'и, противоречащие коду, и пакет мёртвых frontend-модулей. Эта фича — пакет очистки, который их удаляет, чтобы кодовая база соответствовала своим заявленным инвариантам (`R7`, `R9`).

Backend-удаления: убрать Gemini OCR-провайдер и ветку транспорта `if gemini else claude`, вычистить `gemini` из `CredentialProvider` / `ai_provider` / `gemini_model` (enum-миграция + очистка строк) и упростить двойной по назначению `resolve_ai_provider()` до одного вендора, сохранив рантайм-выбор модели (DEC-01 = A, закрывает VER-03). Убрать неиспользуемую колонку `invoice_lines.sku_embedding Vector(1536)` (сохранить расширение `vector`) и удалить `SKU_EMBEDDING_DIM` (DEC-02 = A). Удалить `CredentialScope.subdivision` из enum + partial-unique индекса (DEC-03). Закрыть неаутентифицированный Esupl-egress: `list_suppliers`/`list_ingredients` должны быть недостижимы без токена — бросать исключение, никогда молчаливый `[]`, когда задан `ESUPL_API_BASE` (DEC-06). Исправить устаревший docstring `ErpProvider.write_invoice` («None → fallback to global env token»), чтобы описывать fail-closed (ALIGN-03).

Frontend-удаления (ALIGN-02): удалить `shared/llm` (перенеся живые хелперы `stripCodeFence`/`clamp01`/`parseJsonSafe` в `shared/lib`), `shared/ocr/prompt.ts` + `parse.ts`, `shared/match/prompt.ts` + `parse.ts` и browser-direct путь Esupl (`VITE_POS_PROVIDER=esupl`, `VITE_ESUPL_API_URL`, `VITE_ESUPL_READ_ONLY` из `.env.example` и `shared/pos/config.ts`), плюс устаревшие комментарии «mock/Gemini/Claude» — при этом **не** трогая живые хелперы накладных `shared/ocr/rules.ts`. Прекратить сборку/отправку candidate-set на бэкендный путь `suggest-matches`; сохранить `buildMatchCandidates` только для mock-провайдера (DEC-05 = B). Наконец, разрешить осиротевшую `IngredientSKUFactory.save()` (TZ S6): либо подключить её в явный поток «создать маппинг из picker» (`method='manual'`), либо удалить — без авто-создания `cache_exact`/`confirmed_by='system'`.

## Возможности

- Единый OCR/AI-вендор: зарегистрирован только `claude`; `gemini` удалён из провайдеров, транспорта, enum и хранимых строк; `resolve_ai_provider()` упрощён (рантайм-выбор `anthropic_model` сохранён).
- Колонка `invoice_lines.sku_embedding` удалена (расширение `vector` сохранено); `SKU_EMBEDDING_DIM` удалён.
- `CredentialScope.subdivision` удалён из enum и из partial-unique индекса `uq_credentials_active_per_scope` (индекс пересоздан).
- Не остаётся неаутентифицированного пути egress к Esupl: `list_suppliers`/`list_ingredients` удалены или защищены так, что недостижимы без токена.
- `ErpProvider.write_invoice` и родственные docstring'и описывают fail-closed (без «env fallback»).
- Мёртвые frontend-модули удалены; живые хелперы перенесены в `shared/lib`; `rules.ts` не тронут; сборка остаётся зелёной.
- Бэкендный `suggest-matches` больше не получает FE candidate-set (бэкенд остаётся авторитетным источником каталога); mock сохраняет свой построитель кандидатов.
- Осиротевшая FE-фабрика `save()` либо подключена в явный поток ручного маппинга, либо удалена (ноль мёртвого кода), никогда не создавая авто-маппинги, пригодные к коммиту.

## Доступ по ролям

| Роль | Что можно делать |
|---|---|
| [[superadmin]] | Бенефициар config-плоскости: варианты `ai_provider` больше не включают несуществующий `gemini`; резолвер AI-провайдера однозначен. |
| [[sqladmin-operator]] | Бенефициар operator-плоскости: устаревшие строки учётных данных `gemini` и неиспользуемый subdivision-scope удалены, так что админ-поверхность отражает реальность. |
| [[member]] / [[admin]] | Нет видимых пользователю изменений; поток счетов-фактур ведёт себя идентично после очистки. |

Это maintenance-фича без новой возможности для конечного пользователя.

## Задействованные сущности

- [[invoice_lines]] — теряет неиспользуемую колонку `sku_embedding` (изменение только схемы; из неё не читается и в неё не пишется).
- [[integration_credentials]] — теряет строки `gemini` и scope учётных данных `subdivision`; partial-unique индекс пересоздан.
- [[sku_mapping]] — косвенно затронут через решение по осиротевшей FE-фабрике (не должен получить авто-созданные строки, пригодные к коммиту).

## Зависимости / связи

- **Требования:** [[provider-abstraction]] (`R7.3`: одна реализация на шов; `R7.5`: нет новых реализаций без триггера), [[fail-closed]] (`R8.2`: нет неаутентифицированного egress; docstring'и соответствуют fail-closed поведению), [[erp-esupl-integration]] (пути чтения должны нести токен), [[global-requirements]] (`R9.3`: нет мёртвых модулей/экспортов).
- **Фичи:** удаление `sku_embedding` и решение по `save()` отслеживаются из [[LCOS-F22-sku-stabilization]]; инвариант единого вендора поддерживает [[LCOS-F5-provider-seams]] и [[LCOS-F8-ocr-recognition]]; изменение candidate-set затрагивает [[LCOS-F9-line-matching]].
- **Решения:** [[DEC-0011]] (`sku_embedding` — мёртвый placeholder для будущего семантического матчинга; backlog DEC-02 открыт).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `grep -ri gemini mvp.be/app` пуст (кроме миграций); enum'ы не несут `gemini`; OCR-реестр содержит только `claude`; `pytest` зелёный (DEC-01 = A, закрывает VER-03).
- [ ] AC-BE-2. `invoice_lines.sku_embedding` отсутствует в схеме (миграция up + рабочий downgrade); расширение `vector` сохранено; `SKU_EMBEDDING_DIM` удалён; `grep sku_embedding app/` пуст.
- [ ] AC-BE-3. `CredentialScope.subdivision` удалён из enum (миграция); `subdivision_id` удалён из `uq_credentials_active_per_scope` (индекс пересоздан) и из ставших мёртвыми сигнатур.
- [ ] AC-BE-4. Ни один путь кода не выполняет неаутентифицированный HTTP-запрос к Esupl: `list_suppliers`/`list_ingredients` удалены или бросают исключение без токена (тест), никогда молчаливый `[]`, когда задан `ESUPL_API_BASE`.
- [ ] AC-BE-5. `ErpProvider.write_invoice` и любые родственные docstring'и описывают fail-closed без формулировки «env fallback» (ALIGN-03).

### Frontend
- [ ] AC-FE-1. `grep -r "VITE_ESUPL\|shared/llm\|ocr/prompt\|match/prompt" mvp.fe/src` пуст; `npm run build` зелёный; живые хелперы `stripCodeFence`/`clamp01`/`parseJsonSafe` теперь живут в `shared/lib`.
- [ ] AC-FE-2. Хелперы накладных `shared/ocr/rules.ts` (`waybillSeries.isValid`/`isWaybillIdValid`/`totalRow`) сохранены, и валидация в workbench по-прежнему работает.
- [ ] AC-FE-3. Payload запроса `suggest-matches` к бэкенду не несёт `candidates` (devtools); `buildMatchCandidates` остаётся только для mock-провайдера (DEC-05 = B).
- [ ] AC-FE-4. `IngredientSKUFactory.save()` либо подключена в явный поток «создать маппинг из picker» (`method='manual'`, требует человеческого действия), либо удалена; авто-создание `cache_exact`/`confirmed_by='system'` не вводится (вариант C остаётся под вето).

### Прочее (docs)
- [ ] AC-OTHER-1. Записи ADR для DEC-01(A), DEC-02(A), DEC-03, DEC-05(B), DEC-06 написаны; строки backlog ALIGN-02/ALIGN-03 и DEC-* выше переведены в `done`.

## Открытые вопросы / гейты

- **`CredentialScope.subdivision` — удалить vs сохранить как шов для Phase 2:** по умолчанию удалить (по «none planned»); если предвидится per-subdivision POS-токен, сохранить его с явным комментарием «Phase 2 seam, unused» и записью PHASE_P2.
- **Backlog DEC-02 по `sku_embedding`** всё ещё `open`; эта фича — то место, где он закрывается.
- **CSRF (DEC-04) и авторитет POS-config (DEC-08)** решаются в другом месте (defer / keep) и не входят в этот пакет удаления.

## Источники

- `plan/PHASE_S1_STABILIZATION.md §1 S1-B2..S1-B6` (backend-удаления), `§2 S1-F1/S1-F2` (frontend), `§5 AC-4..AC-7`.
- `08_PHASE1_SPEC.md F1.3` (удаление sku_embedding + candidate-set B, references миграций).
- `LCOS_Conformance_Alignment_GlobalRequirements.md §2.1` (A2 мёртвый код, A3 docstring'и), `§2.2` (D-a Gemini, D-b sku_embedding, D-c subdivision scope, D-e candidate-set, D-f неаутентифицированный egress).
- `APP_OVERVIEW.md §11` (`sku_embedding` неиспользуемый, DEC-02 открыт); `TZ__STABILIZATION_2026-07-09__ALIGNED.md S6` (осиротевшая `IngredientSKUFactory.save()`).
- Текущее состояние: `mvp.fe/src/shared/llm/*`, `shared/ocr/prompt.ts`+`parse.ts`, `shared/match/prompt.ts`+`parse.ts`, `shared/pos/config.ts` (`VITE_ESUPL_*`), `.env.example`, `entities/order` всё ещё присутствуют; `mvp.be/app/providers/erp/esupl.py:80/:104` (list-методы).
