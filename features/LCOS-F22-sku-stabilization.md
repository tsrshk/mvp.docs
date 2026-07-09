---
id: LCOS-F22
type: feature
title: Стабилизация SKU-идентичности (DEC-0011/0013/0012)
epic: "[[LCOS-E5-stabilization]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[sku_mapping]]", "[[ingredient_cache]]", "[[invoice_lines]]", "[[ingredients]]", "[[packings]]"]
requirements: ["[[sku-identity-resolver]]", "[[fail-closed]]", "[[erp-esupl-integration]]"]
adrs: ["[[DEC-0011]]", "[[DEC-0013]]", "[[ADR-018]]", "[[ADR-019]]", "[[ADR-020]]"]
legacy_refs: [08 F1.1, 08 F1.2, DEC-0012, TZ__STABILIZATION S6/S8/S9]
sources: ["TZ__STABILIZATION_2026-07-09__ALIGNED.md", "APP_OVERVIEW.md §7 §8 §13", "mvp.be app/services/invoice_service.py:295", "mvp.be alembic/versions/0008_*, 0009_sku_mapping_packing", "mvp.be pyproject.toml:65"]
updated: 2026-07-09
---
# LCOS-F22 · Стабилизация SKU-идентичности (DEC-0011/0013/0012)

**Epic:** [[LCOS-E5-stabilization]] · **Status:** built · **Phase:** Phase 1

## Описание

Эта фича ратифицирует и укрепляет двухконтекстную модель SKU-идентичности, от которой зависит весь клин фичи со счетами-фактурами. Это тот момент, когда дизайн рва (`[[LCOS-F13-sku-identity-resolver]]`, `[[LCOS-F14-learning-loop]]`) перестал быть декларативным и стал верифицируемым, состязательно отревьюенным и защищённым merge-гейтом. Она закрывает задачи согласования S5–S9 согласованного ТЗ по стабилизации относительно реального кода и ратифицированных решений `[[DEC-0011]]`/`[[DEC-0013]]`.

**Подтверждённый поток данных — это SSOT и не должен меняться без нового DEC** (`TZ__STABILIZATION_2026-07-09__ALIGNED.md`):
- **Черновик (`prepare()`, толерантный):** payload для Esupl строится из *локального* каталога — `esupl_item_id` (int) и `esupl_unit_id` (зеркало POS), плюс packing. Fuzzy / AI / exact-cache подсказки живут **только здесь**. `pos_ingredient_id` никогда не затрагивается.
- **Коммит (`submit()` → `_resolve_commit_identities`, fail-closed):** `pos_ingredient_id` резолвится **только** из `[[sku_mapping]]` (`method='manual'` ИЛИ установлен `confirmed_by`), приоритет subdivision → org. Затем он live-валидируется против POS (`GET /teams/{id}/products?id=`); нет точного совпадения → `None`, fail-closed, никогда не `items[0]`. Единица измерения: POS авторитетен, OCR — толерантная перекрёстная проверка (блокировать только когда обе присутствуют и различаются). Cache/fuzzy/AI **не** участвуют на коммите.

Решающим итогом стабилизации было **отклонить вариант C** (авто-создание строк `sku_mapping` с `cache_exact` / `confirmed_by='system'` при точном попадании в кэш) и утвердить **вариант A**: маппинг становится пригодным к коммиту только через явное человеческое действие. Вариант C откатил бы корректный код и сломал зелёные тесты `merge_gate`, поэтому был наложен вето (`[[ADR-018]]`). Learning-loop также был полностью мигрирован из браузерного `localStorage` в бэкендную таблицу `[[sku_mapping]]` с использованием композитного ключа DEC-0012 плюс packing (миграции `0008`/`0009`), с сохранением *до* отправки, чтобы подтверждённый маппинг пережил отклонение счёта-фактуры (`[[ADR-020]]`).

## Возможности

- Устойчивая идентичность на момент коммита: строка → `pos_ingredient_id` резолвится исключительно из `[[sku_mapping]]`, сначала subdivision, затем org, с live-валидацией против POS и fail-closed `None` при отсутствии точного совпадения.
- Разделение draft/commit, обеспеченное в коде: толерантные подсказки (fuzzy/AI/exact-cache) заключены в `prepare()`; коммит читает только подтверждённые человеком маппинги.
- Learning-loop сохраняется на стороне сервера под композитным ключом DEC-0012 (`scope`, `supplier_external_id`, `source_key`) + packing; модуль `localStorage` удалён.
- Порядок «сначала сохранить, потом коммитить»: подтверждённый маппинг записывается в собственной транзакции при отправке, до мутации submit, поэтому он переживает fail-closed отклонение первого счёта-фактуры.
- Авторитет единицы измерения (D2): payload берёт единицу из POS; компаратор толерантен к пустым значениям и нормализован; несовпадение блокирует только когда обе единицы (OCR и POS) присутствуют и различаются.
- Инварианты под merge-гейтом: `pytest -m merge_gate` покрывает поведение устойчивого id и commit-гейта DEC-0013 (устойчивый `pos_ingredient_id`, никогда суррогат).
- Распознавание мёртвой колонки: `invoice_lines.sku_embedding` подтверждён как неиспользуемый и помечен на удаление (см. `[[LCOS-F25-deadcode-cleanup]]`).

## Доступ по ролям

| Роль | Что можно делать |
|---|---|
| [[member]] | Подтвердить маппинг строка↔SKU при редактировании счёта-фактуры в своём subdivision; подтверждение сохраняется как маппинг `method='manual'` и становится пригодным к коммиту. |
| [[admin]] | То же, что и member, в пределах своего subdivision. |
| [[superadmin]] | То же по всем тенантам; может инспектировать/чинить маппинги через operator-плоскость. |
| [[sqladmin-operator]] | Не участвует в потоке; может инспектировать строки `[[sku_mapping]]` в SQLAdmin. |

Каждое чтение/запись тенант-скоупировано: `organization_id` / `subdivision_id` берутся из активного JWT-контекста (см. [[auth]], [[multitenancy]]).

## Задействованные сущности

- [[sku_mapping]] — ров и *единственный* источник `pos_ingredient_id` на момент коммита. Композитный ключ `(scope, supplier_external_id, source_key)` + `packing`; несёт `method`, `confidence`, `confirmed_by`.
- [[ingredient_cache]] — неавторитетный, scope-aware черновой кэш; участвует только в подсказках `prepare()`, никогда на коммите (VER-022, закрыт `[[DEC-0013]]`).
- [[invoice_lines]] — каждая сохранённая строка держит устойчивый `pos_ingredient_id`; неиспользуемая колонка `sku_embedding` помечена как мёртвая.
- [[ingredients]] + [[packings]] — зеркало локального каталога, из которого строится черновой payload (`esupl_item_id`, `esupl_unit_id`, packing).

## Зависимости / связи

- **Требования:** [[sku-identity-resolver]] (контракт двухконтекстного резолвера, который здесь стабилизируется), [[fail-closed]] (коммит резолвится в `None` вместо угадывания; никакого `items[0]`), [[erp-esupl-integration]] (POS авторитетен на коммите; read-only).
- **Фичи:** реализует резолвер в [[LCOS-F13-sku-identity-resolver]] и ров в [[LCOS-F14-learning-loop]]; коммит вызывается из [[LCOS-F10-invoice-status-machine]]; черновые подсказки потребляют [[LCOS-F16-ingredient-cache]] и [[LCOS-F15-sku-catalog]]. Путь read-валидации — [[LCOS-F11-esupl-read]].
- **Решения:** [[DEC-0011]] (двухконтекстная идентичность, T2/T5), [[DEC-0013]] (вариант A утверждён; VER-022 закрыт), [[ADR-018]] (вариант C отклонён вето), [[ADR-019]]/[[ADR-020]] (ров на композитном ключе + «сначала сохранить, потом коммитить»).

## Критерии приёмки (AC)

### Backend
- [x] AC-BE-1. `submit()` резолвит `pos_ingredient_id` **только** через `_resolve_commit_identities`, читая `[[sku_mapping]]` где `method='manual'` ИЛИ установлен `confirmed_by`, приоритет subdivision → org.
- [x] AC-BE-2. Коммит live-валидирует против `GET /teams/{id}/products?id=`; нет точного совпадения → `pos_ingredient_id=None` (fail-closed), никогда не `items[0]`.
- [x] AC-BE-3. Никакие cache/fuzzy/AI не консультируются на коммите; эти подсказки существуют только в `prepare()`. Черновик никогда не мутирует `pos_ingredient_id`.
- [x] AC-BE-4. Авторитет единицы измерения (D2): payload использует единицу из POS; компаратор толерантен к пустым значениям/нормализован; блокировать только когда обе единицы (OCR и POS) присутствуют и различаются. Покрыто `test_esupl_commit_validation_flags_real_unit_mismatch`, `test_esupl_commit_validation_tolerates_missing_ocr_unit` и добавленным `test_unit_present_equal_passes`.
- [x] AC-BE-5. Learning-loop сохраняется на стороне сервера под композитным ключом DEC-0012 + packing (миграции `0008`/`0009`, downgrade работает); нет авто-создания `cache_exact` / `confirmed_by='system'` (вариант C отсутствует).
- [x] AC-BE-6. Сначала сохранить, потом коммитить: подтверждённый маппинг записывается в отдельной транзакции до мутации отправки и переживает отклонение счёта-фактуры (`[[ADR-020]]`).
- [x] AC-BE-7. `pytest -m merge_gate` зелёный и покрывает устойчивый id + commit-гейт DEC-0013; `TrackerErpProvider` утверждает устойчивый `pos_ingredient_id`, а не суррогат.

### Frontend
- [x] AC-FE-1. При отправке подтверждённые маппинги строк сохраняются на бэкенд (`POST /ingredients/mappings`, `method='manual'`, `confirmed_by=` аутентифицированный пользователь) в обработчике `onSend`, до `sendInvoice`.
- [x] AC-FE-2. При последующем счёте-фактуре от того же поставщика FE запрашивает `GET /ingredients/mappings?supplier_external_id=` и автозаполняет строки по `normalizeSourceKey(rawName)`.
- [x] AC-FE-3. Нормализация `source_key` на FE зеркалит бэкендный `normalize_source_key` (проверено golden-vector тестом на паритет).
- [x] AC-FE-4. Модуль learning-loop на `localStorage` удалён; браузер-сохранённых маппингов не осталось.

### Прочее (верификация)
- [x] AC-OTHER-1. Верифицировано 2026-07-09 на реальном Postgres+pgvector: BE 209 / merge_gate 17 / FE 43 зелёные (`APP_OVERVIEW.md §12/§13`).
- [x] AC-OTHER-2. Состязательное ревью (22 находки) разрешено, включая критический баг порядка сохранения при bootstrap.

## Открытые вопросы / гейты

- **Устойчивость VER-021 (OPEN, выполняется владельцем):** стабилен ли `pos_ingredient_id` при edit / delete-recreate — эмпирически *не* подтверждено; проба требует записи в песочницу и не может закрыться в read-only сессии. Merge остаётся под гейтом. См. [[VER-021_ESUPL_DURABILITY_TEST]] и [[LCOS-F28-esupl-contracts]].
- **Удаление `sku_embedding` (backlog DEC-02, открыто):** неиспользуемая колонка помечена; удаление приземляется в [[LCOS-F25-deadcode-cleanup]].
- **Фабрика `save()` из S6 (P1):** `IngredientSKUFactory.save()` осиротела; либо подключить её в явный поток «создать маппинг из picker» (`method='manual'`), либо удалить — см. [[LCOS-F25-deadcode-cleanup]]. **Не** должна реализовывать авто-создание `cache_exact`/`confirmed_by='system'` (это вариант C, наложено вето).

## Источники

- `TZ__STABILIZATION_2026-07-09__ALIGNED.md` — подтверждённый поток данных (SSOT), задачи S5/S6/S8/S9, таблица «Removed vs original TZ» (вариант C отклонён вето).
- `APP_OVERVIEW.md §7` (двухконтекстная идентичность), `§8` (learning loop, «сначала сохранить, потом коммитить»), `§11` (`sku_mapping`, мёртвая колонка `sku_embedding`), `§12/§13` (счётчики тестов, done/open).
- `mvp.be/app/services/invoice_service.py:295-336` (`_resolve_commit_identities`), `:141-143, :218-226` (паттерн per-org резолва team/token).
- `mvp.be/alembic/versions/0008_*`, `0009_sku_mapping_packing` (миграция композитного ключа + packing).
- `mvp.be/pyproject.toml:65-67` (маркер `merge_gate`); `tests/features/invoice/recognition/test_merge_gate_durable_id.py`, `test_dec0013_commit_gate.py`, `test_persist_survives_reject.py`.
