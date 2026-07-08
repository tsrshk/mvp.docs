# VER-021: Esupl pos_ingredient_id Durability Gate Test

**Status:** GATE TEST — blocks all downstream work (PRE-2) until confirmed.  
**Team ID:** 17957 (Esupl sandbox)  

> **Runnable probe:** `mvp.be/scripts/ver021_durability_probe.py` implements S1–S3 (create →
> edit(rename/unit/rate) → delete → recreate) with a hard sandbox-only guard. It refuses to run
> without `VER021_CONFIRM=yes-write-to-sandbox-17957` (writes are outward-facing). It prints the
> «operation → id before/after» table + a DURABLE/NOT-DURABLE verdict, then cleans up.
> **T1 owner (Ivan) runs it** and pastes the table into `01_ARCHITECTURE.md` (VER-021 section) and
> the PR evidence bundle. Until then, merge stays gated (DoD T1).

**Target:** Verify that Esupl ingredient IDs remain stable under mutation (edit, delete+recreate, split/merge scenarios).

---

## Test Objective

Establish whether `pos_ingredient_id` (Esupl ingredient ID) exhibits **durability** — i.e., does it:
- Persist unchanged when the ingredient record is edited (name, unit, category)?
- Reuse the same ID after delete + recreate?
- Fragment/merge when split or merged (if supported)?

**Acceptance Criteria:**
- **PASS (proceed to PRE-2):** ID is durable across all scenarios (persists on edit, reuses on recreate).
- **FAIL (STOP, escalate):** ID changes on edit, or cannot be reused after delete.

---

## Prerequisites

1. **Esupl Team 17957 access** with API token (read + write enabled via `ERP_WRITE_ENABLED=true`)
2. **Test ingredients created in sandbox** (not production)
3. **API Base URL:** `https://api.esupl.com/v1`
4. **Authorization:** Bearer token from `mvp.fe/.env` → `VITE_ESUPL_API_TOKEN`
5. **No writes to production team** (verify team_id=17957 before each request)

---

## Test Scenarios

### Scenario 1: Create Ingredient, Record ID

**Steps:**
1. POST to `/teams/17957/ingredients`
   ```json
   {
     "name": "Test Ingredient VER-021-S1",
     "product_id": <valid_product_id_in_sandbox>,
     "unit_id": <valid_unit_id>,
     "conversion_rate": 1.0
   }
   ```
2. Record the returned `id` → **`CREATED_ID_S1`**
3. GET `/teams/17957/ingredients/{CREATED_ID_S1}` → verify name and metadata

**Acceptance:**
- Status 201 or 200 (create successful)
- Response contains `id` field (non-null)
- GET retrieves the ingredient

**Data to Log:**
- `CREATED_ID_S1` (string or int)
- Timestamp, response status, full response body

---

### Scenario 2: Edit Ingredient, Verify ID Persistence

**Steps:**
1. Issue PUT to `/teams/17957/ingredients/{CREATED_ID_S1}` (same ID from S1)
   ```json
   {
     "name": "Test Ingredient VER-021-S1-RENAMED",
     "product_id": <same_or_different_product_id>,
     "unit_id": <different_unit_id_if_available>,
     "conversion_rate": 1.5
   }
   ```
2. Verify response status (200 or similar)
3. GET `/teams/17957/ingredients/{CREATED_ID_S1}` → confirm:
   - `id` field = **`CREATED_ID_S1`** (unchanged)
   - `name` field = "Test Ingredient VER-021-S1-RENAMED"
   - `unit_id` changed (if provided)

**Acceptance:**
- ID does NOT change after PUT
- New values reflected in GET

**Result Interpretation:**
- **✓ DURABLE:** ID unchanged → continue
- **✗ NON-DURABLE:** ID changed or endpoint returns new ID → FAIL scenario

**Data to Log:**
- PUT request body
- Response status and returned ID
- GET confirmation ID
- Timestamp

---

### Scenario 3: Delete & Recreate, Check ID Reuse

**Steps:**
1. DELETE `/teams/17957/ingredients/{CREATED_ID_S1}`
   - Verify 204 or 200 (success)
2. GET `/teams/17957/ingredients/{CREATED_ID_S1}` → expect 404 (ingredient gone)
3. POST to `/teams/17957/ingredients` with **identical payload from S1** (or similar):
   ```json
   {
     "name": "Test Ingredient VER-021-S1",
     "product_id": <same_as_S1>,
     "unit_id": <same_as_S1>,
     "conversion_rate": 1.0
   }
   ```
4. Record returned ID → **`RECREATED_ID_S1`**
5. Compare `RECREATED_ID_S1` vs `CREATED_ID_S1`

**Acceptance Criteria (3a: ID Reuse):**
- **✓ REUSED:** `RECREATED_ID_S1` == `CREATED_ID_S1` → Esupl reuses IDs (durable across lifecycle)
- **✗ NEW ID:** `RECREATED_ID_S1` != `CREATED_ID_S1` → Esupl issues new IDs (not reusable)

**Result Interpretation:**
- **Reuse OK:** If IDs are reused, callers can safely assume "same ingredient name/product = same ID" after recreation. ✓ DURABLE (variant: reuse)
- **Never Reuse:** If IDs are never reused, callers must use external tracking or accept new IDs on recreation. ⚠ SEMI-DURABLE (safe for audit trail, risk for caching)
- **Inconsistent:** Some recreates reuse, some don't → ✗ NOT DURABLE (FAIL)

**Data to Log:**
- DELETE request + response status
- POST request body (should match S1)
- Response status and `RECREATED_ID_S1`
- Timestamp
- Comparison: `CREATED_ID_S1` vs `RECREATED_ID_S1` (equal? yes/no)

---

### Scenario 4: Use Ingredient in Menu Product (Optional, Validates Ref Integrity)

**Purpose:** Verify that ingredient ID is usable as a foreign key in menu products after edits.

**Steps:**
1. Create a menu product with ingredient reference:
   ```json
   POST /teams/17957/menu-products
   {
     "name": "Test Dish VER-021",
     "is_draft": false,
     "modifications": [
       {
         "name": "Standard",
         "ingredient_id": <CREATED_ID_S1>,
         "conversion_rate": 1,
         "unit_id": <unit_from_ingredient>,
         "retail_price": 10.0
       }
     ]
   }
   ```
2. Record returned menu product ID → **`MENU_PRODUCT_ID`**
3. GET `/teams/17957/menu-products/{MENU_PRODUCT_ID}?include=modifications.product`
4. Verify modification still references ingredient `CREATED_ID_S1` correctly

**Acceptance:**
- Menu product created (201 or 200)
- GET shows modification with ingredient_id = `CREATED_ID_S1`

**Result Interpretation:**
- ✓ DURABLE: ID is usable as FK in other entities → confirmed durable in practice

---

### Scenario 5: Category & Unit Changes (Extended Edit Test)

**Purpose:** Verify ID durability with systematic property changes.

**Steps:**
1. Create ingredient with category and base unit (S1)
2. Edit and change:
   - `name` → append " [v2]"
   - `unit_id` → different unit (if multiple available)
   - `ingredient_category_id` → different category (if applicable)
   - `conversion_rate` → different multiplier
3. GET full ingredient after each edit
4. Verify `id` unchanged after each property change

**Acceptance:**
- All edits succeed (200)
- ID stable across all property changes
- Metadata updates reflected

**Data to Log:**
- List of property changes per edit
- ID before/after each edit (all same)

---

### Scenario 6: Split/Merge (If Supported)

**Purpose:** Understand API behavior for complex ingredient mutations.

**Steps:**
1. Check Esupl API docs or attempt:
   - POST `/teams/17957/ingredients/{CREATED_ID_S1}/split` (if endpoint exists)
   - POST `/teams/17957/ingredients/{CREATED_ID_S1}/merge` (if endpoint exists)
2. If no such endpoints: **Note as "not supported"** and skip.
3. If supported:
   - Record any new IDs generated
   - Verify original ID status (persists, orphaned, deleted?)

**Acceptance:**
- If not supported: **N/A** (note in report)
- If supported:
  - Clearly document new ID generation rules
  - Note if original ID becomes unavailable

**Data to Log:**
- HTTP response (404 for unsupported endpoints)
- If supported: full mutation details

---

## Test Execution Steps

### Prerequisites Checklist
- [ ] Esupl team 17957 credentials available
- [ ] API token in `.env` or script
- [ ] Sandbox environment confirmed (not production)
- [ ] Tool for HTTP requests ready (curl, Postman, Python requests, Node.js fetch)

### Run Tests (Recommended Order)
1. **S1 + S2 + S3** (core durability: create → edit → delete/recreate)
2. **S4** (reference integrity check)
3. **S5** (extended edits)
4. **S6** (advanced features, if API supports)

### Execution Method Option A: Manual (Curl/Postman)

**Setup:**
```bash
export TEAM_ID="17957"
export BASE_URL="https://api.esupl.com/v1"
export TOKEN="<your_api_token>"
export HEADER_AUTH="Authorization: Bearer ${TOKEN}"
```

**Example S1 (Create):**
```bash
curl -X POST "${BASE_URL}/teams/${TEAM_ID}/ingredients" \
  -H "Content-Type: application/json" \
  -H "${HEADER_AUTH}" \
  -d '{
    "name": "Test Ingredient VER-021-S1",
    "product_id": 123,
    "unit_id": 17,
    "conversion_rate": 1.0
  }' | jq .
```

**Example S1 (Get):**
```bash
curl -X GET "${BASE_URL}/teams/${TEAM_ID}/ingredients/{CREATED_ID_S1}" \
  -H "${HEADER_AUTH}" | jq .
```

**Example S2 (Edit):**
```bash
curl -X PUT "${BASE_URL}/teams/${TEAM_ID}/ingredients/{CREATED_ID_S1}" \
  -H "Content-Type: application/json" \
  -H "${HEADER_AUTH}" \
  -d '{
    "name": "Test Ingredient VER-021-S1-RENAMED",
    "product_id": 123,
    "unit_id": 21,
    "conversion_rate": 1.5
  }' | jq .
```

**Example S3 (Delete):**
```bash
curl -X DELETE "${BASE_URL}/teams/${TEAM_ID}/ingredients/{CREATED_ID_S1}" \
  -H "${HEADER_AUTH}" -w "\nStatus: %{http_code}\n"
```

### Execution Method Option B: Python Script

```python
#!/usr/bin/env python3
import requests
import json
from datetime import datetime

BASE_URL = "https://api.esupl.com/v1"
TEAM_ID = "17957"
TOKEN = "<your_token>"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

results = {}

# S1: Create
print("\n=== SCENARIO 1: CREATE ===")
payload_s1 = {
    "name": "Test Ingredient VER-021-S1",
    "product_id": 123,
    "unit_id": 17,
    "conversion_rate": 1.0
}
resp = requests.post(f"{BASE_URL}/teams/{TEAM_ID}/ingredients", 
                     json=payload_s1, headers=headers)
print(f"Status: {resp.status_code}")
result_s1 = resp.json()
print(json.dumps(result_s1, indent=2))
CREATED_ID_S1 = result_s1.get("id")
results["S1_created_id"] = CREATED_ID_S1
results["S1_response"] = result_s1

# S1: Get to confirm
print(f"\n=== S1: GET Confirmation ===")
resp = requests.get(f"{BASE_URL}/teams/{TEAM_ID}/ingredients/{CREATED_ID_S1}", 
                    headers=headers)
print(f"Status: {resp.status_code}")
print(json.dumps(resp.json(), indent=2))

# S2: Edit
print(f"\n=== SCENARIO 2: EDIT ===")
payload_s2 = {
    "name": "Test Ingredient VER-021-S1-RENAMED",
    "product_id": 123,
    "unit_id": 21,
    "conversion_rate": 1.5
}
resp = requests.put(f"{BASE_URL}/teams/{TEAM_ID}/ingredients/{CREATED_ID_S1}", 
                    json=payload_s2, headers=headers)
print(f"Status: {resp.status_code}")
result_s2 = resp.json()
print(json.dumps(result_s2, indent=2))
AFTER_EDIT_ID = result_s2.get("id")
results["S2_after_edit_id"] = AFTER_EDIT_ID
results["S2_id_stable"] = (CREATED_ID_S1 == AFTER_EDIT_ID)
print(f"ID stable after edit? {CREATED_ID_S1 == AFTER_EDIT_ID}")

# S3: Delete
print(f"\n=== SCENARIO 3: DELETE ===")
resp = requests.delete(f"{BASE_URL}/teams/{TEAM_ID}/ingredients/{CREATED_ID_S1}", 
                       headers=headers)
print(f"Status: {resp.status_code}")
results["S3_delete_status"] = resp.status_code

# Verify deletion
resp = requests.get(f"{BASE_URL}/teams/{TEAM_ID}/ingredients/{CREATED_ID_S1}", 
                    headers=headers)
print(f"GET after delete - Status: {resp.status_code} (expect 404)")
results["S3_confirm_404"] = (resp.status_code == 404)

# S3: Recreate
print(f"\n=== S3: RECREATE ===")
resp = requests.post(f"{BASE_URL}/teams/{TEAM_ID}/ingredients", 
                     json=payload_s1, headers=headers)
print(f"Status: {resp.status_code}")
result_s3 = resp.json()
print(json.dumps(result_s3, indent=2))
RECREATED_ID_S1 = result_s3.get("id")
results["S3_recreated_id"] = RECREATED_ID_S1
results["S3_id_reused"] = (CREATED_ID_S1 == RECREATED_ID_S1)
print(f"\nID Reused? {CREATED_ID_S1 == RECREATED_ID_S1}")
print(f"  Original:  {CREATED_ID_S1}")
print(f"  Recreated: {RECREATED_ID_S1}")

# Summary
print(f"\n=== SUMMARY ===")
print(json.dumps({
    "created_id": results.get("S1_created_id"),
    "id_stable_after_edit": results.get("S2_id_stable"),
    "id_reused_after_recreate": results.get("S3_id_reused"),
    "delete_confirmed": results.get("S3_confirm_404"),
}, indent=2))

# Verdict
print(f"\n=== VERDICT ===")
if results.get("S2_id_stable") and results.get("S3_confirm_404"):
    if results.get("S3_id_reused"):
        print("✓ DURABLE (ID persists on edit, reuses on recreate)")
    else:
        print("⚠ SEMI-DURABLE (ID persists on edit, but NOT reused on recreate)")
        print("  → Safe for audit, risk for caching; escalate for clarification")
else:
    print("✗ NOT DURABLE (ID changes on edit or delete fails)")
    print("  → STOP — escalate to Esupl support")
```

### Execution Method Option C: Node.js Script

```javascript
const BASE_URL = "https://api.esupl.com/v1";
const TEAM_ID = "17957";
const TOKEN = process.env.ESUPL_API_TOKEN;

if (!TOKEN) {
  console.error("Error: ESUPL_API_TOKEN not set");
  process.exit(1);
}

const headers = {
  "Authorization": `Bearer ${TOKEN}`,
  "Content-Type": "application/json"
};

async function test() {
  const results = {};
  
  // S1: Create
  console.log("\n=== SCENARIO 1: CREATE ===");
  const payloadS1 = {
    name: "Test Ingredient VER-021-S1",
    product_id: 123,
    unit_id: 17,
    conversion_rate: 1.0
  };
  
  let resp = await fetch(
    `${BASE_URL}/teams/${TEAM_ID}/ingredients`,
    { method: "POST", headers, body: JSON.stringify(payloadS1) }
  );
  console.log(`Status: ${resp.status}`);
  let resultS1 = await resp.json();
  console.log(JSON.stringify(resultS1, null, 2));
  
  const CREATED_ID_S1 = resultS1.id;
  results.S1_created_id = CREATED_ID_S1;
  
  // S1: Get
  console.log(`\n=== S1: GET Confirmation ===`);
  resp = await fetch(
    `${BASE_URL}/teams/${TEAM_ID}/ingredients/${CREATED_ID_S1}`,
    { method: "GET", headers }
  );
  console.log(`Status: ${resp.status}`);
  console.log(JSON.stringify(await resp.json(), null, 2));
  
  // S2: Edit
  console.log(`\n=== SCENARIO 2: EDIT ===`);
  const payloadS2 = {
    name: "Test Ingredient VER-021-S1-RENAMED",
    product_id: 123,
    unit_id: 21,
    conversion_rate: 1.5
  };
  
  resp = await fetch(
    `${BASE_URL}/teams/${TEAM_ID}/ingredients/${CREATED_ID_S1}`,
    { method: "PUT", headers, body: JSON.stringify(payloadS2) }
  );
  console.log(`Status: ${resp.status}`);
  let resultS2 = await resp.json();
  console.log(JSON.stringify(resultS2, null, 2));
  
  const AFTER_EDIT_ID = resultS2.id;
  results.S2_after_edit_id = AFTER_EDIT_ID;
  results.S2_id_stable = (CREATED_ID_S1 === AFTER_EDIT_ID);
  console.log(`ID stable after edit? ${CREATED_ID_S1 === AFTER_EDIT_ID}`);
  
  // S3: Delete
  console.log(`\n=== SCENARIO 3: DELETE ===`);
  resp = await fetch(
    `${BASE_URL}/teams/${TEAM_ID}/ingredients/${CREATED_ID_S1}`,
    { method: "DELETE", headers }
  );
  console.log(`Status: ${resp.status}`);
  results.S3_delete_status = resp.status;
  
  // Verify 404
  resp = await fetch(
    `${BASE_URL}/teams/${TEAM_ID}/ingredients/${CREATED_ID_S1}`,
    { method: "GET", headers }
  );
  console.log(`GET after delete - Status: ${resp.status} (expect 404)`);
  results.S3_confirm_404 = (resp.status === 404);
  
  // S3: Recreate
  console.log(`\n=== S3: RECREATE ===`);
  resp = await fetch(
    `${BASE_URL}/teams/${TEAM_ID}/ingredients`,
    { method: "POST", headers, body: JSON.stringify(payloadS1) }
  );
  console.log(`Status: ${resp.status}`);
  let resultS3 = await resp.json();
  console.log(JSON.stringify(resultS3, null, 2));
  
  const RECREATED_ID_S1 = resultS3.id;
  results.S3_recreated_id = RECREATED_ID_S1;
  results.S3_id_reused = (CREATED_ID_S1 === RECREATED_ID_S1);
  
  console.log(`\nID Reused? ${CREATED_ID_S1 === RECREATED_ID_S1}`);
  console.log(`  Original:  ${CREATED_ID_S1}`);
  console.log(`  Recreated: ${RECREATED_ID_S1}`);
  
  // Summary
  console.log(`\n=== SUMMARY ===`);
  console.log(JSON.stringify({
    created_id: results.S1_created_id,
    id_stable_after_edit: results.S2_id_stable,
    id_reused_after_recreate: results.S3_id_reused,
    delete_confirmed: results.S3_confirm_404,
  }, null, 2));
  
  // Verdict
  console.log(`\n=== VERDICT ===`);
  if (results.S2_id_stable && results.S3_confirm_404) {
    if (results.S3_id_reused) {
      console.log("✓ DURABLE (ID persists on edit, reuses on recreate)");
    } else {
      console.log("⚠ SEMI-DURABLE (ID persists on edit, but NOT reused on recreate)");
      console.log("  → Safe for audit, risk for caching; escalate for clarification");
    }
  } else {
    console.log("✗ NOT DURABLE (ID changes on edit or delete fails)");
    console.log("  → STOP — escalate to Esupl support");
  }
}

test().catch(console.error);
```

---

## Acceptance Criteria & Decision Tree

### Outcome Matrix

| Scenario | Result | Implication |
|----------|--------|-------------|
| S1 + S2 + S3: ID stable on edit + delete 404 + ID reused on recreate | **PASS** | ✓ **DURABLE** → Proceed to PRE-2 |
| S1 + S2: ID stable on edit; S3: ID NOT reused (new ID) | **SEMI-PASS** | ⚠ **SEMI-DURABLE** → Escalate to Esupl for reuse semantics; may proceed with risk mitigation |
| S1 + S2: ID changes on edit OR S3: Delete fails | **FAIL** | ✗ **NOT DURABLE** → STOP, do not proceed; escalate to Esupl support |
| S4: Reference in menu product breaks | **FAIL** | ✗ **ID Not Referenceable** → STOP |
| S5: Any property change causes ID change | **FAIL** | ✗ **NOT DURABLE** → STOP |
| S6: Split/merge creates orphaned IDs | **FAIL** (if supported) | ✗ **ID Fragmentation** → STOP unless handled in app layer |

### Decision Gate

**PROCEED to PRE-2 if:**
- ✓ ID persists unchanged on edit (S2)
- ✓ Delete returns 404 (S3)
- ✓ ID reused on recreate with same payload (S3) **OR** documented and mitigated if not reused

**STOP & ESCALATE if:**
- ✗ ID changes on edit (S2 fails)
- ✗ Delete does not remove ingredient (S3 fails)
- ✗ Reference integrity broken (S4 fails)
- ✗ Behavior inconsistent across properties (S5 fails)

---

## Test Report Template

**Date:** `<test_date>`  
**Executor:** `<tester_name>`  
**Team ID:** 17957  
**API Version:** v1  

| Test Case | Input | Expected | Actual | Status | Notes |
|-----------|-------|----------|--------|--------|-------|
| S1 Create | POST /ingredients payload | 201, id=X | 201, id=X | ✓ PASS | X = 12345 |
| S1 Get | GET /ingredients/12345 | 200, name matches | 200, name matches | ✓ PASS | |
| S2 Edit | PUT /ingredients/12345 with name change | 200, id=12345 | 200, id=12345 | ✓ PASS | ID persists |
| S2 Verify | GET /ingredients/12345 | name updated | name updated | ✓ PASS | |
| S3 Delete | DELETE /ingredients/12345 | 204 or 200 | 204 | ✓ PASS | |
| S3 Confirm | GET /ingredients/12345 | 404 | 404 | ✓ PASS | Deletion confirmed |
| S3 Recreate | POST /ingredients same payload as S1 | 201, id=Y | 201, id=12345 | ✓ PASS | ID REUSED (Y == X) |
| S4 Ref | Menu product with ingredient_id=12345 | 200, ref valid | 200, ref valid | ✓ PASS | Ref integrity OK |
| S5 Category Change | PUT /ingredients/12345 category=2 | 200, id=12345 | 200, id=12345 | ✓ PASS | |
| S5 Unit Change | PUT /ingredients/12345 unit_id=21 | 200, id=12345 | 200, id=12345 | ✓ PASS | |
| S6 Split/Merge | POST /ingredients/12345/split (if exists) | 404 or valid | 404 | N/A | Not supported |

**Verdict:** `✓ DURABLE — Ready for PRE-2`

---

## Escalation Procedure (If FAIL)

If any test fails:

1. **Document failure clearly:**
   - Exact HTTP request (method, path, body)
   - Response status and body
   - Expected vs actual behavior
   - Timestamp

2. **Escalate to Esupl support:**
   - Reference this test plan (VER-021)
   - Include failure details + test report
   - Ask: "Is pos_ingredient_id durability guaranteed? Can IDs be reused after delete?"

3. **Interim risk mitigation (if SEMI-DURABLE):**
   - Cache ingredient mappings (name/product → ID) client-side
   - Track mutations in mvp.be (ingredient_mutations table)
   - Use external UUID mapping if ID reuse is unstable

4. **Block downstream:**
   - Do not proceed to PRE-2 until Esupl confirms durability contract
   - Implement workaround in backend before feature release

---

## Cleanup

After test completion:

1. **Delete test ingredients** from team 17957:
   ```bash
   curl -X DELETE "https://api.esupl.com/v1/teams/17957/ingredients/{CREATED_ID_S1}" \
     -H "Authorization: Bearer ${TOKEN}"
   ```

2. **Delete test menu products** (if created in S4):
   ```bash
   curl -X DELETE "https://api.esupl.com/v1/teams/17957/menu-products/{MENU_PRODUCT_ID}" \
     -H "Authorization: Bearer ${TOKEN}"
   ```

3. **Verify sandbox clean:** List ingredients and confirm test data gone:
   ```bash
   curl "https://api.esupl.com/v1/teams/17957/ingredients?filter[name]=VER-021" \
     -H "Authorization: Bearer ${TOKEN}" | jq '.data | length'
   ```

---

## References

- **Esupl API Docs:** `mvp.docs/api/esupl/menu.md` (ingredients endpoints)
- **mvp.be Esupl Provider:** `mvp.be/app/providers/erp/esupl.py` (integration code)
- **Memory:** Esupl API real access notes in memory/MEMORY.md
- **Gate Outcome:** Blocks PRE-2 if FAIL; permits PRE-2 if PASS

---

**Created:** 2026-07-08  
**Version:** 1.0  
**Status:** READY FOR EXECUTION
