---
id: REQ-FAIL-CLOSED
type: requirement
title: Fail-closed — consolidated failure catalog
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

# REQ-FAIL-CLOSED · Fail-closed everywhere

**Type:** cross-cutting SSOT · **Status:** built (one caveat — A1). If you remember one thing about the architecture, this is it: **absence/unavailability of a dependency → a hard error, not silent degradation.**

## Normative statement (consolidated catalog)

- **N1. VPN for AI:** `ai_vpn_enabled` defaults to **True**; a dead/slow tunnel → `VpnUnavailableError` (503), **never** silent direct egress. `get_client(via_vpn=True)` without a vpn client → an error, not a fallback. Details — [[vpn-egress]].
- **N2. No AI key** → `AiUnavailableError` (503) — missing-config is treated as unavailable. Without reading env.
- **N3. No POS token** → the provider goes out unauthenticated → **Esupl 401**. With no env fallback. Details — [[erp-esupl-integration]].
- **N4. `erp_write_enabled` defaults to False:** when OFF, `write_invoice` returns a synthetic `esupl-prepared-<number>` **without egress**; the same code path when ON = a real write. See [[invoice-status-machine]].
- **N5. Ciphertext with an empty keyring** → `RuntimeError` (not silent garbage). `encrypt()` without a keyring **must** fail (`RuntimeError`) — the target after A1. See [[secret-encryption]] R2.2/R2.3.
- **N6. Settings/secrets do not fall back to env:** DB→registry default (settings) or →None (secrets). See [[config-secrets]].
- **N7. Startup guard** (`main.py::_ensure_strong_secrets`): refuses to load with empty/default `SESSION_SECRET`/`JWT_SECRET` (`change_me`, `secret`, …); `SECRETS_ENC_KEY` is required outside `APP_ENV=local` (A1 target — required always); `validate_keyring()` at startup.
- **N8. SKU commit-resolve is fail-closed:** an unresolved/unconfirmed/unavailable identity → **block + review** (`rejected`), never a silent skip. See [[sku-identity-resolver]].
- **N9. Unified error envelope** `{"error":{code,message,details?}}`; the catch-all manually returns CORS headers (otherwise the browser sees "Failed to fetch"). `VpnUnavailableError→503`, `AiUnavailableError→503`, `HTTPException→http_error`, `RequestValidationError→422`, `Exception→500`.

## Rationale

Silent degradation is more dangerous than an explicit failure: a "fallback path" masks a config/network failure and leads to unencrypted secrets, unauthenticated egress, or a POS write without a key. Predictability matters more than availability — the local single-shop Phase 1 prefers a 503 to silent data corruption. Fail-closed is a set of non-negotiable invariants covered by merge-blocking tests (V-a).

## Failure modes (what exactly is caught)

| Condition | Behavior | Not allowed |
|---|---|---|
| VPN down with `ai_vpn_enabled` | `VpnUnavailableError` 503 | silent direct egress |
| no AI key | `AiUnavailableError` 503 | reading the key from env |
| no POS token | Esupl 401 | a synthetic write success |
| `erp_write_enabled=OFF` | `esupl-prepared-<number>`, no egress | a silent real write |
| empty keyring + ciphertext | `RuntimeError` | silent garbage/plaintext |
| weak JWT/session secret | startup refusal | loading with a default |
| SKU not confirmed/POS unavailable | block + review | a silent line skip |

**Caveat (BACKLOG A1):** `encrypt()` currently writes plaintext with an empty keyring — the single living fail-closed violation; to be replaced with a `RuntimeError`.

## Relations

- ADR: [[ADR-006]] (fail-closed everywhere).
- Requirements: [[vpn-egress]], [[secret-encryption]], [[erp-esupl-integration]], [[sku-identity-resolver]], [[invoice-status-machine]], [[config-secrets]], [[global-requirements]] R8.
- Entities: [[integration_credentials]], [[system_settings]].

## Referenced by

Practically every Phase 1 feature: `LCOS-F5` (egress), `LCOS-F8`/`F10` (OCR/ERP-write), `LCOS-F13`/`F14` (commit-resolve), `LCOS-F4` (encryption), `LCOS-F23` (fail-closed encryption ALIGN-01), `LCOS-F24` (merge-gate tests).

## Sources

- 01_ARCHITECTURE.md → "What is fail-closed (backend)", "Failure handling", "Unified error envelope".
- APP_OVERVIEW.md §5; LCOS_Conformance R8, V-a, A1.
- Code: `app/main.py`, `app/core/errors.py`, `app/providers/http.py`.
