---
doc: FRONTEND_REVIEW
title: "Код-ревью frontend (2026-07-10)"
status: archived
archived: 2026-07-15
archived_from: repo-root (d:/_work/mvp)
reason: "Ревью отработано частично; переходим на spec-kit/converge"
trust_tier: 3
open_findings: true
open_findings_action: extract-to-[[05_BACKLOG]]
---

> Архивировано 2026-07-15 из корня репозитория. Документ инертен — не читается как актуальный. Содержит НЕзакрытые находки: перед опорой на spec-kit вынести в [[05_BACKLOG]].
# Frontend Code Review — LCOS (mvp.fe)

**Date:** 2026-07-10 · **Stack:** React + TypeScript + Vite, Feature-Sliced Design, RTK Query. **Method:** multi-agent review (FSD architecture, React runtime/perf, TypeScript safety), high findings adversarially verified. Paths repo-relative to `mvp.fe/`.

## Verdict

The frontend is **healthy and disciplined.** FSD layering is largely correct (no feature↔feature imports, every slice has a public-API barrel, provider seams use a consistent factory pattern), TypeScript is on full `strict` with essentially no `any`-spray, and LLM/OCR outputs are genuinely runtime-validated. **No critical or (surviving) high defects.** The two issues most worth fixing are a **defeated row-memoization on the invoice hot path** and a **cache-invalidation tag mismatch** that can show the wrong tenant's reference data after a subdivision switch.

### Severity rollup

| Sev | Count | Highlights |
|-----|-------|-----------|
| Critical | 0 | — |
| High → downgraded | 2 | row-memo defeated (**CONFIRMED**, treat as medium); shared/pos ownership (**PLAUSIBLE→low**, design-taste) |
| Medium | 6 | tag mismatch across tenant switch, unvirtualized SKU dropdown, stale-closure in recognize effect, shared-layer domain imports, backend REST unvalidated, OCR map without array guard |
| Low | 9 | cross-tenant factory cache, dead hook, env untyped, `any` mappers, cast-on-status, dupe DTOs, strictness gaps, fail-open image swallow, widget/entity sideways coupling |

---

## 1. FSD architecture & layering

**Assessment:** Largely disciplined — no sideways feature imports, no upward *runtime* imports, every entity/feature/widget has an `index.ts` barrel, provider seams (llm/ocr/pos/match/sku) consistently use factory + provider + config.

- **LOW (was High, verifier downgraded) — domain models live in `shared/pos`, entities only re-export.** `shared/pos/types.ts` defines `Sku`/`Supplier`/`SkuPacking`/`Unit`/`Warehouse`/`PosOrder`; entity slices re-export them. Strict FSD says entities own their models. **However** the file documents this as a deliberate *POS/ERP provider-contract boundary* (the SSOT of shapes every POS provider returns, mirroring `shared/ocr/types`) — a defensible DTO layer, not accidental inversion. No runtime coupling (type-only). Treat as a design-taste note, not a defect.
- **MEDIUM — features/widgets import domain types from `shared/pos`, bypassing the entity barrel.** `features/lines-table/ui/SkuSelect2.tsx:13`, `features/supplier-selector/SupplierSelector.tsx:15`, `widgets/invoice-workbench/lib/useSupplierSelection.ts:13`. *Fix: import from `@/entities/sku` / `@/entities/supplier`.*
- **MEDIUM — domain-coupled SKU logic/UI in the shared layer.** `shared/sku/factory/{ingredient,supplier}Factory.ts` call `backendRequest` (data access) and `shared/sku/components/SKUDropdown.tsx` is a domain product picker — overlapping `entities/sku/api/skusApi.ts`. SKU responsibility is split across two layers (duplication risk). *Fix: move factories + dropdown into `entities/sku` (or a feature); keep only a domain-free generic dropdown in `shared/ui`.*
- **MEDIUM — `app/observers/configSync.ts:4` deep-imports `@/entities/auth/api/authApi`,** bypassing the barrel. *Fix: import from `@/entities/auth`; add an ESLint boundaries rule.*
- **LOW ×4:** `widgets/app-layout` imports sibling widgets breadcrumbs/footer (sideways — treat AppLayout as an app-layer shell); `entities/invoice` type-only imports from sibling `sku`/`supplier` entities (formalize with FSD `@x` notation); two documented type-only upward imports into `@/app/store` (sanctioned RTK exception); slice-structure inconsistencies (`SupplierSelector.tsx` at slice root without `ui/`; stale `SkuSelect2` versioned name).

---

## 2. React runtime & performance

**Assessment:** Solid data-fetching (RTK Query), real runtime validation on the LLM/OCR text path. The high-impact issues are on the invoice hot path.

- **MEDIUM (was High, CONFIRMED) — row `React.memo` is defeated; every line re-renders on any session change.** `widgets/invoice-workbench/ui/InvoiceWorkbench.tsx:~142` subscribes to the **entire** `s.invoiceSession` slice, so it re-renders on `activeLineId`/`photoVisible`/`zoom` changes, and the inline `onSuggest`/`onSuggestLine` handlers (~301/317) are recreated each render (no `useCallback`). `LineRow`/`LineCard` are `memo(...)` and explicitly assume stable callbacks — so the memo does nothing. *Impact: on a 40-line invoice, clicking one row re-renders all 40.* *Verifier CONFIRMED the mechanism.* *Fix: `useCallback` the handlers + narrow the selector (per-field or `shallowEqual`/`createSelector`).*
- **MEDIUM — cache-invalidation tag mismatch; wrong-tenant reference data survives `switchContext`.** `entities/auth/api/authApi.ts` invalidates `['Me','Invoice','Supplier','Ingredient']`, but **no endpoint provides `Ingredient`** — catalogue endpoints provide `['Sku']`, orders provide `['Order']`, neither invalidated. `configSync` only clears the whole cache on a *POS-config* change (not a same-org subdivision switch). *Result: after switching subdivision, the previous subdivision's warehouses/units/SKUs/orders stay cached — the Склад dropdown & list can show the wrong tenant's data.* *Fix: align `providesTags` to the invalidated names (or add `Sku`/`Order` to the mutations); verify a subdivision switch refetches.*
- **MEDIUM — SKU dropdown renders the entire catalogue unvirtualized** (`shared/sku/components/SKUDropdown.tsx:~131-160`) and `useSkuSearch` full-sorts the catalogue per row (`~90-131`). Hundreds–thousands of SKUs → open hitch, ×N per invoice. *Fix: virtualize + cap the "all items" group; sort once at the parent.*
- **MEDIUM — recognize effect omits `suppliers`/`startRecognition` deps → supplier auto-match against a stale/empty list.** `pages/invoice-import/ui/InvoiceImportPage.tsx:~68-73`. If recognition fires before suppliers load, the frozen closure never sees the loaded list → an existing supplier reported unmatched, learned mappings not loaded. *Fix: read `suppliers` from a ref at resolution time or gate the trigger on suppliers loaded.*
- **LOW — `IngredientSKUFactory.bySupplierCache` keyed only by `supplierId`, never cleared on tenant switch** (`shared/sku/factory/ingredientFactory.ts:~20-73`) — plain Map outside RTK; overlapping supplierIds across subdivisions → stale group. *Fix: key by `(org, subdivision, supplierId)` or `clear()` on context switch.*
- **LOW — `useSupplierSelection` is dead code** (unused; constructs a factory every render). *Fix: delete.*

---

## 3. TypeScript safety & maintainability

**Assessment:** Strong — full `strict` (`noUnusedLocals/Parameters`, `noFallthroughCasesInSwitch`), essentially no `@ts-ignore`/`any`-spray, no error-swallowing in business logic, and the LLM/OCR text path is genuinely validated (`parseOcrResult`, `parseMatchResult`, `clamp01`/`toNumber`). The real risk is the **plain-REST boundary**. No high/critical.

- **MEDIUM — backend REST responses are cast `data as T` with zero runtime validation** (`shared/api/backendRequest.ts:73`). Every typed consumer (`Me`, `SupplierOut[]`, `IngredientOut[]`, `InvoiceOut`, `MappingOut[]`) trusts the wire shape; contract drift surfaces later as an opaque crash. Inconsistent with the defensively-parsed OCR/LLM path. *Fix: lightweight runtime validation (zod or type guards) at the transport boundary for load-bearing shapes.*
- **MEDIUM — backend OCR recognize response mapped without the array guard its LLM sibling has.** `shared/ocr/providers/backend.ts:64` does `draft.lines.map(...)` on the raw response; `lines: null`/missing/non-array → `TypeError`. The text path guards `Array.isArray(obj.lines) ? … : []` (`shared/ocr/parse.ts:74`). *Fix: guard/normalize before mapping.*
- **LOW ×7:** `refToSku(ref: any)` defeats checking and duplicates a typed sibling mapper (`shared/sku/factory/ingredientFactory.ts:86`); `SKUItem` has `[key: string]: any` (`shared/sku/factory/types.ts:12`); unsafe union cast on send status (`shared/pos/providers/backend.ts:165`) can lock out a legitimate resend; custom Vite env vars untyped (`shared/config/env.ts` — augment `ImportMetaEnv`); backend DTOs hand-mirrored in ≥3 files with no shared source; `noUncheckedIndexedAccess` off (over-types index access); fail-open image preprocessing swallows errors with no diagnostic log (`shared/ocr/preprocess/normalizeImage.ts:42`).

---

## Top recommendations (priority order)

1. **`useCallback` + narrow the workbench selector** — restores row memoization on the core invoice screen (§2, CONFIRMED).
2. **Fix the invalidation tags** so a subdivision switch refetches reference data (§2) — a real cross-tenant staleness bug.
3. **Guard the backend OCR response + add transport-boundary validation** (§3) — cheap insurance against contract drift.
4. **Virtualize the SKU dropdown** before the real catalogue lands (§2).
5. **Fix the recognize-effect deps** so supplier auto-match is reliable (§2).
6. **Housekeeping:** delete `useSupplierSelection`, rename `SkuSelect2`→`SkuSelect`, move domain types/logic out of `shared` into their entities, add an ESLint FSD-boundaries rule to prevent regressions.

Backend & DB review: [BACKEND_DB_REVIEW.md](BACKEND_DB_REVIEW.md) · Requirements position: [REQUIREMENTS_STATUS.md](REQUIREMENTS_STATUS.md)
