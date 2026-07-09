---
id: REQ-FAIL-CLOSED
type: requirement
title: Fail-closed — сводный каталог отказов
status: built
scope: cross-cutting
roles: [member, admin, superadmin]
entities: ["[[integration_credentials]]", "[[system_settings]]"]
adrs: ["[[ADR-006]]"]
requirements: ["[[vpn-egress]]", "[[secret-encryption]]", "[[erp-esupl-integration]]", "[[config-secrets]]", "[[global-requirements]]"]
legacy_refs: [Conformance R8, CLAUDE.md non-negotiables]
sources: [01_ARCHITECTURE.md "What is fail-closed", APP_OVERVIEW.md §5, LCOS_Conformance R8]
updated: 2026-07-09
---

# REQ-FAIL-CLOSED · Fail-closed везде

**Type:** cross-cutting SSOT · **Status:** built (одна оговорка — A1). Если запомнить об архитектуре одну вещь — вот она: **отсутствие/недоступность зависимости → жёсткая ошибка, а не тихая деградация.**

## Нормативное положение (сводный каталог)

- **N1. VPN для AI:** `ai_vpn_enabled` по умолчанию **True**; мёртвый/медленный туннель → `VpnUnavailableError` (503), **никогда** тихий прямой egress. `get_client(via_vpn=True)` без vpn-клиента → ошибка, не fallback. Детали — [[vpn-egress]].
- **N2. Нет AI-ключа** → `AiUnavailableError` (503) — missing-config трактуется как недоступность. Без чтения env.
- **N3. Нет POS-токена** → провайдер идёт без аутентификации → **Esupl 401**. Без env fallback. Детали — [[erp-esupl-integration]].
- **N4. `erp_write_enabled` по умолчанию False:** при OFF `write_invoice` возвращает синтетический `esupl-prepared-<number>` **без egress**; тот же путь кода при ON = реальная запись. См. [[invoice-status-machine]].
- **N5. Шифртекст при пустом keyring** → `RuntimeError` (не тихий мусор). `encrypt()` без keyring **обязан** упасть (`RuntimeError`) — целевое состояние после A1. См. [[secret-encryption]] R2.2/R2.3.
- **N6. Настройки/секреты не падают в env:** DB→registry default (настройки) или →None (секреты). См. [[config-secrets]].
- **N7. Startup guard** (`main.py::_ensure_strong_secrets`): отказывается загружаться при пустых/дефолтных `SESSION_SECRET`/`JWT_SECRET` (`change_me`, `secret`, …); `SECRETS_ENC_KEY` обязателен вне `APP_ENV=local` (цель A1 — обязателен всегда); `validate_keyring()` при старте.
- **N8. SKU commit-resolve — fail-closed:** неразрешённая/неподтверждённая/недоступная identity → **block + review** (`rejected`), никогда тихий пропуск. См. [[sku-identity-resolver]].
- **N9. Единый конверт ошибки** `{"error":{code,message,details?}}`; catch-all вручную возвращает CORS-заголовки (иначе браузер видит "Failed to fetch"). `VpnUnavailableError→503`, `AiUnavailableError→503`, `HTTPException→http_error`, `RequestValidationError→422`, `Exception→500`.

## Обоснование

Тихая деградация опаснее явного отказа: «fallback-путь» маскирует сбой конфигурации/сети и ведёт к незашифрованным секретам, неаутентифицированному egress или записи в POS без ключа. Предсказуемость важнее доступности — локальная одномагазинная Phase 1 предпочитает 503 тихому повреждению данных. Fail-closed — набор non-negotiable инвариантов, покрытых merge-blocking тестами (V-a).

## Режимы отказа (что именно ловится)

| Условие | Поведение | Не допускается |
|---|---|---|
| VPN недоступен при `ai_vpn_enabled` | `VpnUnavailableError` 503 | тихий прямой egress |
| нет AI-ключа | `AiUnavailableError` 503 | чтение ключа из env |
| нет POS-токена | Esupl 401 | синтетический успех записи |
| `erp_write_enabled=OFF` | `esupl-prepared-<number>`, без egress | тихая реальная запись |
| пустой keyring + шифртекст | `RuntimeError` | тихий мусор/plaintext |
| слабый JWT/session secret | отказ на старте | загрузка с дефолтом |
| SKU не подтверждён/POS недоступен | block + review | тихий пропуск строки |

**Оговорка (BACKLOG A1):** `encrypt()` сейчас пишет plaintext при пустом keyring — единственное живое нарушение fail-closed; подлежит замене на `RuntimeError`.

## Связи

- ADR: [[ADR-006]] (fail-closed everywhere).
- Требования: [[vpn-egress]], [[secret-encryption]], [[erp-esupl-integration]], [[sku-identity-resolver]], [[invoice-status-machine]], [[config-secrets]], [[global-requirements]] R8.
- Сущности: [[integration_credentials]], [[system_settings]].

## На это ссылаются

Практически каждая feature Phase 1: `LCOS-F5` (egress), `LCOS-F8`/`F10` (OCR/ERP-write), `LCOS-F13`/`F14` (commit-resolve), `LCOS-F4` (шифрование), `LCOS-F23` (fail-closed encryption ALIGN-01), `LCOS-F24` (merge-gate tests).

## Источники

- 01_ARCHITECTURE.md → "What is fail-closed (backend)", "Failure handling", "Unified error envelope".
- APP_OVERVIEW.md §5; LCOS_Conformance R8, V-a, A1.
- Код: `app/main.py`, `app/core/errors.py`, `app/providers/http.py`.
