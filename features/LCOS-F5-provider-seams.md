---
id: LCOS-F5
type: feature
title: Provider seams + fail-closed egress
epic: "[[LCOS-E1-platform]]"
status: built
phase: "Phase 1"
roles: [superadmin, sqladmin-operator]
entities: ["[[system_settings]]", "[[integration_credentials]]", "[[invoices]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[vpn-egress]]", "[[erp-esupl-integration]]", "[[global-requirements]]"]
adrs: ["[[ADR-009]]", "[[ADR-006]]", "[[ADR-012]]"]
legacy_refs: [plan/00 G1 G5, LCOS_Conformance R7 R8, APP_OVERVIEW §3 §5]
sources: ["APP_OVERVIEW.md §3 §5", "01_ARCHITECTURE.md (Provider abstraction, Failure handling)", "LCOS_Conformance_Alignment_GlobalRequirements.md R7 R8", "mvp.be app/providers/base.py:16", "mvp.be app/providers/context.py", "mvp.be app/providers/http.py:42", "mvp.be app/providers/ai.py", "mvp.be app/services/invoice_service.py"]
updated: 2026-07-09
---
# LCOS-F5 · Provider seams + fail-closed egress
**Epic:** [[LCOS-E1-platform]] · **Status:** built · **Phase:** Phase 1

## Description

The abstraction and egress layer that isolates every external-service integration (OCR/LLM, ERP) behind `Protocol` interfaces + a decorator registry, and routes all outbound traffic fail-closed. The design rule: **`services` depend only on `providers/*/base.py`, never on concrete classes**; exactly **one real implementation per seam** today (OCR = `claude`, ERP = `esupl`), with seams present but alternatives not written unless triggered ([[ADR-009]]).

Selection is deliberately split across two config planes: **ERP provider is static** deploy config (`settings.erp_provider`, env `ERP_PROVIDER`), while **OCR/AI provider is a runtime DB setting** (`system_settings.ai_provider`, default `claude`) that a superadmin can flip with no redeploy. Shared cross-cutting infra (the two long-lived httpx clients, the VPN toggle, the session factory) is injected through the process-global **`ProviderContext`** so it never pollutes `Protocol` signatures and providers never import the `services` layer.

Egress is fail-closed on two axes. **AI calls** (OCR + matching) route through the gluetun VPN sidecar when `ai_vpn_enabled` (default on): `get_client(via_vpn=True)` raises `VpnUnavailableError` if there is no VPN client — **never a silent fallback to direct** — and `guard_vpn` converts transport failures into that same error. Missing AI key → `AiUnavailableError` (503). **ERP writes** go to Esupl and are gated off by default (`erp_write_enabled=False`): while off, `write_invoice` returns a synthetic `esupl-prepared-<number>` without contacting Esupl; the same code path becomes a real write when flipped on. No secret ever reaches the browser — provider live-paths run backend-side only ([[ADR-012]]).

## Capabilities

- `@runtime_checkable` `Protocol`s: `OcrProvider.extract_invoice(...)`, `ErpProvider.{list_suppliers,list_ingredients,write_invoice}`; structural typing — impls need not inherit.
- Decorator registry (`@register_ocr`, `@register_erp`) → `get_ocr_provider`/`get_erp_provider` do zero-arg `cls()`, raise a descriptive `ValueError` listing registered names on a miss; `import_providers()` triggers decorator registration in lifespan.
- Split selection: **ERP static** from env (`ERP_PROVIDER=esupl`); **OCR/AI runtime** from `system_settings.ai_provider` (default `claude`), resolved lazily so write paths don't pay for the OCR-provider DB read.
- `ProviderContext` (module-global `_CTX`) injects `egress` (direct + VPN httpx clients), `ai_vpn` toggle, and `session_scope`; set in lifespan, cleared on shutdown; tests swap in fakes.
- Single LLM transport entrypoint `ai_complete()` (`claude`/`gemini` dispatch) — deliberately **not** behind a Protocol; OCR providers are thin adapters over it.
- **Fail-closed egress:** `get_client(via_vpn=True)` with no VPN client → `VpnUnavailableError`; `guard_vpn` maps `ProxyError`/`ConnectError`/`TimeoutException` to it; missing AI key → `AiUnavailableError`; both map to 503 in the unified error envelope.
- **ERP write gate:** `erp_write_enabled` default False → `write_invoice` short-circuits to `esupl-prepared-<number>` with no egress; ON → real POST to `/teams/{id}/outgoing-invoices` with per-org token — same code path.

## Access by role

| Role | What they can do |
|---|---|
| [[superadmin]] | Flip the active OCR/AI provider (`ai_provider`), the VPN toggle (`ai_vpn_enabled`), and `erp_write_enabled` at runtime via config API / SQLAdmin — no redeploy. |
| [[sqladmin-operator]] | Same runtime settings via SQLAdmin ModelViews; sets the AI key / POS token that these seams consume. |
| [[admin]] / [[member]] | Do not select providers; they consume the resolved seams transparently through the invoice flow. |

## Involved entities

- [[system_settings]] — runtime selection/toggles: `ai_provider`, `ai_vpn_enabled`, `erp_write_enabled`, model names.
- [[integration_credentials]] — the AI key (`scope=platform`) and per-org Esupl token consumed at call time (no cache).
- [[invoices]] — the ERP-write gate acts on submit; `esupl_payload`/status reflect the gated outcome (detail in [[LCOS-F10-invoice-status-machine]]).

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (Protocol + registry, one impl per seam, `ProviderContext`), [[fail-closed]] (VPN/key/write-gate behaviors), [[vpn-egress]] (gluetun routing, no silent direct fallback), [[erp-esupl-integration]] (Esupl read-only + gated write), [[global-requirements]] (R7/R8).
- **Features:** provider selection/keys come from [[LCOS-F4-config-secrets]]; the OCR seam powers [[LCOS-F8-ocr-recognition]]; the ERP seam + write gate power [[LCOS-F10-invoice-status-machine]] and [[LCOS-F11-esupl-read]]; FE mirror of the seam pattern is [[LCOS-F7-frontend-platform]].
- **ADR:** [[ADR-009]] (one implementation per seam), [[ADR-006]] (fail-closed egress), [[ADR-012]] (provider live-paths backend-only, no browser secrets).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `services` reference only `providers/*/base.py` Protocols; the dependency direction `api → services → providers/repositories` holds (no service imports a concrete provider class).
- [ ] AC-BE-2. `get_ocr_provider`/`get_erp_provider` resolve via the decorator registry and raise a descriptive `ValueError` (listing registered names) on an unknown name.
- [ ] AC-BE-3. ERP provider is selected statically from `ERP_PROVIDER`; OCR/AI provider from `system_settings.ai_provider` (default `claude`), resolved lazily (write paths do not read it).
- [ ] AC-BE-4. Cross-cutting infra is injected via `ProviderContext`; provider `Protocol` signatures carry no egress/VPN/session args; `get_provider_context()` raises if unset.
- [ ] AC-BE-5. **Fail-closed VPN:** with `ai_vpn_enabled=ON` and no/dead VPN client, the AI call raises `VpnUnavailableError` (503) — no silent direct egress (merge-gated non-negotiable).
- [ ] AC-BE-6. Missing AI key → `AiUnavailableError` (503) with no env fallback; missing Esupl token → unauthenticated call → Esupl 401.
- [ ] AC-BE-7. **ERP write gate:** `erp_write_enabled=False` → `write_invoice` returns `esupl-prepared-<number>` without contacting Esupl; ON → real POST via the same code path (merge-gated).
- [ ] AC-BE-8. New implementations on a seam are not written without an explicit trigger (R7.5); exactly one active impl per seam.

## Open questions / gates

- **D-a (decide):** `gemini` is registered as a second OCR/AI impl and the LLM transport is module functions (not a Protocol). Recommendation = **claude-only** (drop gemini + the dual-role resolver) to honor "one impl per seam"; alternative = put LLM behind a Protocol+registry and test the "OCR name ≡ `ai_provider` enum" invariant. Tracked in [[LCOS-E5-stabilization]].
- **V-c:** confirm no OCR name can be registered that isn't a valid `ai_provider` enum value (resolver double-duty).
- **D-f:** `esupl.list_suppliers`/`list_ingredients` call `_auth_headers()` with no token (off critical path) — close/guard as unreachable in Phase 1 so no unauthenticated egress path survives.
- **VER-021 (open, owner-run):** the durable-id model behind ERP writes assumes `pos_ingredient_id` survives Esupl edit — not yet confirmed (needs write access); merge stays gated. See [[LCOS-E3-sku-identity]].

## Sources

- `APP_OVERVIEW.md §3` (layers, provider selection), `§5` (fail-closed, backend-only providers).
- `01_ARCHITECTURE.md` — "Backend provider abstraction", "Failure handling (fail-closed VPN, error mapping)".
- `LCOS_Conformance_Alignment_GlobalRequirements.md` R7/R8 + Part 2 D-a/D-f.
- `mvp.be/app/providers/base.py:16` (`register_ocr`), `:24` (`register_erp`), `:32`/`:42` (`get_*_provider`), `:52` (`import_providers`).
- `mvp.be/app/providers/context.py` (`ProviderContext`, `_CTX`, `get_provider_context`).
- `mvp.be/app/providers/http.py:42` (`Egress.get_client`), `:26` (`VpnUnavailableError`), `guard_vpn`.
- `mvp.be/app/providers/ai.py` (`ai_complete`, `claude_complete`, `_resolve_via_vpn`), `mvp.be/app/services/invoice_service.py` (ERP write gate).
