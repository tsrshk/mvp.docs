---
id: REQ-ERP-ESUPL
type: requirement
title: ERP Esupl integration (read-only + gated write)
status: built
scope: cross-cutting
roles: [member, admin, superadmin]
entities: ["[[organizations]]", "[[subdivisions]]", "[[ingredients]]", "[[integration_credentials]]", "[[invoices]]"]
adrs: ["[[ADR-004]]", "[[ADR-001]]", "[[ADR-006]]"]
requirements: ["[[fail-closed]]", "[[invoice-status-machine]]", "[[secret-encryption]]", "[[provider-abstraction]]", "[[global-requirements]]"]
legacy_refs: [Conformance R6.2/R8.3, plan Э0, APP §9]
sources: [01_ARCHITECTURE.md "Esupl ERP", APP_OVERVIEW.md §9, reference/esupl-api]
updated: 2026-07-09
---

# REQ-ERP-ESUPL · Esupl integration

**Type:** cross-cutting SSOT · **Status:** built. LCOS is the **write point for invoices** on top of Esupl, **read-only** to the rest of Esupl's data ([[ADR-001]]). The only ERP in Phase 1 ([[ADR-004]]).

## Normative statement

- **N1. Binding:** `organization ↔ exactly one Esupl team` (`organizations.esupl_team_id`); `subdivision ↔ Esupl warehouse` (`subdivisions.esupl_warehouse_id`). Both are **non-secret** ID columns; the only Esupl secret is the Bearer token in [[integration_credentials]] (scope=org, provider=esupl). See [[secret-encryption]] R6.5.
- **N2. `EsuplErpProvider` — the only ERP implementation** ([[provider-abstraction]] N5), `requires_vpn=False` (Esupl is reachable directly).
- **N3. Real read endpoints** (tenant Bearer token on every read; `get_esupl_access(session, org_id) → (team_id, token)` — the SSOT of access, 4 places):
  - suppliers: `GET /teams/{id}/following?is_virtual=1`
  - catalog: `GET /teams/{id}/products` (server-side search `product_name` LIKE)
  - a single item: `GET /teams/{id}/products?id=` (commit validation — see [[sku-identity-resolver]])
  - invoices: `GET /teams/{id}/orders`
- **N4. Write `write_invoice` behind the toggle `ERP_WRITE_ENABLED` (default OFF):**
  - OFF: logs a warning and returns a synthetic `esupl-prepared-<number>` **without egress** — not a silent fake, but a short-circuit before the network.
  - ON: `POST /teams/{id}/outgoing-invoices` with the per-org Bearer, serialization `json.loads(payload.model_dump_json())` (handles Decimal/datetime correctly), `raise_for_status()`, extraction of `id` (or `data.id`). **The same code path in both modes** — the toggle makes the write real without rewriting.
- **N5. Fail-closed on the token:** no active POS token → the provider goes out **unauthenticated** → Esupl **401**, with no env fallback. See [[fail-closed]] N3.
- **N6. Human-in-the-loop:** no write to the POS without human confirmation ([[ADR-002]]); sending an invoice = confirming the matches (moat, [[sku-identity-resolver]]).
- **N7. Payload:** `EsuplOutgoingInvoice` is built in `prepare()` from Esupl numeric FKs (`esupl_item_id`, `esupl_unit_id`, `esupl_packing_id`, `team_id`, `warehouse_id`) + tax_rate; saved into `invoices.esupl_payload` at status `prepared` (see [[invoice-status-machine]]).
- **N8. Supplier in the payload:** `_resolve_supplier` — priority `tax_id`, then a **blended trigram 0.65 + token-Jaccard 0.35, min 0.4** by name (NOT "Jaccard≥0.5" — an outdated wording in old docs/the prepare docstring; the code is authoritative). `external_id` is coerced to int.

## Rationale

Esupl is the POS Customer Zero; LCOS does not duplicate accounting but writes invoices into it. Read-only + gated write means: the system can be run against the live token without risking data corruption while `ERP_WRITE_ENABLED=OFF`, and the write can be enabled with a single toggle. One code path in both modes rules out "worked in dry-run, broke in prod". `get_esupl_access` as the SSOT of access keeps the four token-read places from drifting apart.

## Failure modes

- **No token** → 401 (fail-closed), not a silent skip of the write.
- **`list_suppliers`/`list_ingredients` without a token** (historically off-critical-path: suppliers from seed, catalog from local `ingredients`) — currently call `_auth_headers()` without a token; debt D-f: remove/close behind a guard so no path of unauthenticated egress remains.
- **VER-021 (durability) — OPEN GATE:** the stability of `pos_ingredient_id` on edit/delete-recreate in Esupl is not empirically confirmed; the probe requires a WRITE to sandbox team 17957 → **owner-run**, merge gated. The discrepancy between the endpoints `/products?id=` (commit validation) vs `/ingredients/{id}` (probe) is documented; confirm the read-only filters.
- **ERP write failed** → not a 500 to the client: `submit` catches it and writes `status=failed` + `validation_errors`.

## Relations

- ADR: [[ADR-004]] (Esupl as the primary ERP), [[ADR-001]] (write point, not the POS), [[ADR-002]] (human-in-the-loop), [[ADR-006]] (fail-closed).
- Requirements: [[invoice-status-machine]], [[sku-identity-resolver]], [[secret-encryption]], [[provider-abstraction]], [[fail-closed]], [[global-requirements]] R6.2/R8.3.
- Entities: [[organizations]], [[subdivisions]], [[ingredients]], [[integration_credentials]], [[invoices]].
- Reference: `reference/esupl-api/` (mirror of the contracts).

## Referenced by

`LCOS-F10` (Invoice status machine + Esupl payload + gated write), `LCOS-F11` (Esupl read integration), `LCOS-F12` (warehouse-target), `LCOS-F28` (Э0 Esupl API contracts), `LCOS-F69` (second ERP connector).

## Sources

- 01_ARCHITECTURE.md → "Esupl ERP: read-only vs write, ERP_WRITE_ENABLED gating", "prepare()→payload".
- APP_OVERVIEW.md §9; LCOS_Conformance R6.2, R8.3, ADR-016 (remains/sales — proposed).
- Code: `app/providers/erp/esupl.py`, `app/services/invoice_service.py`; `VER-021_ESUPL_DURABILITY_TEST.md`.
