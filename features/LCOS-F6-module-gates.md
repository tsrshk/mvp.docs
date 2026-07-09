---
id: LCOS-F6
type: feature
title: Module gates
epic: "[[LCOS-E1-platform]]"
status: built
phase: "Phase 1"
roles: [superadmin, sqladmin-operator]
entities: ["[[system_settings]]"]
requirements: ["[[config-secrets]]", "[[fail-closed]]", "[[global-requirements]]"]
adrs: ["[[ADR-005]]"]
legacy_refs: [plan/00 G4, APP_OVERVIEW §3]
sources: ["APP_OVERVIEW.md §3", "01_ARCHITECTURE.md (App assembly, modules)", "plan/00_IMPLEMENTATION_PLAN.md G4", "mvp.be app/modules/registry.py:36", "mvp.be app/core/system_settings.py:58", "mvp.be app/api/v1/routes/suppliers.py:27", "mvp.be app/api/v1/routes/admin_system.py:68"]
updated: 2026-07-09
---
# LCOS-F6 · Module gates
**Epic:** [[LCOS-E1-platform]] · **Status:** built · **Phase:** Phase 1

## Description

A lightweight runtime feature-flag mechanism that lets a superadmin turn whole product modules on/off **without a redeploy**. Routes are always **registered**; a module is gated at **request time** by a FastAPI dependency `require_module(name)` that returns **404** when the module is disabled. The toggle itself is a boolean `system_settings` key (`module_<name>_enabled`) resolved through the standard config resolver (DB → registry default `True`), so flipping it in SQLAdmin or via the config API takes effect on the next request.

Today two module toggles exist in the registry — `module_ocr_enabled` and `module_suppliers_enabled` (both default `True`). The suppliers routes demonstrate the pattern: the router mounts `dependencies=[Depends(require_module("suppliers"))]`, so when the toggle is off every suppliers endpoint answers 404 as if it weren't there. This is the platform contract every future product epic follows (plan G4): each new F-phase adds its own `module_<name>_enabled` to the `REGISTRY` and gates its routes, so a feature can be disabled from the superadmin plane cleanly.

## Capabilities

- `require_module(name)` — request-time gate dependency: disabled module → `HTTPException(404, "module '<name>' is disabled")`.
- `module_enabled(session, name)` — resolves the `module_<name>_enabled` boolean via the config resolver (DB → registry default `True`).
- Toggles are whitelisted `SettingSpec`s in the registry (`module_ocr_enabled`, `module_suppliers_enabled`), typed `TYPE_BOOL`, default `True`.
- Routes are always mounted; only the gate decides visibility, so enabling/disabling is pure runtime config (no code deploy).
- Config API `GET /admin/modules` reports current module state to a superadmin.
- Extensibility contract (G4): every future feature epic adds its own module toggle + gates its routes.

## Access by role

| Role | What they can do |
|---|---|
| [[superadmin]] | Toggle any `module_<name>_enabled` via config API / SQLAdmin; read state via `GET /admin/modules`. |
| [[sqladmin-operator]] | Same toggles through the `SystemSettingAdmin` ModelView. |
| [[admin]] / [[member]] | Cannot toggle; a disabled module's routes simply return 404 to them. |

## Involved entities

- [[system_settings]] — stores the `module_<name>_enabled` booleans; whitelisted in the registry, resolved with the same DB → default precedence as all runtime settings.

## Dependencies / links

- **Requirements:** [[config-secrets]] (module toggles are tier-2 `system_settings`, resolved DB → default), [[fail-closed]] (disabled → 404, no partial exposure), [[global-requirements]] (plan G4 module-gate contract).
- **Features:** toggles live in the settings store of [[LCOS-F4-config-secrets]], edited via [[LCOS-F3-sqladmin-operator]]; gates the OCR module of [[LCOS-F8-ocr-recognition]] and the suppliers module of [[LCOS-F17-supplier-cards]]; every future epic ([[LCOS-E7-stock]], [[LCOS-E8-purchasing]], …) adds its own gate.
- **ADR:** [[ADR-005]] (three-level config the toggles belong to).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `require_module(name)` returns 404 (`"module '<name>' is disabled"`) when the toggle resolves False; passes through when True.
- [ ] AC-BE-2. `module_enabled` resolves `module_<name>_enabled` via the config resolver with registry default `True`.
- [ ] AC-BE-3. Routes are registered unconditionally; visibility is decided only by the gate (a disabled module's endpoints 404 rather than 401/403).
- [ ] AC-BE-4. `module_ocr_enabled` and `module_suppliers_enabled` exist in the registry as `TYPE_BOOL`, default `True`.
- [ ] AC-BE-5. Toggling a module in SQLAdmin/config API changes behavior on the next request with no redeploy (resolver reads DB on demand).
- [ ] AC-BE-6. `GET /admin/modules` returns current module state to a superadmin.

## Open questions / gates

- Only two modules are gated today (OCR, suppliers); the invoice-submit path itself is not module-gated — confirm intended coverage as new epics land (G4 requires each new F-phase to add its own gate).
- No FE affordance surfaces a disabled module beyond the 404 (a disabled feature just isn't navigable) — acceptable for Phase 1's single operator.

## Sources

- `APP_OVERVIEW.md §3` ("Modules gated request-time via `require_module` → 404; routes always registered").
- `01_ARCHITECTURE.md` — "App assembly" / modules registry.
- `plan/00_IMPLEMENTATION_PLAN.md` G4 (module-gate contract for every phase).
- `mvp.be/app/modules/registry.py:24` (`module_enabled`), `:36` (`require_module` → 404).
- `mvp.be/app/core/system_settings.py:58` (`MODULE_OCR_ENABLED`), `:59` (`MODULE_SUPPLIERS_ENABLED`).
- `mvp.be/app/api/v1/routes/suppliers.py:27` (`dependencies=[Depends(require_module("suppliers"))]`).
- `mvp.be/app/api/v1/routes/admin_system.py:68` (`list_modules`).
