---
id: LCOS-E6
type: epic
title: Качество захвата OCR
status: planned
phase: "Phase 1"
features: ["[[LCOS-F29-multipage-recognize]]", "[[LCOS-F30-recognition-context]]", "[[LCOS-F31-auto-crop]]", "[[LCOS-F32-camera-capture]]", "[[LCOS-F33-confidence-gate]]"]
legacy_refs: [plan S2]
sources: [07_PHASES.md S2, 08_PHASE1_SPEC.md, APP_OVERVIEW.md §6]
updated: 2026-07-09
---

# LCOS-E6 · Качество захвата OCR

**Статус:** 📝 planned · **Фаза:** Phase 1

## Описание

Повышение надёжности первого шага конвейера — захвата и распознавания фото накладной. Клин ([[LCOS-E2-invoice-intake]]) распознаёт одностраничные фото; данный эпик завершает работу над качеством: устойчивое распознавание многостраничных накладных, передача контекста распознавания в промпт (список известных SKU/поставщиков как хинт модели), авто-кроп страницы (OpenCV.js на клиенте), прямой захват с камеры (mobile-first PWA) и confidence-гейт после распознавания, не позволяющий мусорным строкам молча просочиться в черновик.

Часть проблемы уже закрыта промежуточным фиксом молчаливой потери многостраничных ([[LCOS-F26-multipage-fix]] в [[LCOS-E5-stabilization]]); данный эпик — полное решение.

## Цель / ценность

Меньше ручных правок после OCR → ближе к «AI делает работу, человек только подтверждает». Плохой захват — главный источник трения на шаге 1; его устранение напрямую влияет на прохождение Pilot-Gate.

## Фичи

| ID | Название | Статус | Ссылка |
|---|---|---|---|
| LCOS-F29 | Распознавание многостраничных | 📝 planned | [[LCOS-F29-multipage-recognize]] |
| LCOS-F30 | Контекст распознавания в промпте | 📝 planned | [[LCOS-F30-recognition-context]] |
| LCOS-F31 | Авто-кроп (OpenCV.js) | 📝 planned | [[LCOS-F31-auto-crop]] |
| LCOS-F32 | Захват с камеры | 📝 planned | [[LCOS-F32-camera-capture]] |
| LCOS-F33 | Confidence-гейт после распознавания | 📝 planned | [[LCOS-F33-confidence-gate]] |

## Ключевые сущности / требования

- Сущности: [[invoices]], [[invoice_lines]], [[ingredients]], [[suppliers]], [[system_settings]] (промпт OCR).
- Требования: [[provider-abstraction]], [[vpn-egress]], [[invoice-status-machine]].
- Роли: [[member]] (захватывает и распознаёт).

## Гейты

- **Confidence-гейт (kill-критерии):** строки ниже порога уверенности не проходят молча — они либо помечаются на review, либо блокируют черновик; молчаливая потеря данных недопустима (принцип из [[LCOS-E5-stabilization]]).
- **VPN-egress:** OCR-провайдер вызывается только через VPN-sidecar при `ai_vpn_enabled`; VPN недоступен → fail-closed-отказ ([[ADR-006]], [[vpn-egress]]).
- **Промпт OCR** хранится в `system_settings` (миграция `1e12…`), редактируется без деплоя.

## legacy_refs

plan S2 (качество OCR).

## Источники

- 07_PHASES.md S2, 08_PHASE1_SPEC.md (раздел OCR)
- APP_OVERVIEW.md §6 (recognize), §3 (OCR-провайдеры)
- ADR: [[ADR-006]], [[ADR-009]], [[ADR-012]]
