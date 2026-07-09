---
id: LCOS-F29
type: feature
title: Многостраничное распознавание (страницы фото → один InvoiceDraft)
epic: "[[LCOS-E6-ocr-quality]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]", "[[invoice_lines]]", "[[system_settings]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[vpn-egress]]"]
adrs: ["[[ADR-006]]", "[[ADR-009]]", "[[ADR-012]]"]
legacy_refs: [plan S2 (S2-B1, S2-B3, S2-F1), "DEC-07 variant A"]
sources: ["plan/PHASE_S2_OCR_CAPTURE.md §1 (S2-B1/B3), §2 (S2-F1), §4 AC-1", "mvp.be app/providers/ocr/base.py", "mvp.be app/api/v1/routes/invoices.py:33", "mvp.be app/services/invoice_service.py:121", "mvp.fe src/shared/ocr/providers/backend.ts:42", "mvp.fe src/entities/invoice/model/sessionSlice.ts:22"]
updated: 2026-07-09
---
# LCOS-F29 · Многостраничное распознавание (страницы фото → один InvoiceDraft)
**Epic:** [[LCOS-E6-ocr-quality]] · **Status:** planned · **Phase:** Phase 1

## Описание

Реальные накладные регулярно занимают две-три страницы. Сегодня путь распознавания обрабатывает ровно одну страницу: бэкенд `POST /invoices/recognize` принимает единственный `file`, а frontend `BackendOcrProvider` отправляет только `pages[0]` — лишние удержанные страницы молча отбрасываются (см. [[LCOS-F8-ocr-recognition]]). Временный предохранитель, который хотя бы предупреждает пользователя о потерянных страницах, живёт в [[LCOS-F26-multipage-fix]] (эпик [[LCOS-E5-stabilization]]); эта фича — полное исправление.

Цель — чтобы многостраничный счёт-фактура распознавался как **один** `InvoiceDraft`: все товарные строки со всех страниц объединяются в порядке страниц, а итоги берутся с последней страницы. Выбран вариант DEC-07 A: расширить контракт recognize, чтобы принимать до 3 страниц, и отправлять их в vision-модель в **одном мультимодальном запросе**, а не делать N независимых вызовов и сшивать результаты (что удвоило бы строки итогов и потеряло межстраничный контекст).

Endpoint сохраняет свои существующие инварианты — он ни пишет в ERP, ни персистит что-либо; egress к LLM по-прежнему идёт через VPN-сайдкар, когда рантайм-переключатель включён ([[vpn-egress]], [[fail-closed]]). Это одноразовое, намеренное изменение сигнатуры шва `OcrProvider` ([[provider-abstraction]], [[ADR-009]]).

## Возможности

- `POST /invoices/recognize` принимает **до 3 файлов** (multipart повторяющийся `file` или поле `files[]`) вместо единственного изображения; каждая часть MIME-валидируется против `_ALLOWED_MIME` (`image/jpeg|png|webp`).
- Шов `OcrProvider.extract_invoice` расширяется, чтобы принимать упорядоченный список страниц: `extract_invoice(pages: list[OcrImage], ...) -> InvoiceDraft`.
- Claude-провайдер отправляет все страницы, по порядку, в одном мультимодальном запросе и возвращает единый `InvoiceDraft` — строки конкатенированы по страницам с непрерывным `line_no`, заголовок/итог берётся с последней страницы.
- Ограничители размера запроса: страницы уже клиент-нормализованы до ≤1568px по длинному краю; запрос, всё ещё превышающий лимит, отклоняется с `413` в конверте ошибки.
- Опциональный счётчик `pages_processed` в ответе, чтобы frontend мог подтвердить «распознано N страниц» (S2-B3).
- Frontend отправляет **все** удержанные страницы (до `MAX_INVOICE_PAGES = 3`), убирая одностраничное ограничение и предупреждение S1 о потерянных страницах.

## Доступ по ролям

| Роль | Что можно делать |
|---|---|
| [[member]] | Прикрепить до 3 страниц одного счёта-фактуры и получить единый объединённый черновик в пределах своего subdivision. |
| [[admin]] | То же, что и member, в пределах своего subdivision. |
| [[superadmin]] | То же по всем тенантам; также может редактировать OCR-промпт / `ai_provider` через config API. |
| [[sqladmin-operator]] | Не в потоке; переключает `ai_provider` / OCR-промпт в SQLAdmin-плоскости (см. [[LCOS-F3-sqladmin-operator]]). |

Endpoint тенант-скоупирован: `organization_id` / `subdivision_id` берутся из активного JWT-контекста ([[auth]], [[multitenancy]]).

## Задействованные сущности

- [[invoices]] — цель потока; по-прежнему **не** создаётся на `/recognize`, но провенанс `ocr_provider`/`ocr_raw` персистится позже на submit.
- [[invoice_lines]] — черновые строки (`InvoiceLineDraft`) теперь агрегируются по страницам в один набор строк.
- [[system_settings]] — `ai_provider` (рантайм-выбор реализации OCR) и хранимый в БД OCR-промпт.

## Зависимости / связи

- **Требования:** [[provider-abstraction]] (единичное намеренное изменение Protocol `OcrProvider`), [[fail-closed]] + [[vpn-egress]] (egress к LLM через VPN-сайдкар при `ai_vpn_enabled`; VPN упал → отказ, никакого прямого egress), [[invoice-status-machine]] (черновик питает `prepare`/`submit`).
- **Фичи:** апстрим [[LCOS-F8-ocr-recognition]] (одностраничное recognize, которое это расширяет), временный предохранитель [[LCOS-F26-multipage-fix]] (замещается по выходу), даунстрим [[LCOS-F9-line-matching]] (матчит объединённые строки). Родственные фичи качества захвата: [[LCOS-F30-recognition-context]], [[LCOS-F31-auto-crop]], [[LCOS-F32-camera-capture]], [[LCOS-F33-confidence-gate]].
- **ADR:** [[ADR-009]] (шов провайдера, одна реализация), [[ADR-006]] (fail-closed egress), [[ADR-012]] (живые пути провайдера только на бэкенде).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `POST /invoices/recognize` принимает до 3 частей-изображений (повторяющийся `file` или `files[]`); 2- и 3-страничный счёт-фактура каждый распознаётся в ОДИН `InvoiceDraft`, чьи `lines` содержат строки со всех страниц.
- [ ] AC-BE-2. Каждая часть MIME-валидируется против `{image/jpeg,image/png,image/webp}` → нарушающая часть даёт `415`; пустая часть → `400`; более 3 частей → отклонено с понятной ошибкой.
- [ ] AC-BE-3. Сигнатура `OcrProvider.extract_invoice` меняется единожды, чтобы принимать упорядоченный `list[OcrImage]`; Claude-провайдер делает один мультимодальный запрос со страницами по порядку; итог/заголовок берётся с последней страницы (unit-тест с respx/mock-провайдером и 2 фабрикованными страницами).
- [ ] AC-BE-4. Endpoint по-прежнему ни персистит (`invoices`/`invoice_lines`), ни пишет в ERP; провенанс `ocr_provider` по-прежнему проставляется на черновике.
- [ ] AC-BE-5. Слишком большой объединённый запрос (сверх лимита размера) → `413` в конверте ошибки, а не 500/timeout.
- [ ] AC-BE-6. Fail-closed egress сохранён: при `ai_vpn_enabled=ON` и недостижимом VPN многостраничный вызов отклоняется с понятной ошибкой и без прямого egress (неотменяемый, merge-gated тест).
- [ ] AC-BE-7. (Опционально S2-B3) Ответ несёт `pages_processed = N`.

### Frontend
- [ ] AC-FE-1. `BackendOcrProvider.extractInvoice` отправляет ВСЕ удержанные страницы (до `MAX_INVOICE_PAGES = 3`), а не `pages[0]`; multipart-тело несёт по одной части `file` на страницу в порядке захвата.
- [ ] AC-FE-2. Предупреждение S1 «лишние страницы проигнорированы» убрано; возвращённый объединённый черновик показывает строки с каждой страницы в workbench.
- [ ] AC-FE-3. Если бэкенд возвращает `pages_processed`, UI подтверждает «распознано N страниц»; несовпадение с числом отправленных всплывает неблокирующим уведомлением.
- [ ] AC-FE-4. `415`/`400`/`413`/сбой распознавания рендерят понятное сообщение без падения формы; abort-сигнал отменяет незавершённый многостраничный запрос при навигации.

### Прочее (data/QA)
- [ ] AC-OTHER-1. Ручная проверка на реальной многостраничной накладной: ни одна страница со строками не потеряна; DoD G10 (pytest + ruff + build зелёные, тесты tenant/fail-closed целы, документ архитектуры обновлён под изменение сигнатуры `OcrProvider`).

## Открытые вопросы / гейты

- **Изменение шва намеренное и одноразовое** — расширение `extract_invoice` до списка страниц не должно форкать Protocol; mock/demo-провайдер тоже должен реализовать новую сигнатуру.
- **Порядок строк по страницам** — `line_no` должен оставаться непрерывным и упорядоченным по страницам, чтобы даунстрим-матчинг ([[LCOS-F9-line-matching]]) был стабилен.
- **Де-дуп строки итога** — учитываются только итоги последней страницы; постраничные строки «Итого» должны отбрасываться (общее с [[LCOS-F33-confidence-gate]] / правилом `totalRow`).
- Замещает временный предохранитель [[LCOS-F26-multipage-fix]] по слиянию.

## Источники

- `plan/PHASE_S2_OCR_CAPTURE.md` §1 S2-B1 (multipart до 3, изменение шва, один мультимодальный запрос, 413), S2-B3 (`pages_processed`), §2 S2-F1 (отправка всех страниц, удаление предупреждения S1), §4 AC-1.
- `mvp.be/app/api/v1/routes/invoices.py:33` (`recognize_invoice`, `_ALLOWED_MIME`), `app/services/invoice_service.py:121` (`recognize`).
- `mvp.be/app/providers/ocr/base.py` (Protocol `OcrProvider`, `extract_invoice`).
- `mvp.fe/src/shared/ocr/providers/backend.ts:42` (одностраничный лимит `pages[0]`), `src/shared/ocr/types.ts` (`OcrPage`), `src/entities/invoice/model/sessionSlice.ts:22` (`MAX_INVOICE_PAGES = 3`).
