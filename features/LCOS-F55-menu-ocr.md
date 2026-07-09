---
id: LCOS-F55
type: feature
title: OCR меню (тип документа menu)
epic: "[[LCOS-E11-competitor-menu]]"
status: future
phase: "Phase 2"
roles: [member, admin, superadmin, sqladmin-operator]
entities: ["[[integration_credentials]]", "[[system_settings]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[vpn-egress]]"]
adrs: ["[[ADR-009]]", "[[ADR-006]]", "[[ADR-012]]"]
legacy_refs: [plan F7, "plan F7-B2", "plan F7-F1", 07 Э7]
sources: ["plan/PHASE_F7_COMPETITORS_MENU.md §1 (F7-B2), §2 (F7-F1)", "07_PHASES.md Э7", "plan/00_IMPLEMENTATION_PLAN.md F7"]
updated: 2026-07-09
---
# LCOS-F55 · OCR меню (тип документа menu)
**Epic:** [[LCOS-E11-competitor-menu]] · **Status:** future · **Phase:** Phase 2

## Описание

Захват меню конкурента путём его фотографирования во время обхода и распознавание в структурированные позиции — с переиспользованием инфраструктуры OCR накладных вместо построения второго пайплайна. Шов OCR получает новый тип документа `menu` (зеркалируя паттерн `invoiceType` из [[LCOS-E6-ocr-quality]]): выделенный промпт просит vision-LLM извлечь позиции меню (название, объём, цена, категория) как JSON, возвращая `null` там, где не уверен, в доменный DTO `MenuDraft`. Всё выполняется через ту же инфраструктуру `ai_complete` / `OcrProvider` с fail-closed VPN-egress и ключом со скоупом платформы — без нового провайдера, без нового пути egress ([[ADR-009]]).

`POST /api/v1/competitors/{id}/menu/recognize` (multipart, до 3 фото = страниц меню) возвращает `MenuDraft` **без сохранения**, ровно как `/invoices/recognize`; человек просматривает и правит позиции, затем `POST /api/v1/competitors/{id}/menu` сохраняет подтверждённый снимок. Каждый обход = одна строка `competitor_menu_snapshots` (с `captured_on`, `image_ref`, `ocr_raw`) плюс её `competitor_menu_items` (название-как-показано, цена, валюта, объём, категория). Повторный захват создаёт **новый** снимок; старые снимки остаются читаемыми, так что история сохраняется. Фронтенд максимально переиспользует пайплайн фото workbench/prepare-step из [[LCOS-E6-ocr-quality]].

## Возможности

- Новый тип документа OCR `menu`: выделенный промпт извлечения меню на общем шве провайдера ([[provider-abstraction]], [[ADR-009]]).
- `POST /competitors/{id}/menu/recognize` — до 3 страниц → `MenuDraft`, без сохранения (паритет с `/invoices/recognize`).
- `POST /competitors/{id}/menu` — сохранить проверенный снимок с его позициями.
- Модель снимков: один обход = один `competitor_menu_snapshots`; повторный захват = новый снимок, прежние снимки читаемы (история сохранена).
- Fail-closed egress: нет ключа → `AiUnavailableError` (503); `ai_vpn_enabled=true` + мёртвый туннель → `VpnUnavailableError` ([[fail-closed]], [[vpn-egress]], [[ADR-006]]).
- FE переиспользует поток фото → кроп → распознавание → таблица проверки из workbench накладных.
- Ключ и маршрутизация egress живут только на бэкенде; браузер не хранит секрета ([[ADR-012]]).

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Фотографирует меню конкурента и проверяет распознанные позиции в рамках своего подразделения. |
| [[admin]] | То же; обычно проводит обход и сохраняет снимки для организации. |
| [[superadmin]] | Кросс-тенантный доступ; редактирует OCR-промпт `menu` и `ai_provider` через config-API. |
| [[sqladmin-operator]] | Переключает `ai_provider` / редактирует промпт меню в плоскости SQLAdmin (см. [[LCOS-F3-sqladmin-operator]]); не участвует в потоке захвата. |

Тенант-скоуп: снимки и позиции изолированы по организации; скоуп берётся из контекста JWT ([[auth]], [[multitenancy]]).

## Задействованные сущности

- [[integration_credentials]] — зашифрованный Fernet платформенный AI-ключ, читается только на бэкенде; egress через VPN, никогда не экспонируется браузеру.
- [[system_settings]] — `ai_provider` (рантайм-реализация OCR) и промпт распознавания `menu`, редактируемые без редеплоя.
- `competitor_menu_snapshots` (будущая таблица со скоупом org) — один обход; `captured_on`, `image_ref`, `ocr_raw`.
- `competitor_menu_items` (будущая таблица со скоупом org) — распознанные позиции (`name`, `price`, `currency`, `volume`, `category`); документы-сущности создаются при активации.

## Зависимости / связи

- **Requirements:** [[provider-abstraction]] (шов OCR принимает новый тип документа без переписывания провайдера), [[fail-closed]] + [[vpn-egress]] (нет ключа / мёртвый VPN → явный отказ, без тихого egress).
- **Features:** переиспользует пайплайн OCR из [[LCOS-F8-ocr-recognition]] и инструменты качества/кропа [[LCOS-E6-ocr-quality]]; прикрепляет снимки к карточкам из [[LCOS-F54-competitor-directory]]; питает [[LCOS-F56-positioning]].
- **ADR:** [[ADR-009]] (шов провайдера, одна реализация, расширяемость по типам документов), [[ADR-006]] (fail-closed egress), [[ADR-012]] (пути живого провайдера только на бэкенде).

## Критерии приёмки

Критерии приёмки: TBD (Phase 2 — детализируются при активации).

## Sources

- `plan/PHASE_F7_COMPETITORS_MENU.md §1` — F7-B2 (OCR меню, новый тип документа, эндпоинты recognize/save), `§2` — F7-F1 (переиспользование фото → кроп → распознавание → таблица проверки).
- `07_PHASES.md Э7` (тип OCR `menu`, переиспользование `shared/ocr`, `prepare-step`, `image-cropper`, двухшаговый визард).
- `plan/00_IMPLEMENTATION_PLAN.md F7`.
