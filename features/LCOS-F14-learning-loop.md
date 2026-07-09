---
id: LCOS-F14
type: feature
title: «Ров» маппингов цикла обучения
epic: "[[LCOS-E3-sku-identity]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[sku_mapping]]", "[[invoice_lines]]", "[[suppliers]]", "[[subdivisions]]", "[[organizations]]"]
requirements: ["[[sku-identity-resolver]]", "[[fail-closed]]", "[[invoice-status-machine]]", "[[multitenancy]]"]
adrs: ["[[ADR-020]]", "[[ADR-018]]", "[[ADR-019]]"]
legacy_refs: [DEC-0011, DEC-0013, DEC-0012, "08 F1.1", "08 F1.2"]
sources: ["APP_OVERVIEW.md §8", "adr/ADR-020.md", "mvp.be app/api/v1/routes/ingredients.py:100", "mvp.be app/api/v1/routes/ingredients.py:168", "mvp.fe src/entities/invoice/lib/backendMappings.ts", "mvp.fe src/widgets/invoice-workbench/ui/InvoiceWorkbench.tsx:213"]
updated: 2026-07-09
---
# LCOS-F14 · «Ров» маппингов цикла обучения

**Эпик:** [[LCOS-E3-sku-identity]] · **Статус:** built · **Фаза:** Phase 1

## Описание

Цикл обучения — это runtime-механизм, которым «ров» (`sku_mapping`) фактически **растёт**. Там, где [[LCOS-F13-sku-identity-resolver]] только *читает* подтверждённые маппинги на fail-closed пути коммита, эта фича — канал *записи*: каждая подтверждённая человеком идентичность строка→SKU сохраняется, так что следующий инвойс от того же поставщика разрешает эту строку автоматически. Это защитимый актив, который конкурент без истории арендатора не может скопировать — не OCR, а накопленная, ограниченная по арендатору, подтверждённая идентичность (см. [[LCOS-E3-sku-identity]]).

Канал намеренно **один и единственный** (`[[ADR-020]]`): фронтенд вызывает `POST /ingredients/mappings` в обработчике `onSend` `widgets/invoice-workbench` (через `entities/invoice/lib/backendMappings.persistLineMapping`) **перед** мутацией `sendInvoice`. Отправка инвойса с выбранными SKU *и есть* человеческое подтверждение, так что строка пишется с `method='manual'` и `confirmed_by` = аутентифицированный пользователь, что делает её commit-eligible под `[[DEC-0013]]` вариант A (`[[ADR-018]]`). Сам endpoint `submit` никогда не пишет `sku_mapping` — он только читает его на commit-resolve; persist — отдельный запрос в отдельной транзакции.

**Persist-then-commit** (`[[ADR-020]]`): поскольку commit-резолвер fail-closed и разрешает идентичность *только* из `sku_mapping`, маппинг должен существовать *до* выполнения `submit`. Если бы persist выполнялся только после бросающей отправки, fail-closed reject самого первого инвойса заблокировал бы bootstrap «рва» навсегда. Сохранение сначала, в собственной транзакции — это то, что по замыслу позволяет подтверждённому маппингу **пережить reject инвойса**.

**Apply:** на следующем инвойсе от того же поставщика FE запрашивает `GET /ingredients/mappings?supplier_external_id=` и авто-заполняет строки по `normalizeSourceKey(rawName)`, чья FE-реализация зеркалит бэкенд-SSOT `normalize_source_key` (golden-vector тест паритета). Цикл раньше жил в `localStorage`; он был целиком мигрирован на бэкенд, а модуль `localStorage` удалён.

## Возможности

- Сохранение подтверждённой идентичности строка→SKU в `sku_mapping` через `POST /ingredients/mappings` — upsert по составному ключу `(scope_type=subdivision, scope_id, supplier_external_id, нормализованный source_key)`.
- Сервер проставляет `confirmed_by = ctx.user_id` и `confirmed_at = now()`; они **никогда** не принимаются из тела запроса — иначе гейт коммита `[[DEC-0013]]` можно было бы подделать.
- Пишет `method='manual'`, `confidence` и выученную `packing` (восстанавливается в строку при последующем авто-заполнении; умножается в количество, фактически постящееся в POS).
- `source_key` — **сырой текст строки OCR**; бэкенд владеет нормализацией, так что FE отправляет сырой текст и никогда пред-нормализованный ключ (устраняет двойной SSOT с `canonicalText` нечёткого матчера).
- `supplier_external_id` — часть ключа (`[[ADR-019]]`, DEC-0012): тот же текст строки от двух поставщиков маппится на разные POS-SKU без коллизии; `''` = supplier-agnostic/legacy.
- Apply/read: `GET /ingredients/mappings` возвращает только **commit-eligible** строки (`method=manual` ИЛИ `confirmed_by IS NOT NULL`) для поставщика, дедуплицированные `subdivision → org` на `source_key` — ровно те идентичности, что проходят гейт коммита.
- FE авто-заполнение: `loadSupplierMappings` строит lookup, ключуемый по бэкенд-нормализованному `source_key`; редьюсеры применяют его по `normalizeSourceKey(line.rawName)`.
- Persist — **best-effort**: неудавшийся persist не должен провалить уже-успешную отправку — строка просто пере-сохраняется на следующей отправке, а неподтверждённая строка корректно блокируется на следующем коммите (fail-closed).

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Подтверждает идентичность строка→SKU отправкой инвойса; маппинг пишется под его scope арендатора (subdivision). Это человеческое подтверждение, которое растит «ров». |
| [[admin]] | То же, внутри своей subdivision. |
| [[superadmin]] | Межарендаторский доступ. |
| [[sqladmin-operator]] | Не участвует — плоскость оператора не подтверждает идентичности SKU. |

Endpoint со scope арендатора: `scope_id` — это активная subdivision из контекста JWT; запрос без активного контекста subdivision отклоняется (`400`). См. [[auth]], [[multitenancy]].

## Задействованные сущности

- [[sku_mapping]] — сам «ров»; эта фича — его единственный runtime-путь записи. Ключ `(scope_type, scope_id, supplier_external_id, source_key)`; поля `pos_ingredient_id`, `method`, `confidence`, `confirmed_by`, `confirmed_at`, `packing`.
- [[invoice_lines]] — источник каждой подтверждённой идентичности (сырой `description`/`rawName` → выбранный долговечный POS id); строка снимает `pos_ingredient_id` только позже, на коммите.
- [[suppliers]] — `supplier_external_id` (долговечный id Esupl) — часть ключа маппинга.
- [[subdivisions]], [[organizations]] — scope, в который пишется и из которого читается с приоритетом `subdivision → org`.

## Зависимости / связи

- **Требования:** [[sku-identity-resolver]] (нормативная механика, которую питает эта фича), [[fail-closed]] (persist-then-commit существует *потому что* коммит fail-closed), [[invoice-status-machine]] (persist упорядочен перед `submit`), [[multitenancy]] (маппинги со scope арендатора).
- **Фичи:** [[LCOS-F13-sku-identity-resolver]] (читает то, что эта пишет, на коммите), [[LCOS-F15-sku-catalog]] (поставляет долговечный POS id, выбранный в строку), [[LCOS-F9-line-matching]] (подсказки фазы черновика, которые человек подтверждает), [[LCOS-F10-invoice-status-machine]] (последовательность `onSend`/`submit`), [[LCOS-F17-supplier-cards]] (идентичность поставщика в ключе), [[LCOS-F22-sku-stabilization]] (merge-gate, охраняющий это поведение).
- **ADR:** [[ADR-020]] (единый канал persist + persist-then-commit + удалён FE `save()`), [[ADR-018]] (вариант A — только commit-eligible маппинги), [[ADR-019]] (составной ключ с поставщиком).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `POST /ingredients/mappings` делает upsert по `(scope_type='subdivision', scope_id, supplier_external_id, normalize_source_key(source_key))`.
- [ ] AC-BE-2. `source_key` нормализуется через `normalize_source_key` (SSOT) перед lookup/insert.
- [ ] AC-BE-3. `confirmed_by = ctx.user_id` и `confirmed_at = now()` устанавливаются **на стороне сервера** и не читаются из тела; в сочетании с `method='manual'` строка commit-eligible.
- [ ] AC-BE-4. `supplier_external_id` — часть ключа (DEC-0012); тот же `source_key` под двумя поставщиками даёт две различные строки; `''` обозначает supplier-agnostic.
- [ ] AC-BE-5. `packing` и `confidence` сохраняются; отсутствующий активный контекст subdivision → `400`.
- [ ] AC-BE-6. `GET /ingredients/mappings?supplier_external_id=` возвращает только commit-eligible строки (`method=manual` ИЛИ установлен `confirmed_by`), дедуплицированные `subdivision → org` на `source_key`.
- [ ] AC-BE-7. Endpoint `submit` **не** пишет `sku_mapping` — он только читает его на commit-resolve; persist — отдельный запрос/транзакция (`[[ADR-020]]`).
- [ ] AC-BE-8. Изоляция арендаторов: запрос не может создавать, обновлять или перечислять маппинги другой организации (scope обязателен в запросе/репозитории).

### Frontend
- [ ] AC-FE-1. `onSend` сохраняет каждую строку с выбранным SKU (`persistLineMapping`) и **дожидается** этого **перед** тем, как выполнится мутация `sendInvoice` (persist-then-commit) — покрыто тестом `InvoiceWorkbench.onSend`.
- [ ] AC-FE-2. Persist отправляет сырой текст строки (`rawName`) как `source_key` — никогда FE-нормализованный ключ.
- [ ] AC-FE-3. Persist отправляет долговечный id выбранного поставщика как `supplier_external_id` и долговечный POS id выбранного SKU как `pos_ingredient_id`.
- [ ] AC-FE-4. При выборе поставщика / открытии инвойса `loadSupplierMappings` запрашивает «ров» этого поставщика и авто-заполняет строки по `normalizeSourceKey(rawName)`.
- [ ] AC-FE-5. Persist — best-effort: `Promise.allSettled` изолирует сбои; иначе-успешная отправка всё равно завершается и всплывает заметку о несохранённых маппингах, без обрушения потока.

### Прочее
- [ ] AC-OTHER-1. Независимость persist закреплена тестами — T1 (BE: submit → reject → строка `sku_mapping` присутствует) и T2 (FE: `onSend` дожидается `persistLineMapping` перед `sendInvoice`), оба под `merge_gate`.
- [ ] AC-OTHER-2. Прежний цикл обучения на `localStorage` удалён (нет двойного SSOT); no-op FE `IngredientSKUFactory.save()` удалён (`[[ADR-020]]`).

## Открытые вопросы / гейты

- **VER-021** — долговечность `pos_ingredient_id` при edit/delete-recreate в Esupl эмпирически не подтверждена; проба требует ЗАПИСИ в песочницу → запуск владельцем, merge остаётся гейтированным. См. [[LCOS-F13-sku-identity-resolver]].
- FE ручной persist сейчас хардкодит `confidence = 1`; градуированная уверенность для подтверждённых подсказок ещё не смоделирована.
- UX отзыва / коррекции маппинга (переподтверждение неверной идентичности) опирается на перезапись upsert; явного потока «разучиться» нет.

## Источники

- `APP_OVERVIEW.md §8` (цикл обучения: persist / ключ / apply, persist-then-commit), `§7` (вариант A), `§11` (модель данных).
- `adr/ADR-020.md` (единый канал, persist-then-commit, удалён `save()`), `adr/ADR-018.md` (вариант A), `adr/ADR-019.md` (составной ключ).
- `mvp.be/app/api/v1/routes/ingredients.py:100` (`create_or_update_mapping`, серверно проставленный `confirmed_by`), `:168` (`list_mappings`, commit-eligible + дедуп subdivision→org).
- `mvp.be/app/services/invoice_service.py:295` (`_resolve_commit_identities` читает только маппинг — доказательство, что submit его не пишет).
- `mvp.be/app/db/models.py:464` (`SkuMapping`), `:502` (`UNIQUE(scope_type,scope_id,supplier_external_id,source_key)`).
- `mvp.fe/src/entities/invoice/lib/backendMappings.ts:10` (`normalizeSourceKey`), `:25` (`loadSupplierMappings`), `:60` (`persistLineMapping`).
- `mvp.fe/src/widgets/invoice-workbench/ui/InvoiceWorkbench.tsx:213` (`onSend`), `:223` (persist дожидается перед `sendInvoice`).
