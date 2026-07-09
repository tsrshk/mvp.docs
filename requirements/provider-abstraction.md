---
id: REQ-PROVIDER-ABSTRACTION
type: requirement
title: Provider seams (Protocol + registry + ProviderContext)
status: built
scope: cross-cutting
roles: [superadmin]
entities: []
adrs: ["[[ADR-009]]"]
requirements: ["[[vpn-egress]]", "[[erp-esupl-integration]]", "[[fail-closed]]", "[[global-requirements]]"]
legacy_refs: [Conformance R7, DEC-01, CLAUDE.md "one impl per provider"]
sources: [01_ARCHITECTURE.md "Backend provider abstraction", APP_OVERVIEW.md §3, LCOS_Conformance R7]
updated: 2026-07-09
---

# REQ-PROVIDER-ABSTRACTION · Provider seams

**Type:** cross-cutting SSOT · **Status:** built. How `services` are insulated from concrete external integrations.

## Normative statement

- **N1. Dependency direction:** `api → services → providers/repositories`. `services` depend **only** on the interfaces in `providers/*/base.py` (Protocol), **never** on concrete classes (`claude`/`esupl`).
- **N2. Interfaces are `typing.Protocol` (`@runtime_checkable`), not ABC** — structural typing, implementations need no inheritance.
  - `OcrProvider`: `name`, `requires_vpn`, `extract_invoice(image_bytes, mime_type) -> InvoiceDraft`.
  - `ErpProvider`: `name`, `requires_vpn`, `list_suppliers`, `list_ingredients`, `write_invoice(payload, api_token=None) -> str`.
  - **An LLM `Protocol` is deliberately absent** — the LLM transport = module-level async functions in `providers/ai.py` (`ai_complete`, `claude_complete`, `gemini_complete`); OCR providers are thin adapters on top of them.
- **N3. Registry + decorators:** `_OCR_REGISTRY`/`_ERP_REGISTRY` (name→class); `@register_ocr("claude")`, `@register_erp("esupl")`. `get_*_provider(name)` does `cls()` (stateless providers — they take infra from `ProviderContext` at call time) and throws a descriptive `ValueError` on a miss. `import_providers()` explicitly imports the modules (decorators fire on import), called once in `lifespan`.
- **N4. The choice of implementation — two different config planes (easy to confuse):**
  - **ERP = static deploy config from env:** `get_erp()` reads `settings.erp_provider` (`ERP_PROVIDER`, default `esupl`).
  - **OCR/AI = runtime config from the DB, not env:** `get_ocr()` calls `resolve_ai_provider()` (reads `system_settings.ai_provider`, default `claude`). The superadmin changes the active OCR/LLM in SQLAdmin without a redeploy.
- **N5. One active implementation per seam** (`ADR-009`): today OCR=`claude`, ERP=`esupl`. Alternatives are **not written** without a real trigger (volume growth, geo/cost risk).
- **N6. `ProviderContext` (module-global `_CTX`)** carries cross-infra that does not dirty the Protocol signatures: `egress` (two httpx clients), `ai_vpn` (`AiVpnToggle`), `session_scope` (`SessionFactory`). Set in `lifespan`, cleared on shutdown; `get_provider_context()` throws `RuntimeError` if not set. Tests substitute fakes.

## Rationale

Protocol+registry allow substitution/testing without inheritance and without leaking concrete classes into the use cases. `ProviderContext` solves a concrete problem: `claude_complete` must compute `via_vpn` and take the egress client without dragging that into the signature of `OcrProvider.extract_invoice` and without importing the `services` layer (a back-edge dependency). The "one implementation per seam" rule quells dead "for-the-future" code.

## Failure modes

- **A mismatch between the OCR name and the `ai_provider` enum:** `resolve_ai_provider()` plays a dual role (one value chooses both the LLM in `ai_complete` and the OCR class in `get_ocr`). If you register an OCR name not in `ai_provider` — a hidden bug (V-c). Debt DEC-01: recommendation claude-only (remove the gemini branch + drop the dual role) OR factor the LLM out behind a Protocol symmetrically to OCR/ERP with the invariant "OCR name ≡ ai_provider enum" under test.
- **`get_provider_context()` before `lifespan`** → `RuntimeError` (fail-closed, not a silent None).
- **An unknown provider name** → `ValueError` with the list of registered ones.
- **Debt (gemini):** a second OCR/AI vendor `gemini` is registered — it violates "one implementation"; requires resolution (DEC-01).

## Relations

- ADR: [[ADR-009]] (one implementation per seam), [[ADR-004]] (static ERP choice).
- Requirements: [[vpn-egress]] (egress/VPN via the context), [[erp-esupl-integration]] (ErpProvider), [[fail-closed]], [[global-requirements]] R7.

## Referenced by

`LCOS-F5` (Provider seams + fail-closed egress), `LCOS-F8` (OCR), `LCOS-F10`/`F11` (ERP write/read), `LCOS-F69` (second ERP connector iiko — a future seam trigger).

## Sources

- 01_ARCHITECTURE.md → "Backend provider abstraction", "Two DI mechanisms", "Registry + selection".
- APP_OVERVIEW.md §3; LCOS_Conformance R7, D-a, V-c.
- Code: `app/providers/{base,context,ai,ocr,erp}.py`, `app/api/deps.py`.
