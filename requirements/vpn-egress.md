---
id: REQ-VPN-EGRESS
type: requirement
title: VPN egress для AI-вызовов (gluetun sidecar, fail-closed)
status: built
scope: cross-cutting
roles: [superadmin]
entities: ["[[system_settings]]"]
adrs: ["[[ADR-006]]"]
requirements: ["[[fail-closed]]", "[[provider-abstraction]]", "[[global-requirements]]"]
legacy_refs: [Conformance R8.1, R7.4]
sources: [01_ARCHITECTURE.md "Failure handling (fail-closed VPN)", APP_OVERVIEW.md §5, LCOS_Conformance R8.1]
ssot_for: [vpn-egress, ai-egress-transport, vpn-toggle]
updated: 2026-07-20
---

# REQ-VPN-EGRESS · VPN egress для AI

**Type:** cross-cutting SSOT · **Status:** built. Транспорт для исходящих AI-вызовов через VPN-sidecar. Общий каталог fail-closed — [[fail-closed]].

## Нормативное положение

- **N1. Два долгоживущих httpx-клиента** держит `Egress` (собирается один раз в `lifespan` через `build_egress`): `direct_client` и `vpn_client` (через gluetun `http://gluetun:8888`, или `None`, если не сконфигурирован). Egress инжектируется через `ProviderContext` из [[provider-abstraction]], не протекает в сигнатуры Protocol.
- **N2. `get_client(via_vpn=True)` без vpn-клиента → `VpnUnavailableError`** — **никакого тихого fallback на direct** (non-negotiable).
- **N3. `guard_vpn(via_vpn)`** — async context manager: при `via_vpn=True` конвертирует транспортные сбои (`httpx.ProxyError`, `ConnectError`, `TimeoutException`) в `VpnUnavailableError`; при `via_vpn=False` — no-op.
- **N4. `via_vpn` для AI — runtime-toggle**, не статический `requires_vpn` (оба OCR-провайдера ставят `requires_vpn=False`, т.к. AI-роутинг динамический). `ai.py::_resolve_via_vpn` читает `ai_vpn_enabled` из `AiVpnToggle` (кэш, default fail-closed **True**).
- **N5. Путь Claude:** `claude_complete` передаёт выбранный клиент в `AsyncAnthropic(http_client=client, max_retries=0)` и внутри `guard_vpn` ловит `anthropic.APIConnectionError`: если `via_vpn=True` → re-raise как `VpnUnavailableError`; иначе re-raise оригинал. Путь Gemini (raw REST) оборачивает всё в `guard_vpn`, re-raise `VpnUnavailableError`, всё остальное → `AiUnavailableError`.
- **N6. ERP egress по умолчанию НЕ через VPN:** `EsuplErpProvider.requires_vpn=False` (Esupl доступен напрямую); переключение флага в True направляет его через gluetun без прочих изменений.
- **N7. `VpnUnavailableError → 503 vpn_unavailable`** в едином конверте ошибки.

## Обоснование

AI-вызовы (OCR + matching) пересекают границу доверия к внешнему LLM; egress через WireGuard-прокси даёт контроль над гео/IP. Default `ai_vpn_enabled=True` + запрет тихого fallback гарантируют, что при мёртвом туннеле система **не** идёт напрямую в обход политики — она честно отказывает (503), а не деградирует тихо. Toggle runtime (в БД), поэтому VPN можно включать/выключать без redeploy.

## Режимы отказа

- **Туннель мёртв/медленный при `ai_vpn_enabled=True`** → `VpnUnavailableError` (503). Пользователь видит явный провал распознавания, не тихий прямой вызов.
- **`vpn_client=None` (gluetun не сконфигурирован) при `via_vpn=True`** → `VpnUnavailableError` прямо на `get_client`.
- **`ai_vpn_enabled=False`** (намеренно выключен superadmin) → прямой egress разрешён; риск явно принят оператором.
- Риск ложного 503 при флапающем туннеле принят: лучше отказ, чем обход VPN.

## Связи

- ADR: [[ADR-006]] (fail-closed).
- Требования: [[fail-closed]] R8.1, [[provider-abstraction]] R7.4 (ProviderContext/egress), [[global-requirements]] R8.1.
- Сущности: [[system_settings]] (`ai_vpn_enabled`).

## На это ссылаются

`LCOS-F5` (Provider seams + fail-closed egress), `LCOS-F8` (OCR recognition), `LCOS-F9` (Line↔catalog matching) — оба AI-пути идут через этот egress.

## Источники

- 01_ARCHITECTURE.md → "Failure handling (fail-closed VPN, error mapping)", component diagram (gluetun).
- APP_OVERVIEW.md §5; LCOS_Conformance R8.1, V-a.
- Код: `app/providers/{http,ai,vpn_toggle,context}.py`.
