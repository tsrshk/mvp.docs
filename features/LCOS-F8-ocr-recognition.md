---
id: LCOS-F8
type: feature
title: OCR-распознавание инвойса (фото → InvoiceDraft)
epic: "[[LCOS-E2-invoice-intake]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]", "[[invoice_lines]]", "[[system_settings]]", "[[integration_credentials]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[erp-esupl-integration]]"]
adrs: ["[[ADR-006]]", "[[ADR-009]]", "[[ADR-012]]"]
legacy_refs: [07 Э0/Э1, plan F1, "08 F0.1", "08 F0.2"]
sources: ["APP_OVERVIEW.md §6", "plan/00_IMPLEMENTATION_PLAN.md §1", "mvp.be app/api/v1/routes/invoices.py:33", "mvp.be app/services/invoice_service.py:121", "mvp.be app/providers/ocr/claude.py", "mvp.fe src/shared/ocr"]
updated: 2026-07-09
---
# LCOS-F8 · OCR-распознавание инвойса (фото → InvoiceDraft)
**Эпик:** [[LCOS-E2-invoice-intake]] · **Статус:** built · **Фаза:** Phase 1

## Описание

Первый шаг клина «приём инвойсов»: пользователь фотографирует бумажный инвойс, изображение отправляется на бэкенд, где vision-LLM (Claude Vision) распознаёт его в структурированный `InvoiceDraft` — номер, дату, итог, валюту, сырые строки (описание, количество, единица, цена, сумма) и имя поставщика/налоговый ID из шапки. Это «точка входа» всего потока инвойсов (см. [[invoice-status-machine]]).

Endpoint `POST /invoices/recognize` **не пишет в ERP и не сохраняет** ничего в базу данных — он лишь возвращает черновик, который человек редактирует на фронтенде перед `prepare`/`submit`. OCR-провайдер разрешается **лениво** (только на `/recognize`), чтобы пути записи не платили за чтение из БД выбора AI-провайдера из `system_settings.ai_provider` (`InvoiceService._get_ocr`). Ключ модели и маршрутизация egress (VPN) живут только на бэкенде — фронтенд не хранит секретов (`[[ADR-012]]`).

Текущее ограничение: распознаётся **одна страница на запрос** (один файл, один LLM-вызов). Многостраничные инвойсы и «молчаливая потеря» вторых страниц — известный пробел, отслеживаемый в [[LCOS-F29-multipage-recognize]] (эпик [[LCOS-E6-ocr-quality]]).

## Возможности

- Загрузка изображения (`multipart/form-data`, поле `file`); разрешённые MIME-типы — `image/jpeg`, `image/png`, `image/webp` (иначе `415`); пустой файл → `400`.
- Распознавание vision-LLM в `InvoiceDraft`: `number`, `issued_at`, `total_amount`, `currency`, `lines[]` (`line_no`, `description`, `quantity`, `unit`, `unit_price`, `line_total`), `supplier_name`, `supplier_tax_id`.
- Provenance: `ocr_provider` (имя провайдера) проставляется на черновике, чтобы `submit` (отдельный инстанс, где OCR уже не разрешается) сохранял происхождение в `invoices.ocr_provider` / `ocr_raw`.
- Промпт распознавания хранится в БД (`system_settings`, миграция `1e12…`) и редактируется **без редеплоя** (`resolve_invoice_prompt`).
- Предобработка изображения на FE перед загрузкой (нормализация EXIF, resize, JPEG) в `shared/ocr/preprocess` — снижает вес и стабилизирует распознавание.
- Паттерн провайдера на фронтенде `backend | mock`: `mock` возвращает демо-черновик для разработки без реального LLM.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Загружает фото и получает черновик внутри своей subdivision; редактирует и отправляет инвойс. |
| [[admin]] | То же, что member, внутри своей subdivision. |
| [[superadmin]] | Доступ по всем арендаторам; плюс редактирование OCR-промпта и `ai_provider` через config API. |
| [[sqladmin-operator]] | Не участвует в потоке; переключает `ai_provider` / OCR-промпт в плоскости SQLAdmin (см. [[LCOS-F3-sqladmin-operator]]). |

Endpoint со scope арендатора: scope (`organization_id` / `subdivision_id`) берётся из активного контекста JWT (см. [[auth]], [[multitenancy]]).

## Задействованные сущности

- [[invoices]] — целевая сущность потока; **не создаётся** на `/recognize`, но `ocr_provider`/`ocr_raw` черновика позже сохраняются при `submit`.
- [[invoice_lines]] — сырые строки черновика (домен `InvoiceLineDraft`); на этом шаге они ещё не привязаны к каталогу/SKU.
- [[system_settings]] — `ai_provider` (runtime-выбор реализации OCR) и OCR-промпт (редактируется без редеплоя).
- [[integration_credentials]] — зашифрованный Fernet AI-ключ (читается бэкендом, egress через VPN; фронтенд никогда не видит ключ).

## Зависимости / связи

- **Требования:** [[provider-abstraction]] (OCR за `Protocol` + реестром, одна реализация `claude`, `[[ADR-009]]`), [[fail-closed]] (VPN недоступен при включённом тумблере → отказ, нет молчаливого прямого egress; `[[ADR-006]]`), [[erp-esupl-integration]] (LCOS read-only против сторонних данных).
- **Фичи:** результат передаётся дальше в [[LCOS-F9-line-matching]] (матчинг строк против каталога) и [[LCOS-F10-invoice-status-machine]] (`prepare`/`submit`). Многостраничность — [[LCOS-F29-multipage-recognize]]; качество/контекст/авто-кроп — [[LCOS-F30-recognition-context]], [[LCOS-F31-auto-crop]], [[LCOS-F33-confidence-gate]].
- **ADR:** [[ADR-009]] (шов провайдера, одна реализация за раз), [[ADR-006]] (fail-closed egress), [[ADR-012]] (живые пути провайдеров только на бэкенде).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `POST /invoices/recognize` принимает `multipart/form-data` с полем `file`; возвращает `InvoiceDraft` (`200`).
- [ ] AC-BE-2. MIME вне `{image/jpeg,image/png,image/webp}` → `415`; пустое тело файла → `400`.
- [ ] AC-BE-3. Endpoint НЕ пишет в ERP и НЕ сохраняет инвойс/строки (нет записей в `invoices`/`invoice_lines`).
- [ ] AC-BE-4. OCR-провайдер разрешается лениво: `prepare`/`submit`/`list` не читают `system_settings.ai_provider` (проверяется тем, что путь записи работает без настроенного OCR).
- [ ] AC-BE-5. У черновика проставлен `ocr_provider = <имя реализации>` (provenance переживает круговой путь до `submit`).
- [ ] AC-BE-6. Промпт распознавания читается из БД (`system_settings`); редактирование промпта меняет поведение без редеплоя.
- [ ] AC-BE-7. Fail-closed egress: при `ai_vpn_enabled=ON` и недоступном VPN LLM-запрос отклоняется с ясной ошибкой, без прямого egress (незыблемое, покрыто тестом, блокирует merge).
- [ ] AC-BE-8. AI-ключ читается из `integration_credentials` (Fernet), без env-фолбэка; ключи/токены не логируются.

### Frontend
- [ ] AC-FE-1. Пользователь загружает/делает фото; изображение проходит предобработку (`shared/ocr/preprocess`: EXIF, resize, JPEG) перед загрузкой.
- [ ] AC-FE-2. FE вызывает `POST /invoices/recognize` (LLM на стороне сервера), нет API-ключа в браузере.
- [ ] AC-FE-3. Распознанный черновик отображается как редактируемая форма строк; человек редактирует его перед `prepare`/`submit`.
- [ ] AC-FE-4. Провайдер `mock` возвращает демо-черновик в dev-режиме (`shared/ocr/providers/mock`).
- [ ] AC-FE-5. Ошибки `415`/`400`/сбой распознавания показываются с ясным сообщением, без падения формы.

### Прочее (ограничение)
- [ ] AC-OTHER-1. Многостраничный инвойс в одном запросе НЕ поддерживается — задокументировано как пробел → [[LCOS-F29-multipage-recognize]] (промежуточный фикс молчаливой потери — [[LCOS-F26-multipage-fix]]).

## Открытые вопросы / гейты

- **Многостраничность** — вторые+ страницы теряются молча; промежуточный фикс (явное предупреждение) — [[LCOS-F26-multipage-fix]], полное решение — [[LCOS-F29-multipage-recognize]].
- **Оценка точности OCR** — отдельный прогон (`scripts/ocr_eval.py`), не часть обычного pytest.
- Пост-распознавательный гейт уверенности ещё не встроен ([[LCOS-F33-confidence-gate]]).

## Источники

- `APP_OVERVIEW.md §6` (ключевой поток: recognize → InvoiceDraft), `§2/§3` (стек, ленивый резолвер OCR).
- `plan/00_IMPLEMENTATION_PLAN.md §1`.
- `mvp.be/app/api/v1/routes/invoices.py:33` (`recognize_invoice`, гейт MIME).
- `mvp.be/app/services/invoice_service.py:114` (`_get_ocr` ленивый резолвер), `:121` (`recognize`).
- `mvp.be/app/providers/ocr/claude.py`, `app/providers/ocr/base.py` (шов), `app/providers/ocr/prompt.py`.
- `mvp.fe/src/shared/ocr/providers/backend.ts:49` (`/invoices/recognize`), `src/shared/ocr/preprocess/*`.
