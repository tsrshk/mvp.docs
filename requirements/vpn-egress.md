---
id: REQ-VPN-EGRESS
type: requirement
title: VPN egress for AI calls (gluetun sidecar, fail-closed)
status: built
scope: cross-cutting
roles: [superadmin]
entities: ["[[system_settings]]"]
adrs: ["[[ADR-006]]"]
requirements: ["[[fail-closed]]", "[[provider-abstraction]]", "[[global-requirements]]"]
legacy_refs: [Conformance R8.1, R7.4]
sources: [01_ARCHITECTURE.md "Failure handling (fail-closed VPN)", APP_OVERVIEW.md §5, LCOS_Conformance R8.1]
updated: 2026-07-09
---

# REQ-VPN-EGRESS · VPN egress for AI

**Type:** cross-cutting SSOT · **Status:** built. The transport for outgoing AI calls through a VPN sidecar. The general fail-closed catalog — [[fail-closed]].

## Normative statement

- **N1. Two long-lived httpx clients** are held by `Egress` (assembled once in `lifespan` via `build_egress`): `direct_client` and `vpn_client` (through gluetun `http://gluetun:8888`, or `None` if not configured). Egress is injected via the [[provider-abstraction]] `ProviderContext`, it does not leak into Protocol signatures.
- **N2. `get_client(via_vpn=True)` without a vpn client → `VpnUnavailableError`** — **no silent fallback to direct** (non-negotiable).
- **N3. `guard_vpn(via_vpn)`** — an async context manager: with `via_vpn=True` it converts transport failures (`httpx.ProxyError`, `ConnectError`, `TimeoutException`) into `VpnUnavailableError`; with `via_vpn=False` — a no-op.
- **N4. `via_vpn` for AI is a runtime toggle**, not the static `requires_vpn` (both OCR providers set `requires_vpn=False`, since AI routing is dynamic). `ai.py::_resolve_via_vpn` reads `ai_vpn_enabled` from `AiVpnToggle` (cache, default fail-closed **True**).
- **N5. Claude path:** `claude_complete` passes the chosen client into `AsyncAnthropic(http_client=client, max_retries=0)` and inside `guard_vpn` catches `anthropic.APIConnectionError`: if `via_vpn=True` → re-raise as `VpnUnavailableError`; otherwise re-raise the original. The Gemini path (raw REST) wraps everything in `guard_vpn`, re-raises `VpnUnavailableError`, everything else → `AiUnavailableError`.
- **N6. ERP egress is NOT through the VPN by default:** `EsuplErpProvider.requires_vpn=False` (Esupl is reachable directly); flipping the flag to True routes it through gluetun with no other changes.
- **N7. `VpnUnavailableError → 503 vpn_unavailable`** in the unified error envelope.

## Rationale

AI calls (OCR + matching) cross a trust boundary to an external LLM; egress through a WireGuard proxy gives control over geo/IP. The default `ai_vpn_enabled=True` + the ban on a silent fallback guarantee that when the tunnel is dead the system does **not** go direct bypassing the policy — it honestly refuses (503) rather than degrading silently. The toggle is runtime (in the DB), so VPN can be turned on/off without a redeploy.

## Failure modes

- **The tunnel is dead/slow with `ai_vpn_enabled=True`** → `VpnUnavailableError` (503). The user sees an explicit recognition failure, not a silent direct call.
- **`vpn_client=None` (gluetun not configured) with `via_vpn=True`** → `VpnUnavailableError` right at `get_client`.
- **`ai_vpn_enabled=False`** (deliberately turned off by the superadmin) → direct egress is allowed; the risk is explicitly accepted by the operator.
- The risk of a false 503 with a flapping tunnel is accepted: better a refusal than bypassing the VPN.

## Relations

- ADR: [[ADR-006]] (fail-closed).
- Requirements: [[fail-closed]] R8.1, [[provider-abstraction]] R7.4 (ProviderContext/egress), [[global-requirements]] R8.1.
- Entities: [[system_settings]] (`ai_vpn_enabled`).

## Referenced by

`LCOS-F5` (Provider seams + fail-closed egress), `LCOS-F8` (OCR recognition), `LCOS-F9` (Line↔catalog matching) — both AI paths go through this egress.

## Sources

- 01_ARCHITECTURE.md → "Failure handling (fail-closed VPN, error mapping)", component diagram (gluetun).
- APP_OVERVIEW.md §5; LCOS_Conformance R8.1, V-a.
- Code: `app/providers/{http,ai,vpn_toggle,context}.py`.
