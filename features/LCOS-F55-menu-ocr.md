---
id: LCOS-F55
type: feature
title: Menu OCR (doc-type menu)
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
# LCOS-F55 · Menu OCR (doc-type menu)
**Epic:** [[LCOS-E11-competitor-menu]] · **Status:** future · **Phase:** Phase 2

## Description

Capture a competitor's menu by photographing it during the walk-around and recognizing it into structured items — reusing the invoice OCR infrastructure rather than building a second pipeline. The OCR seam gains a new document type `menu` (mirroring the `invoiceType` pattern from [[LCOS-E6-ocr-quality]]): a dedicated prompt asks the vision-LLM to extract menu positions (name, volume, price, category) as JSON, returning `null` where unsure, into a domain DTO `MenuDraft`. Everything runs through the same `ai_complete` / `OcrProvider` infrastructure with fail-closed VPN egress and the platform-scoped key — no new provider, no new egress path ([[ADR-009]]).

`POST /api/v1/competitors/{id}/menu/recognize` (multipart, up to 3 photos = menu pages) returns a `MenuDraft` **without persisting**, exactly like `/invoices/recognize`; a human reviews and edits the items, then `POST /api/v1/competitors/{id}/menu` saves a confirmed snapshot. Each walk-around = one `competitor_menu_snapshots` row (with `captured_on`, `image_ref`, `ocr_raw`) plus its `competitor_menu_items` (name-as-shown, price, currency, volume, category). Re-capturing creates a **new** snapshot; older snapshots stay readable so history is preserved. The frontend maximally reuses the workbench/prepare-step photo pipeline from [[LCOS-E6-ocr-quality]].

## Capabilities

- New OCR doc-type `menu`: a dedicated menu-extraction prompt on the shared provider seam ([[provider-abstraction]], [[ADR-009]]).
- `POST /competitors/{id}/menu/recognize` — up to 3 pages → `MenuDraft`, no persistence (parity with `/invoices/recognize`).
- `POST /competitors/{id}/menu` — persist a reviewed snapshot with its items.
- Snapshot model: one walk-around = one `competitor_menu_snapshots`; re-capture = new snapshot, prior snapshots readable (history preserved).
- Fail-closed egress: no key → `AiUnavailableError` (503); `ai_vpn_enabled=true` + dead tunnel → `VpnUnavailableError` ([[fail-closed]], [[vpn-egress]], [[ADR-006]]).
- FE reuses the photo → crop → recognize → review-table flow from the invoice workbench.
- Key and egress routing live only on the backend; the browser holds no secret ([[ADR-012]]).

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Photographs a competitor's menu and reviews the recognized items within their subdivision. |
| [[admin]] | Same; typically runs the walk-around and saves snapshots for the organization. |
| [[superadmin]] | Cross-tenant access; edits the `menu` OCR prompt and `ai_provider` via the config API. |
| [[sqladmin-operator]] | Switches `ai_provider` / edits the menu prompt in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]); not in the capture flow. |

Tenant-scoped: snapshots and items are isolated per organization; scope comes from the JWT context ([[auth]], [[multitenancy]]).

## Involved entities

- [[integration_credentials]] — the Fernet-encrypted platform AI key, read backend-only; egress via VPN, never exposed to the browser.
- [[system_settings]] — `ai_provider` (runtime OCR implementation) and the `menu` recognition prompt, editable without a redeploy.
- `competitor_menu_snapshots` (future org-scoped table) — one walk-around; `captured_on`, `image_ref`, `ocr_raw`.
- `competitor_menu_items` (future org-scoped table) — recognized positions (`name`, `price`, `currency`, `volume`, `category`); entity docs to be created on activation.

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (OCR seam accepts a new doc-type without rewriting the provider), [[fail-closed]] + [[vpn-egress]] (no key / dead VPN → explicit refusal, no silent egress).
- **Features:** reuses the OCR pipeline from [[LCOS-F8-ocr-recognition]] and the quality/crop tooling of [[LCOS-E6-ocr-quality]]; attaches snapshots to cards from [[LCOS-F54-competitor-directory]]; feeds [[LCOS-F56-positioning]].
- **ADR:** [[ADR-009]] (provider seam, one implementation, doc-type extensibility), [[ADR-006]] (fail-closed egress), [[ADR-012]] (live provider paths backend-only).

## Acceptance criteria

Acceptance criteria: TBD (Phase 2 — detailed on activation).

## Sources

- `plan/PHASE_F7_COMPETITORS_MENU.md §1` — F7-B2 (menu OCR, new doc-type, recognize/save endpoints), `§2` — F7-F1 (photo → crop → recognize → review-table reuse).
- `07_PHASES.md Э7` (OCR type `menu`, reuse of `shared/ocr`, `prepare-step`, `image-cropper`, two-step wizard).
- `plan/00_IMPLEMENTATION_PLAN.md F7`.
