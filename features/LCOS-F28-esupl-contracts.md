---
id: LCOS-F28
type: feature
title: Esupl API contracts (Э0)
epic: "[[LCOS-E5-stabilization]]"
status: planned
phase: "Phase 1"
roles: [superadmin, admin]
entities: ["[[suppliers]]", "[[ingredients]]", "[[invoices]]", "[[sku_mapping]]", "[[integration_credentials]]"]
requirements: ["[[erp-esupl-integration]]", "[[fail-closed]]", "[[sku-identity-resolver]]"]
adrs: ["[[DEC-0011]]", "[[DEC-0013]]"]
legacy_refs: [08 Э0 F0.1 F0.2 F0.3, plan S1, TZ__STABILIZATION S0/S1/S1-GATE, VER-021]
sources: ["TZ__STABILIZATION_2026-07-09__ALIGNED.md S0/S1/S1-GATE/S9", "APP_OVERVIEW.md §9 §13", "VER-021_ESUPL_DURABILITY_TEST.md", "08_PHASE1_SPEC.md F0.3", "mvp.be app/providers/erp/esupl.py:4", "reference/esupl-api"]
updated: 2026-07-09
---
# LCOS-F28 · Esupl API contracts (Э0)

**Epic:** [[LCOS-E5-stabilization]] · **Status:** planned · **Phase:** Phase 1

## Description

The whole wedge depends on the Esupl (POS) API behaving the way the commit resolver assumes. This feature is the read-only contract verification that de-risks the integration: confirm the endpoints the code relies on actually filter as expected, resolve a documented endpoint discrepancy, and formally mark the one gate that cannot be closed in a read-only session.

The **hard constraint is read-only**: reads are allowed; any create/edit/delete/POST is forbidden, and `ERP_WRITE_ENABLED` stays OFF. Under that constraint the doable-now work (S1) is to confirm by reading that `GET /teams/{id}/products?id=` really filters by id (does not ignore it) and that `product_name` + `operator[product_name]=like` really searches — the same `/teams/{id}/products?id=` call the commit validation uses. The known **endpoint discrepancy** must also be resolved: the commit-validation code reads `/teams/{id}/products?id=`, whereas the VER-021 probe/doc operate on `/teams/{id}/ingredients/{id}` — these are *different resources*. Either document that `products.id == ingredients.id` (so the durability evidence transfers) or measure durability on the actually-used `/products?id=`.

The **VER-021 durability gate** is blocked by the read-only constraint: the probe (`scripts/ver021_durability_probe.py`) needs create/edit/delete in the sandbox (`VER021_CONFIRM=yes-write-to-sandbox-17957`, `ERP_WRITE_ENABLED=true`), which violates read-only. It therefore **cannot be closed by an agent** — it stays OPEN, is run by the owner (Ivan) outside a read-only session, and the result table is pasted into `01_ARCHITECTURE.md`. Merge remains gated on VER-021, as before. This feature also incorporates the Э0 read fixes already landed (`F0.3`): the team-scoped `following`/`products`/`orders` reads with per-org token and fail-closed empty results.

## Capabilities

- Verified read contract: a "request → response" table (GET only) from the sandbox proving `products?id=` filters by id and `product_name`/`operator[product_name]=like` searches.
- Resolved discrepancy: a documented statement of whether `products.id == ingredients.id`, or a decision to measure durability on `/products?id=` directly.
- Team-scoped, authenticated reads (Э0 / `F0.3`): suppliers `GET /teams/{id}/following?is_virtual=1`, catalog `GET /teams/{id}/products` (server-side `product_name` LIKE), one item `GET /teams/{id}/products?id=` (commit validation), receipts `GET /teams/{id}/orders`; all fail-closed on a missing token (empty list + warning, never an unauthenticated request).
- Explicit gate bookkeeping: VER-021 marked owner-run / write-gated in `01_ARCHITECTURE.md`; merge stays gated; nothing closed silently.
- Doc alignment (S9): `01_ARCHITECTURE` records unit-authority (D2), VER-022 closed by DEC-0013, and VER-021 OPEN/write-gated.

## Access by role

| Role | What they can do |
|---|---|
| [[superadmin]] | Owns the sandbox verification and pastes the evidence table; runs the write-gated VER-021 probe outside a read-only session. |
| [[admin]] | Sets the org POS token (`PUT /organizations/{id}/pos-config`) that authenticates the team-scoped reads; benefits from confirmed contracts. |
| [[member]] | No direct action; benefits from a validated commit path (correct `pos_ingredient_id` resolution). |
| [[sqladmin-operator]] | May set the POS token in SQLAdmin; the write-gate (`ERP_WRITE_ENABLED`) is toggled here for the owner-run probe only. |

Every Esupl read carries the tenant's Bearer token (`get_esupl_access(session, org_id) → (team_id, token)`), the SSOT for POS access (4 call sites: supplier list/sync, catalog, receipts, commit).

## Involved entities

- [[suppliers]] — mirror of Esupl `following`; the read fix backs supplier sync.
- [[ingredients]] — the local catalog mirror; the `products` vs `ingredients` id relationship is the crux of the discrepancy.
- [[invoices]] — commit validation reads `/products?id=` to confirm the resolved item before (gated) write.
- [[sku_mapping]] — supplies the `pos_ingredient_id` that commit validates against POS; durability of that id is what VER-021 probes.
- [[integration_credentials]] — the per-org Esupl token (Fernet) that authenticates every read; fail-closed when absent.

## Dependencies / links

- **Requirements:** [[erp-esupl-integration]] (read-only contract, `get_esupl_access` SSOT, the endpoint catalog), [[fail-closed]] (no exact match → `None` at commit; no unauthenticated egress; missing token → empty + warning), [[sku-identity-resolver]] (commit validation is the consumer of the confirmed contract).
- **Features:** validates the read paths of [[LCOS-F11-esupl-read]]; underpins the commit resolver in [[LCOS-F22-sku-stabilization]]; the token it relies on is managed by [[LCOS-F4-config-secrets]]; the durability gate blocks the same merge as [[LCOS-F22-sku-stabilization]].
- **Decisions:** [[DEC-0011]] (T2: one Esupl entity in two representations — `esupl_item_id` int payload / `pos_ingredient_id` str anchor `== str(esupl id)`), [[DEC-0013]] (VER-022 closed; VER-021 remains open).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. Read-only sandbox evidence (GET only): a "request → response" table showing `GET /teams/{id}/products?id=` filters by id (does not ignore it) and `product_name` + `operator[product_name]=like` searches; pasted into `01_ARCHITECTURE.md`.
- [ ] AC-BE-2. The `/products?id=` (code) vs `/ingredients/{id}` (probe/doc) discrepancy is resolved in `01_ARCHITECTURE.md`: either `products.id == ingredients.id` is documented (evidence transfers) or durability is measured on `/products?id=`.
- [ ] AC-BE-3. Team-scoped reads carry the per-org token and are fail-closed: no token → empty list + warning, never an unauthenticated request (respx tests; `F0.3` AC-1/AC-2, `grep` for old `{base}/suppliers`/`{base}/ingredients` paths is clean).
- [ ] AC-BE-4. If `id=` is not honoured → **STOP** and open a DEC to resolve by a stable code (do not silently fall back to `items[0]`).
- [ ] AC-BE-5. `alembic upgrade head` (incl. `0007_supplier_criteria`) with a working downgrade; `pytest -m merge_gate` + full DB-backed suite + `vitest` green (S0 infra gate).

### Frontend
- [ ] AC-FE-1. No FE contract change required by verification; the receipts/catalog reads consumed by the workbench and invoices list continue to work against the confirmed endpoints.

### Other (gate / docs)
- [ ] AC-OTHER-1. VER-021 durability is marked owner-run / write-gated in `01_ARCHITECTURE.md`; it is **not** closed in a read-only session; merge stays gated. See [[VER-021_ESUPL_DURABILITY_TEST]].
- [ ] AC-OTHER-2. S9 doc alignment: `01_ARCHITECTURE` records unit-authority (D2), VER-022 closed by DEC-0013, VER-021 OPEN/write-gated; `04_DECISIONS` notes D1 (variant C) vetoed and S2 closed via DEC-0011 T2.

## Open questions / gates

- **VER-021 (OPEN, owner-run):** is `pos_ingredient_id` durable under edit / delete-recreate? Empirically unconfirmed; probe requires sandbox writes → owner-run. Merge remains gated (`[[VER-021_ESUPL_DURABILITY_TEST]]`).
- **S1 (OPEN, read-only):** confirm `products?id=` / `product_name` filters are honoured; if not, STOP and open a DEC.
- **Endpoint identity:** whether `products.id == ingredients.id` — the answer decides whether existing VER-021 evidence transfers.

## Sources

- `TZ__STABILIZATION_2026-07-09__ALIGNED.md` — S0 (infra gate: live Postgres+pgvector, `0007` up/down), S1 (read-only contract + endpoint discrepancy), S1-GATE (VER-021 blocked by read-only, owner-run), S9 (doc alignment), confirmed data-flow SSOT.
- `APP_OVERVIEW.md §9` (real endpoints, `get_esupl_access` SSOT), `§13` (VER-021 owner-run, S1 open).
- `VER-021_ESUPL_DURABILITY_TEST.md` (probe scenarios, sandbox-only guard, PASS/FAIL matrix, owner-run note).
- `08_PHASE1_SPEC.md F0.3` (team-scoped read paths, fail-closed empty + warning, respx tests, AC-1/AC-2/AC-3).
- `mvp.be/app/providers/erp/esupl.py:4-9` (endpoint docstring), `:80` (`list_suppliers`), `:104/:116/:139` (`list_ingredients` / `products` / `products?id=`), `:242` (`orders`); `reference/esupl-api/` (contract mirror).
