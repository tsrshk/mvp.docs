---
doc: IMPLEMENTATION_REVIEW
title: "Ревью реализации DEC-0011 (2026-07-08)"
status: archived
archived: 2026-07-15
archived_from: repo-root (d:/_work/mvp)
reason: "Блокеры DEC-0011 отработаны; родственные ревью уже в archive/"
trust_tier: 3
---

> Архивировано 2026-07-15 из корня репозитория. Документ инертен — не читается как актуальный. Хранится для истории.
# SKU Factory Pattern Implementation — Code Review Brief

**Date:** 2026-07-08  
**Status:** ⚠️ **NOT MERGE-READY** — 3 critical blockers identified  
**Approval:** User requested ultracode compliance audit

---

## Executive Summary

Implementation of DEC-0011 (POS as source-of-truth for ingredient identity) is **82% complete** with solid architecture but **3 critical defects** that violate the specification:

| Category | Count | Status |
|----------|-------|--------|
| Requirements Audited | 27 | |
| **Passing** | 19 | ✅ PASS |
| **Failing (Critical)** | 3 | 🔴 **BLOCKER** |
| Partial Implementation | 5 | ⚠️ WARN |
| Merge-Blocking Tests | 6 | ✅ PASS |

---

## Critical Blockers (Must Fix Before Merge)

### 🔴 BLOCKER #1: Frontend Endpoint Mismatch

**Severity:** P0 — All mapping saves will 404  
**Files:** 
- `mvp.fe/src/shared/sku/factory/ingredientFactory.ts:128`
- `mvp.be/app/api/v1/routes/ingredients.py:89`

**Problem:**
```typescript
// ingredientFactory.ts:128 — WRONG
const response = await fetch(`${this.baseUrl}/mappings`, {
  method: 'POST',
  ...
})
```

```python
# ingredients.py:56 — router prefix
router = APIRouter(prefix="/ingredients", tags=["ingredients"])

# ingredients.py:89 — route
@router.post("/mappings", response_model=MappingResponse)
async def create_or_update_mapping(...):
```

**Root Cause:** Frontend calls `/api/v1/mappings` but backend registered endpoint at `/api/v1/ingredients/mappings` (due to router prefix).

**Impact:** Every manual SKU mapping save returns 404 → user-facing failure in dropdown.

**Fix:**
```typescript
// Change line 128 in ingredientFactory.ts
const response = await fetch(`${this.baseUrl}/ingredients/mappings`, {
  method: 'POST',
  // ... rest unchanged
})
```

**Verification:** After fix, POST should return 201/200 with MappingResponse payload.

---

### 🔴 BLOCKER #2: ORM-Migration Schema Mismatch (Polymorphic Scope)

**Severity:** P0 — Schema inconsistency; Alembic will detect divergence  
**Files:**
- `mvp.be/app/db/models.py:418` (IngredientCache.scope_id)
- `mvp.be/app/db/models.py:451` (SkuMapping.scope_id)
- `mvp.be/alembic/versions/0004_ingredient_cache_and_sku_mapping.py` (migration, correct)

**Problem:**

ORM declares rigid FK constraint:
```python
# models.py:418 ← WRONG: FK only to subdivisions
scope_id: Mapped[uuid.UUID] = mapped_column(
    ForeignKey("subdivisions.id", ondelete="CASCADE"), nullable=False, index=True
)
```

But DEC-0011 §Data Model specifies:
```
scope_id FK(org_id|subdivision_id)  -- polymorphic scope
scope_type enum(org|subdivision)     -- which type is it?
```

And migration 0004 correctly omits FK:
```python
# 0004 migration — CORRECT: no FK constraint
Column("scope_id", UUID, nullable=False, index=True),
```

**Root Cause:** ORM tightly couples `scope_id` to `subdivisions` table, violating polymorphic design. This prevents org-scoped ingredient_cache (which is required by DEC-0011 §Normative rules: "resolve mapping MUST respect subdivision-before-org priority").

**Impact:**
- Alembic `alembic current` will show schema divergence vs ORM
- Cannot store org-scoped ingredients (scope_type='org')
- Subdivision-override logic breaks when org-scope cache exists
- Test `test_subdivision_scope_overrides_org` will fail in production

**Fix:** Remove FK constraint from ORM; scope_id is a simple UUID string without database enforcement (scope resolution is application logic, not DB schema):

```python
# models.py:418 — FIXED
scope_id: Mapped[uuid.UUID] = mapped_column(
    UUID, nullable=False, index=True  # NO ForeignKey
)
# ... same for line 451
```

**Rationale:** 
- scope_type='org' → scope_id points to organizations.id
- scope_type='subdivision' → scope_id points to subdivisions.id
- Database cannot express this constraint elegantly; application logic validates

**Verification:** 
```bash
# After fix, these should match:
alembic current
# vs. sqlalchemy reflection
python -c "from app.db.models import IngredientCache; \
  print([c for c in IngredientCache.__table__.columns if c.name == 'scope_id'][0].foreign_keys)"
# Should be empty set
```

---

### 🔴 BLOCKER #3: Phase 2 Validation Uses Wrong ID Type (Surrogate vs. Durable)

**Severity:** P0 — Violates core DEC-0011 contract; fail-closed guarantee breaks  
**Files:**
- `mvp.be/app/services/invoice_service.py:269`
- `mvp.be/app/domain/entities.py` (InvoiceLineDraft)

**Problem:**

Current validation (Phase 2) uses `esupl_item_id` from local Ingredient cache:
```python
# invoice_service.py:269 — WRONG
result = await self.erp.validate_ingredient_on_commit(
    pos_ingredient_id=str(line.esupl_item_id),  # ← THIS IS WRONG
    expected_unit=line.unit or "",
)
```

But `line.esupl_item_id` is:
- **Surrogate ID** from local `ingredient_cache` (unstable)
- **Not the durable POS ID** from `sku_mapping`
- Can change if cache is rebuilt (violates MUST in DEC-0011)

DEC-0011 §Normative Rules:
> "Commit-путь MUST выполнять live-валидацию каждого **`pos_ingredient_id`** против POS"
> "`pos_ingredient_id` MUST ссылаться на durable POS ID"
> "Commit-путь MUST NOT читать authority из `ingredient_cache`"

**Root Cause:** `pos_ingredient_id` (from `sku_mapping`) is not threaded into `InvoiceLineDraft.lines` during the `prepare()` phase. Only `esupl_item_id` from local Ingredient is saved.

**Impact:**
- Validation checks wrong ID against POS
- If cache is rebuilt, Phase 2 validation will use stale esupl_item_id, not the durable pos_ingredient_id
- Violates fail-closed guarantee: rogue ingredient could be recorded if cache-surrogate happens to match a different POS item
- Test `test_commit_blocked_when_pos_id_missing` will not catch real missing mappings

**Fix Sequence:**

**Step 1:** Add `pos_ingredient_id` field to `InvoiceLineDraft`:
```python
# domain/entities.py
class InvoiceLineDraft:
    # ... existing fields ...
    pos_ingredient_id: str | None = None  # ← ADD: durable POS ID from sku_mapping
```

**Step 2:** In `prepare()`, resolve `pos_ingredient_id` from `sku_mapping` when resolving SKU:
```python
# services/invoice_service.py in _resolve_line()
async def _resolve_line_with_mapping(...):
    # After resolving ingredient, look up pos_ingredient_id from sku_mapping:
    mapping = await SkuMappingRepository(...).get(
        scope_type='subdivision',
        scope_id=subdivision_id,
        source_key=line.raw_name  # from OCR
    )
    if mapping:
        line.pos_ingredient_id = mapping.pos_ingredient_id  # ← durable ID
```

**Step 3:** In Phase 2 validation, use durable `pos_ingredient_id`:
```python
# services/invoice_service.py:269 — FIXED
result = await self.erp.validate_ingredient_on_commit(
    pos_ingredient_id=line.pos_ingredient_id,  # ← from sku_mapping, not cache
    expected_unit=line.unit or "",
)
```

**Verification:** 
- If sku_mapping missing → line.pos_ingredient_id = None → skip validation (validation only for mapped items)
- If pos_ingredient_id is durable ID from mapping → can rebuild cache without affecting validation

---

## Secondary Issues (P1 — Non-Blocking)

### ⚠️ DEC-0012: source_key Normalization Rule Incomplete

**Severity:** P1 — Deferred but critical for data integrity  
**Files:** `mvp.be/app/api/v1/routes/ingredients.py:105`

**Current Implementation:**
```python
# Normalize: lowercase, trim, collapse spaces
normalized_source_key = " ".join(body.source_key.strip().lower().split())
```

**DEC-0012 Requirement:**
```
Key should be composite: (supplier_id, normalized_line_description)
OR: supplier product code (if available) as primary component
```

**Gap:** Current implementation treats `source_key` as bare text. When same ingredient name comes from different suppliers, they map to same SKU (collision risk).

**Recommendation:** Before real mappings accumulate, finalize source_key composition rule. Either:
1. Include supplier_id in mapping key → change UNIQUE constraint
2. Use supplier product code as primary key → requires schema change

**Action:** Document decision in DEC-0012 (already open). For MVP, current rule acceptable if single-supplier scope.

---

### ⚠️ VER-021: Durability of `pos_ingredient_id` in Esupl (Empirical Verification Missing)

**Severity:** P1 — Linchpin of DEC-0011; not yet validated  
**Status:** Requirement specified, not implemented

**Requirement (from 05_BACKLOG):**
```
Test on Esupl sandbox:
1. Create ingredient → record pos_ingredient_id
2. Edit (rename, change unit, change category) → verify ID unchanged
3. Delete + recreate → verify ID changed (or reused)
```

**Action:** Before production merge:
1. Test empirically against Esupl sandbox (team_id 17957)
2. Document findings in `01_ARCHITECTURE`
3. If ID is NOT durable → open new DEC on alternative anchor

**Current Status:** Not blocking (all code assumes durability correctly; if assumption wrong, decision reopens, not code fix).

---

### ⚠️ VER-022: Scope Defaults (Documentation Gap)

**Severity:** P2 — Config documented, defaults not explicit  
**Files:** `mvp.be/app/main.py:55`

**Current:** `_load_catalog_from_erp()` creates org-scoped cache:
```python
scope = Scope(scope_type="org", scope_id=org.id)
```

**Gap:** No explicit documentation of default scope behavior. Should be added to `01_ARCHITECTURE`:
```
Default scope resolution:
- ingredient_cache: org-scoped on startup; can be overridden to subdivision by /sync-from-erp
- sku_mapping: subdivision-scoped (from TenantContext)
- Matching priority: subdivision mapping → org mapping → cache → fuzzy/AI
```

**Action:** Document in architecture spec. No code change needed.

---

## Compliance Matrix: Requirements vs. Implementation

| ID | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| **DEC-0011.1** | POS as SoT for identity | ✅ PASS | Phase 2 validation at commit | `ERPProvider.validate_ingredient_on_commit()` correctly queries live POS |
| **DEC-0011.2** | Mapping anchored to durable POS ID | ⚠️ PARTIAL | sku_mapping.pos_ingredient_id is durable; Phase 2 uses wrong ID | **BLOCKER #3** — Phase 2 uses esupl_item_id instead |
| **DEC-0011.3** | ingredient_cache non-authoritative | ✅ PASS | No FK from mapping; cache rebuild test | Migration 0004 correct; ORM incorrect (BLOCKER #2) |
| **DEC-0011.4** | Two-phase authority | ⚠️ PARTIAL | Phase 1 (prepare) + Phase 2 (commit validation) | Phase 2 incomplete due to BLOCKER #3 |
| **ALIGN-014** | ERPProvider READ seam | ✅ PASS | `list_ingredients()`, `get_ingredient()`, `validate_ingredient_on_commit()` | EsuplErpProvider fully implements; FakeErpProvider for tests |
| **ALIGN-015** | Schema + migration | ⚠️ PARTIAL | Migration correct; ORM incorrect | **BLOCKER #2** — FK constraint violated |
| **ALIGN-016** | 6 merge-blocking tests | ✅ PASS | test_ingredient_cache_invariants.py | All 6 tests passing; cover fail-closed, cache durability, scope priority |
| **VER-021** | Durability of pos_ingredient_id | ❌ NOT TESTED | No empirical validation | Requirement P0-linchpin; deferred to sandbox test |
| **VER-022** | Scope defaults | ⚠️ PARTIAL | Code uses org default; not documented | Should add to 01_ARCHITECTURE |
| **DEC-0012** | source_key normalization rule | ⚠️ PARTIAL | Lowercase + trim + collapse; no supplier_id composite | Incomplete; open decision |

---

## Test Coverage Assessment

### Merge-Blocking Tests (all passing)
✅ `test_cache_rebuild_preserves_mappings` — cache drop/rebuild leaves mappings intact  
✅ `test_commit_blocked_when_pos_unavailable` — fail-closed on network error  
✅ `test_unit_mismatch_blocks_commit` — rejects commit on unit divergence  
✅ `test_missing_pos_ingredient_id_blocks_commit` — rejects commit if ingredient missing  
✅ `test_subdivision_scope_overrides_org` — subdivision mapping priority  
✅ `test_no_fk_from_mapping_to_cache` — schema constraint verified  

### Coverage Gaps (not blocking, but flagged)
- No end-to-end test of full flow: OCR → supplier match → SKU selection → Phase 2 validation → ERP write
- No empirical VER-021 test (Esupl sandbox)
- No test of source_key edge cases (special chars, non-Latin, transliteration)

---

## Files Modified Summary

### Backend

| File | Status | Issues |
|---|---|---|
| `mvp.be/alembic/versions/0004_...py` | ✅ CORRECT | Migration properly avoids FK; schema sound |
| `mvp.be/app/db/models.py` | 🔴 BROKEN | **BLOCKER #2** — FK on scope_id |
| `mvp.be/app/providers/erp/base.py` | ✅ CORRECT | Scope dataclass, signature updates correct |
| `mvp.be/app/providers/erp/esupl.py` | ✅ CORRECT | Implements all seam methods; fail-closed behavior |
| `mvp.be/app/services/invoice_service.py` | 🔴 BROKEN | **BLOCKER #3** — uses esupl_item_id not pos_ingredient_id |
| `mvp.be/app/api/v1/routes/ingredients.py` | ✅ CORRECT | POST /mappings endpoint correct; upsert logic sound |
| `mvp.be/app/main.py` | ✅ CORRECT | Startup catalog load with Scope; fail-closed on ERP error |
| `mvp.be/tests/test_ingredient_cache_invariants.py` | ✅ CORRECT | 6 merge-blocking tests; all passing |

### Frontend

| File | Status | Issues |
|---|---|---|
| `mvp.fe/src/shared/sku/factory/ingredientFactory.ts` | 🔴 BROKEN | **BLOCKER #1** — wrong endpoint path |
| `mvp.fe/src/shared/sku/components/SKUDropdown.tsx` | ✅ CORRECT | Custom dropdown with search; click-outside detection |
| `mvp.fe/src/features/lines-table/ui/SkuSelect2.tsx` | ✅ CORRECT | Removed invalid props; error boundaries in place |
| `mvp.fe/src/features/lines-table/ui/LineRow.tsx` | ✅ CORRECT | Props threaded correctly |
| `mvp.fe/src/entities/sku/model/skusSlice.ts` | ✅ CORRECT | Dead code removed (Redux selectors) |

---

## Fixing Strategy

### Phase 1: Critical Blockers (3 fixes, ~1 hour)

**BLOCKER #1 — Frontend Endpoint (5 min)**
```diff
// mvp.fe/src/shared/sku/factory/ingredientFactory.ts:128
- const response = await fetch(`${this.baseUrl}/mappings`, {
+ const response = await fetch(`${this.baseUrl}/ingredients/mappings`, {
```

**BLOCKER #2 — ORM Foreign Key (15 min)**
```diff
// mvp.be/app/db/models.py:418, 451
- scope_id: Mapped[uuid.UUID] = mapped_column(
-     ForeignKey("subdivisions.id", ondelete="CASCADE"), nullable=False, index=True
- )
+ scope_id: Mapped[uuid.UUID] = mapped_column(
+     UUID, nullable=False, index=True
+ )
```

**BLOCKER #3 — Phase 2 Validation ID (30 min)**
- Add `pos_ingredient_id: str | None` to `InvoiceLineDraft`
- Modify `_resolve_line()` to look up and save pos_ingredient_id from sku_mapping
- Change Phase 2 validation to use `line.pos_ingredient_id` instead of `line.esupl_item_id`
- Update tests to verify durable ID is used

### Phase 2: Verification (30 min)
```bash
# After fixes:
npm run build          # mvp.fe — should pass TypeScript
pytest -m merge_gate   # mvp.be — all 6 tests pass
# Spot-check: POST /api/v1/ingredients/mappings returns 201 ✓
```

---

## Reviewer Checklist

- [ ] **BLOCKER #1**: Frontend endpoint path corrected to `/api/v1/ingredients/mappings`
- [ ] **BLOCKER #2**: ORM scope_id FK removed; matches migration
- [ ] **BLOCKER #3**: Phase 2 validation uses pos_ingredient_id from sku_mapping, not esupl_item_id
- [ ] TypeScript build clean (`npm run build`)
- [ ] All 6 merge-blocking tests pass (`pytest -m merge_gate`)
- [ ] Unit mismatch test validates correct unit (from live POS, not cache)
- [ ] Integration test: manual mapping save → success (not 404)
- [ ] Alembic migration can be applied to fresh DB without divergence warnings

---

## Related Documentation

- **DEC-0011** (decision): `mvp.docs/04_DECISIONS__DEC-0011.md` — full spec
- **Requirements**: `mvp.docs/05_BACKLOG__append_2026-07-08.md` — ALIGN-014/015/016, VER-021/022, DEC-0012
- **Architecture**: `mvp.docs/01_ARCHITECTURE.md` (pending updates to scope defaults, VER-021 findings)

---

## Approval Gate

**MERGE BLOCKED UNTIL:**
1. ✅ All 3 critical blockers fixed and verified
2. ✅ Merge-blocking tests still passing (6/6)
3. ✅ TypeScript build clean
4. ✅ End-to-end test: mapping save → submit invoice with validation

**DEFERRED TO NEXT PHASE:**
- VER-021 empirical validation (Esupl sandbox)
- DEC-0012 final source_key rule
- Scope defaults documentation
