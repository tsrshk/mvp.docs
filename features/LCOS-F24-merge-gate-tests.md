---
id: LCOS-F24
type: feature
title: Merge-blocking non-negotiable tests (VER-01)
epic: "[[LCOS-E5-stabilization]]"
status: partial
phase: "Phase 1"
roles: [superadmin, admin, member]
entities: ["[[integration_credentials]]", "[[sku_mapping]]", "[[invoices]]"]
requirements: ["[[fail-closed]]", "[[global-requirements]]", "[[multitenancy]]", "[[auth]]", "[[secret-encryption]]"]
adrs: ["[[ADR-006]]"]
legacy_refs: [plan S1-B7 S1-B8, 08 F1.5, backlog VER-01 VER-02, Conformance V-a/V-b]
sources: ["plan/PHASE_S1_STABILIZATION.md §S1-B7 §S1-B8", "08_PHASE1_SPEC.md F1.5", "LCOS_Conformance_Alignment_GlobalRequirements.md V-a/V-b Part 4", "APP_OVERVIEW.md §12", "mvp.be pyproject.toml:65", "TZ__STABILIZATION_2026-07-09__ALIGNED.md S8"]
updated: 2026-07-09
---
# LCOS-F24 · Merge-blocking non-negotiable tests (VER-01)

**Epic:** [[LCOS-E5-stabilization]] · **Status:** partial · **Phase:** Phase 1

## Description

The non-negotiable invariants of the platform — fail-closed VPN egress, correct egress-client selection, the `ERP_WRITE_ENABLED` gate, tenant isolation, refresh reuse-detection, and secret encryption — are worthless as guarantees unless a test fails when they break. This feature makes those invariants merge-blocking: each is covered by a test on real Postgres+pgvector (egress mocked with `respx`), and the tests are grouped behind a single marker so a broken invariant cannot merge.

Two marker tracks exist. The SKU/commit track (`merge_gate`, 17 tests: durable-id + DEC-0013 commit-gate) is **built and green** and was extended during stabilization (S8) with the previously-missing DB/HTTP/component tests (criteria API 422 + JSONB round-trip, `get_esupl_access` None-branches, `sync_catalog_from_erp`, per-org bootstrap resilience, `CriteriaFields`). The platform track (VER-01 / `non_negotiable`) is **partial**: the underlying test files exist (`test_egress.py`, `test_provider_egress.py`, `test_vpn_toggle.py`, `test_tenant_isolation.py`, `test_tenant.py`, `test_auth.py`, `test_secrets.py`, `test_secret_isolation.py`), but the unifying `non_negotiable` pytest marker from plan S1-B7/08 F1.5 is **not yet registered** in `pyproject.toml` (only `merge_gate` is), so there is no single `pytest -m non_negotiable` entry point and no per-scenario merge mapping. Completing this feature = confirm coverage, add the missing cases, register the marker, and prove each scenario fails on deliberate breakage (spot-check VPN + ERP gate).

## Capabilities

- One command per gate track: `pytest -m merge_gate` (SKU/commit, done) and `pytest -m non_negotiable` (platform, to add).
- Fail-closed VPN test: `ai_vpn_enabled=True` + dead tunnel → `VpnUnavailableError` (503 `vpn_unavailable`), with an assertion that **no** request went through the direct client.
- Egress-client selection test: `via_vpn=True` → vpn_client; `False` → direct; missing vpn_client while `via_vpn=True` → error, not fallback.
- ERP write-gate test: OFF → synthetic `esupl-prepared-<number>`, zero HTTP calls (respx); ON → real POST with the org Bearer token.
- Tenant-isolation test: a repository cannot be instantiated without `organization_id`; org A data is invisible in org B scope (suppliers/invoices/ingredients).
- Refresh reuse-detection test: replaying a rotated refresh revokes the whole `family_id` and returns 401.
- Secret tests: plaintext in → `enc:v2:*` in DB; rotation visible on next call (no cache); no AI key → `AiUnavailableError` without reading env.
- Password test (VER-02): `users.password_hash` is argon2 (`app/auth/password.py`); bcrypt is only the SQLAdmin operator (`core/security.py`); the two paths are not crossed.

## Access by role

| Role | What they can do |
|---|---|
| [[superadmin]] | Beneficiary: the gate protects cross-tenant isolation and secret handling that superadmin config touches. |
| [[admin]] | Beneficiary: tenant isolation and the write-gate protect their data and ERP writes. |
| [[member]] | Beneficiary: fail-closed egress protects their OCR/AI calls from silent leakage. |
| [[sqladmin-operator]] | Not a runtime actor; the encryption/auth-plane separation tests cover the operator plane. |

This is a QA/CI feature; there is no end-user surface.

## Involved entities

- [[integration_credentials]] — subject of the secret-encryption and no-cache-rotation tests.
- [[sku_mapping]] — subject of the `merge_gate` durable-id / DEC-0013 commit-gate track.
- [[invoices]] — subject of the `ERP_WRITE_ENABLED` gate test (synthetic id at OFF, real POST at ON).

## Dependencies / links

- **Requirements:** [[fail-closed]] (`R8` catalog is the checklist these tests enforce), [[global-requirements]] (R1–R9 conformance, Part 4 acceptance scenarios), [[multitenancy]] (`R5.3`/`R5.4` isolation), [[auth]] (`R3.3` refresh reuse-detection, `R3.8` argon2), [[secret-encryption]] (`R2`).
- **Features:** the fail-closed encrypt case is co-owned with [[LCOS-F23-failclosed-encryption]]; the SKU/commit track is the gate for [[LCOS-F22-sku-stabilization]]; VPN/egress cases guard [[LCOS-F5-provider-seams]] and [[LCOS-F8-ocr-recognition]]; the write-gate guards [[LCOS-F10-invoice-status-machine]].
- **Decisions:** [[ADR-006]] (fail-closed egress).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. Fail-closed VPN: `ai_vpn_enabled=True` + dead tunnel → `VpnUnavailableError` (503); assert no direct-client request occurred.
- [ ] AC-BE-2. Egress-client selection: `via_vpn=True` → vpn_client, `False` → direct; missing vpn_client at `via_vpn=True` → error (not fallback).
- [ ] AC-BE-3. `ERP_WRITE_ENABLED` OFF → synthetic `esupl-prepared-<number>`, zero HTTP calls (respx); ON → real POST with the org Bearer token (same code path).
- [ ] AC-BE-4. Tenant isolation: tenant repository cannot be constructed without `organization_id`; org A data not visible under org B scope.
- [ ] AC-BE-5. Refresh reuse-detection: replaying a rotated refresh revokes the whole `family_id` + 401.
- [ ] AC-BE-6. Secrets: plaintext → `enc:v2:*`; rotation effective on next call (no cache); no AI key → `AiUnavailableError` without env read.
- [ ] AC-BE-7. Passwords (VER-02): app users use argon2 (`app/auth/password.py`); bcrypt only for the SQLAdmin operator (`core/security.py`); paths not crossed.
- [ ] AC-BE-8. A `non_negotiable` pytest marker is registered in `pyproject.toml`; `pytest -m non_negotiable` runs green and each scenario above cites the test that closes it.
- [ ] AC-BE-9. Spot-check: deliberately breaking the VPN invariant and the ERP write-gate makes the corresponding test fail (proves the gate bites).
- [x] AC-BE-10. `pytest -m merge_gate` (17: durable-id + DEC-0013 commit-gate) is green on real Postgres+pgvector; S8 gaps (criteria API 422 + JSONB, `get_esupl_access` None-branches, catalog sync, bootstrap resilience, `CriteriaFields`) added.

### Frontend
- [x] AC-FE-1. FE test suite (`vitest`) is green (43 passed), including the golden-vector `source_key` normalization parity test that guards the moat auto-fill invariant.
- [ ] AC-FE-2. Component tests exist for `CriteriaFields` render/emit and the criteria-schema HTTP client path (S8 additions kept green).

### Other (infra/CI)
- [ ] AC-OTHER-1. Tests run on real Postgres+pgvector (not SQLite), egress via `respx`; a live DB env (`DATABASE_URL`) is required (`S0`).
- [ ] AC-OTHER-2. A CI pipeline that runs `pytest -m non_negotiable` as a merge gate is captured in the prod checklist (`R-Deploy`); CI itself is DEFER-02 for Phase 1 (currently manual).

## Open questions / gates

- **`non_negotiable` marker not yet registered** — only `merge_gate` exists in `pyproject.toml:65-67`; this is the main remaining gap that keeps the feature `partial`.
- **CI enforcement deferred** — CLAUDE.md wants CI-enforced non-negotiables; Phase 1 runs them manually (DEFER-02).
- **VER-021 is separate** — the durability gate ([[LCOS-F28-esupl-contracts]], [[VER-021_ESUPL_DURABILITY_TEST]]) is owner-run and orthogonal to this test suite; merge remains gated on it independently.

## Sources

- `plan/PHASE_S1_STABILIZATION.md §1 S1-B7` (six non-negotiable scenarios), `S1-B8` (argon2 vs bcrypt), `§5 AC-3`.
- `08_PHASE1_SPEC.md F1.5` (REQ-1 confirm/extend, REQ-2 `non_negotiable` marker + `pyproject.toml`).
- `LCOS_Conformance_Alignment_GlobalRequirements.md` — V-a (merge-blocking tests), V-b (passwords), Part 4 test scenarios.
- `APP_OVERVIEW.md §12` (real Postgres+pgvector, respx, `merge_gate` = 17, 209/43 green).
- `TZ__STABILIZATION_2026-07-09__ALIGNED.md S8` (merge_gate = 17 not 5; S8 added DB/HTTP/component tests).
- `mvp.be/pyproject.toml:65-67` (only `merge_gate` registered); `mvp.be/tests/` (existing egress/tenant/auth/secret suites).
