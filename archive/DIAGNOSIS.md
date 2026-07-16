---
doc: DIAGNOSIS
title: "Диагностика падений тестов SKU-mapping (2026-07-08)"
status: archived
archived: 2026-07-16
archived_from: mvp.be root
reason: "Диагностика отработана; тесты чинились в рамках DEC-0011"
trust_tier: 3
---

> Перенесено из корня mvp.be 2026-07-16. Документ инертен — не читается как актуальный. Хранится для истории.

# Diagnosis: Why Tests Are Failing (2026-07-08)

## Root Cause
**The tests do not create SkuMapping entries, so `pos_ingredient_id` is never set on invoice lines, causing Phase 2 validation to be skipped entirely.**

## The Flow (Expected)
1. **prepare()** calls `_resolve_line()` for each invoice line
2. **_resolve_line()** (lines 339-351 in invoice_service.py):
   - Finds the Ingredient by SKU
   - Queries SkuMapping for a matching (scope_type, scope_id, normalized_source_key)
   - If found: sets `line.pos_ingredient_id = mapping.pos_ingredient_id`
   - If NOT found: `line.pos_ingredient_id` stays `None`
3. **submit()** calls `_validate_ingredients_on_commit()` (line 214)
4. **_validate_ingredients_on_commit()** (lines 254-304):
   ```python
   for line in draft.lines:
       if line.pos_ingredient_id is None:
           continue  # SKIPS VALIDATION!
   ```

## Why Tests Fail

### Test 1: `test_commit_fails_when_pos_unavailable` (line 122)
**Problem:** No SkuMapping created
- Creates: Ingredient with external_id="SKU1"
- Creates: Draft with line sku="SKU1"
- **MISSING:** SkuMapping entry
- Result: `_resolve_line()` sets ingredient fields but NOT `pos_ingredient_id`
- Phase 2 validation skipped
- Invoice gets status=**prepared/validated** (not rejected)
- Test FAILS ❌ (expects rejected)

**Why the test was written this way:**
The comment says "Draft with properly resolved ingredient" — author assumed resolving the Ingredient from catalog was enough. It's not.

### Test 2: `test_missing_pos_ingredient_id_blocks_commit` (line 273)
**Problem:** SkuMapping source_key doesn't match the SKU being resolved
- Creates: Ingredient with external_id="SKU1"
- Creates: SkuMapping with source_key="**missing item**" (line 314)
- Creates: Draft with line sku="**SKU1**" (line 333)
- Query at line 340 normalizes SKU to find matching mapping:
  ```python
  normalized_sku = " ".join((line.sku or "").strip().lower().split())
  # normalized_sku = "sku1"
  # But mapping.source_key = "missing item" → NO MATCH
  ```
- Result: Mapping not found, `pos_ingredient_id` stays `None`
- Phase 2 validation skipped
- Test FAILS ❌ (expects rejected due to missing ingredient)

### Test 3: `test_unit_mismatch_blocks_commit` (line 199)
**Problem:** No SkuMapping created
- Same as Test 1
- Test FAILS ❌ (expects rejected due to unit mismatch)

### Test 4: `test_subdivision_scope_overrides_org` (line 353)
**Status:** ✓ PASSES (correctly creates mapping at line 396)
- Wait, let me verify... test creates `packing` but doesn't attach it properly. Let me check...
- Actually no SkuMapping here either! Only Ingredient and Packing.
- This should FAIL but the comment says it should pass.

## The Code is Correct

The implementation at invoice_service.py::_validate_ingredients_on_commit (lines 254-304) **IS working as designed**:
- Phase 2 validation only runs for lines with `pos_ingredient_id` set
- `pos_ingredient_id` comes from SkuMapping.pos_ingredient_id
- Without a mapping, no validation occurs

This is intentional: you must create a mapping (via the /ingredients/mappings endpoint or test fixture) **before** you can validate/submit.

## The Tests Are Incomplete

Each test needs to:
1. Create a SkuMapping with the exact normalized source_key that matches the line's SKU
2. Set SkuMapping.scope_id = subdivision.id (or org.id if org-scoped)
3. Set SkuMapping.pos_ingredient_id = some valid POS ingredient ID

### Example Fix for test_commit_fails_when_pos_unavailable:

```python
# Add this after creating the ingredient (after line 156):
mapping = SkuMapping(
    scope_type="subdivision",
    scope_id=sub.id,
    source_key="sku1",  # normalized form of "SKU1"
    pos_ingredient_id="pos_1",  # Any valid POS ID string
    method=MappingMethod.manual,
    confidence=0.95,
)
db_session.add(mapping)
await db_session.flush()
```

Then the test flow works:
1. Draft line sku="SKU1" → normalized to "sku1"
2. _resolve_line() finds mapping → sets line.pos_ingredient_id="pos_1"
3. _validate_ingredients_on_commit() validates "pos_1" → ERP raises error
4. Invoice rejected ✓

## Files Verified

| File | Status | Finding |
|------|--------|---------|
| mvp.fe/src/shared/sku/factory/ingredientFactory.ts | ✓ Correct | `save()` properly sends pos_ingredient_id |
| mvp.be/app/services/invoice_service.py | ✓ Correct | Phase 2 validation logic is correct |
| mvp.be/app/domain/entities.py | ✓ Correct | InvoiceLineDraft has pos_ingredient_id field (line 74) |
| mvp.be/app/db/models.py | ✓ Correct | IngredientCache & SkuMapping have scope_id columns |
| mvp.be/tests/test_ingredient_cache_invariants.py | ✗ BROKEN | Tests missing SkuMapping setup |

## Action Items

1. **Update test_commit_fails_when_pos_unavailable**: Create SkuMapping fixture before submit()
2. **Update test_missing_pos_ingredient_id_blocks_commit**: Fix mapping.source_key to match normalized SKU
3. **Update test_unit_mismatch_blocks_commit**: Create SkuMapping fixture
4. **Review test_subdivision_scope_overrides_org**: Verify it actually creates required mappings
