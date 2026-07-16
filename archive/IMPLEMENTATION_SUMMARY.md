---
doc: IMPLEMENTATION_SUMMARY
title: "Сводка реализации POST /api/v1/mappings"
status: archived
archived: 2026-07-16
archived_from: mvp.be root
reason: "Артефакт реализации эндпоинта mappings; SSOT — код и features"
trust_tier: 3
---

> Перенесено из корня mvp.be 2026-07-16. Документ инертен — не читается как актуальный. Хранится для истории.

# POST /api/v1/mappings Implementation Summary

## Endpoint Added
**Route:** `POST /api/v1/ingredients/mappings`  
**File:** `app/api/v1/routes/ingredients.py`

## Request Body
```python
{
    "source_key": str,           # Required; normalized (lowercase, trim, collapse spaces)
    "pos_ingredient_id": str,    # Required; durable POS ingredient ID
    "method": "manual"|"fuzzy"|"ai",  # Required enum
    "confidence": float,         # Optional; 0..1 range
    "confirmed_by": UUID         # Optional; user ID confirming the mapping
}
```

## Response Model
```python
{
    "id": UUID,
    "source_key": str,           # Normalized value
    "pos_ingredient_id": str,
    "method": str,
    "confidence": float | null,
    "confirmed_by": UUID | null,
    "created_at": datetime,
    "updated_at": datetime
}
```

## Implementation Details

### Core Logic
1. **Extract Scope:** Gets `organization_id` and `subdivision_id` from `TenantContext`
2. **Normalize source_key:** 
   - Strips leading/trailing whitespace
   - Converts to lowercase
   - Collapses multiple spaces to single space
3. **Upsert Logic:**
   - Queries `sku_mapping` table with: `scope_type='subdivision', scope_id, normalized_source_key`
   - If found: Updates `pos_ingredient_id`, `method`, `confidence`, `confirmed_by`
   - If not found: Inserts new mapping with UUID primary key
4. **Isolation:** All mappings scoped to `(scope_type, scope_id, source_key)` unique constraint
5. **Error Handling:** Returns 400 Bad Request on validation/database errors

### Database Table
- Table: `sku_mapping` (models.py line 439)
- Unique constraint on `(scope_type, scope_id, source_key)` ensures upsert idempotency
- Timestamps from `TimestampMixin` (created_at, updated_at auto-managed)

## Test Coverage
File: `tests/test_sku_mappings.py` (25 comprehensive tests)

### Critical Tests
- **`test_create_mapping_persists`** — Verifies mapping saved to database with correct fields
- **`test_upsert_update_existing_mapping`** — Confirms UPDATE on duplicate source_key (same ID)
- **`test_source_key_normalization`** — Validates lowercase, trim, space-collapse
- **`test_upsert_normalization_on_existing`** — Ensures normalized match finds existing record
- **`test_scope_isolation`** — Verifies mappings scoped to subdivision (multi-tenant safety)

### Additional Coverage
- Validation: required fields, enum types, confidence range (0..1)
- Optional fields: confidence and confirmed_by can be null
- Authentication: requires active auth and subdivision context
- Error cases: empty source_key, invalid method type, missing fields
- Multi-record: multiple mappings with different source_keys coexist
- Isolation: same source_key in different subdivisions creates separate records

## Changes Made

### New Files
- `tests/test_sku_mappings.py` — 25 tests for the endpoint

### Modified Files
- `app/api/v1/routes/ingredients.py`:
  - Added imports: `uuid`, `datetime`, `HTTPException`, `BaseModel`, `Field`
  - Added `CreateMappingRequest` Pydantic model
  - Added `MappingResponse` Pydantic model
  - Added `create_or_update_mapping()` endpoint handler

## Verification
- ✅ Syntax: `python -m py_compile app/api/v1/routes/ingredients.py tests/test_sku_mappings.py`
- ✅ Models imported correctly from `app.db.models`
- ✅ TenantContext dependency available
- ✅ Database session dependency available

## Related Documentation
- Database schema: `app/db/models.py` lines 439-470
- Auth context: `app/auth/dependencies.py` (TenantContext)
- API structure: `app/api/v1/router.py`
