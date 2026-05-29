# Local OS — Invoice Import Module — Build Specification

> **Document type:** Architectural specification for Claude Code agent
> **Target reader:** AI coding agent (Claude in Claude Code or similar)
> **Project version:** MVP-1 (single feature, local-only)
> **Last updated:** May 2026

---

## 1. Mission

Build a **local-only web application** that helps a single user (a coffee shop owner) import paper/digital invoices from suppliers into Esupl POS system **faster and with less manual work**. The user photographs an invoice; the system recognizes it via Claude Vision API; the system maps recognized line items to Esupl SKUs; the user reviews and confirms; the system posts the receipt to Esupl via API.

This is **MVP-1**: minimum viable product, single user, no authentication, runs on the user's computer via Docker Compose. Future modules will extend this codebase — design accordingly, but **do not implement future features now**.

---

## 2. Non-goals (do not build these)

These are explicitly **out of scope** for this specification. Do not add them even if they seem useful:

- ❌ User authentication (no login, no JWT, no sessions). One implicit user.
- ❌ Multi-tenant infrastructure (single user, single database scope).
- ❌ Mobile app or Telegram bot. Web UI only.
- ❌ Background job processing (Celery, queues). All operations are synchronous.
- ❌ Supplier price comparison. Just store what we receive in invoices.
- ❌ Sales analytics, competitor analysis, weather context. Future modules.
- ❌ Production deployment, HTTPS, CDN. Local development only.
- ❌ Email notifications, SMS, push notifications.
- ❌ Admin panel. SQL via DBeaver/psql is sufficient.
- ❌ User-facing settings UI (only `.env` configuration).
- ❌ Internationalization. Russian language for UI labels, English for code.

---

## 3. Tech stack (fixed, do not substitute)

### Backend
- **Language:** Python 3.12+
- **Framework:** FastAPI (latest stable)
- **ORM:** SQLAlchemy 2.0+ async
- **Migrations:** Alembic
- **Validation:** Pydantic v2
- **Anthropic SDK:** `anthropic` (latest)
- **HTTP client:** `httpx` async
- **Image handling:** `Pillow`
- **Vector search:** `pgvector` Python bindings
- **Logging:** `structlog`
- **Testing:** `pytest` + `pytest-asyncio`
- **Linting/formatting:** `ruff`

### Frontend
- **Framework:** React 18+
- **Build tool:** Vite (latest)
- **Language:** TypeScript 5+
- **CSS:** Tailwind CSS v4 (CSS-first config via `@theme`, no `tailwind.config.js`)
- **Plugin:** `@tailwindcss/vite`
- **State:** Redux Toolkit + RTK Query
- **Architecture:** Feature-Sliced Design (FSD)
- **Router:** React Router v6
- **Forms:** React Hook Form + Zod
- **Icons:** lucide-react

### Infrastructure
- **Database:** PostgreSQL 16 with pgvector extension
- **Containers:** Docker Compose
- **Reverse proxy:** None for MVP (frontend dev server proxies to backend)

---

## 4. Architecture overview

### 4.1 Modular monolith principle

Even though this is MVP-1 with a single feature, the codebase **must be structured as a modular monolith**. Future modules (supplier comparison, analytics, etc.) will be added later. Each functional module must:

- Live in its own directory (`app/modules/<name>/`)
- Have clear boundaries (its own router, service, schemas, models)
- Not import directly from other modules (use core abstractions)
- Be removable without breaking the rest of the app

For MVP-1, build **one module: `invoices`** that handles the entire invoice import flow.

Additionally, build core infrastructure that future modules will depend on (database, config, Esupl integration, Claude integration).

### 4.2 High-level data flow

```
[User] uploads photo through web UI
   ↓
[Frontend] POST /api/v1/invoices/upload (multipart/form-data)
   ↓
[Backend: invoices.router] receives file, calls service
   ↓
[Backend: invoices.service] saves file to ./uploads/, calls Claude Vision
   ↓
[Claude Vision API] returns structured JSON with line items
   ↓
[Backend: invoices.service] saves Invoice + InvoiceItem rows (status="draft")
   ↓
[Backend: mapping.service] for each item, tries to find existing mapping
   ↓
   - If mapping exists: auto-fill sku_id
   - If not: use pgvector semantic search to suggest top-3 SKUs
   ↓
[Backend] returns full Invoice with items, suggestions, original image regions
   ↓
[Frontend] renders review UI: original image + recognized items side-by-side
   ↓
[User] confirms/corrects mappings, edits quantities/prices if needed
   ↓
[Frontend] POST /api/v1/invoices/{id}/confirm with corrections
   ↓
[Backend: invoices.service] saves confirmed mappings to sku_mappings table
   ↓
[Backend: esupl.service] posts receipt to Esupl API
   ↓
[Backend] marks Invoice as status="esupl_synced", returns success
   ↓
[Frontend] shows confirmation, redirects to invoice list
```

### 4.3 Project structure

```
local-os/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
│
├── backend/
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI app, CORS, routers
│   │   ├── config.py               # Pydantic Settings, reads .env
│   │   ├── deps.py                 # FastAPI dependencies
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── db/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── base.py         # SQLAlchemy declarative base
│   │   │   │   ├── session.py      # Async session factory
│   │   │   │   └── mixins.py       # TimestampMixin
│   │   │   ├── logging.py          # structlog config
│   │   │   └── exceptions.py       # Custom exceptions, handlers
│   │   ├── integrations/
│   │   │   ├── __init__.py
│   │   │   ├── claude/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── client.py       # Anthropic client wrapper
│   │   │   │   └── vision.py       # OCR-specific logic
│   │   │   └── esupl/
│   │   │       ├── __init__.py
│   │   │       ├── client.py       # httpx-based API client
│   │   │       ├── schemas.py      # Pydantic models for Esupl responses
│   │   │       └── service.py      # Business logic: sync SKUs, post receipt
│   │   └── modules/
│   │       └── invoices/
│   │           ├── __init__.py
│   │           ├── router.py       # FastAPI router
│   │           ├── service.py      # Business logic
│   │           ├── schemas.py      # Pydantic API schemas
│   │           ├── models.py       # SQLAlchemy models
│   │           ├── mapping.py      # SKU mapping logic
│   │           └── prompts.py      # Claude Vision prompts
│   ├── scripts/
│   │   ├── init_db.py              # Create DB schema
│   │   └── sync_esupl.py           # Initial sync of SKUs and suppliers from Esupl
│   └── tests/
│       ├── conftest.py
│       ├── test_invoices.py
│       └── test_mapping.py
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    ├── Dockerfile.dev
    └── src/
        ├── main.tsx
        ├── index.css              # Tailwind v4 imports + @theme
        ├── app/
        │   ├── App.tsx
        │   ├── providers/
        │   │   ├── StoreProvider.tsx
        │   │   └── RouterProvider.tsx
        │   ├── router/
        │   │   └── index.tsx
        │   └── store/
        │       └── index.ts        # Redux store config
        ├── pages/
        │   ├── invoices-list/
        │   │   ├── index.ts
        │   │   └── ui/
        │   │       └── InvoicesListPage.tsx
        │   ├── invoice-upload/
        │   │   ├── index.ts
        │   │   └── ui/
        │   │       └── InvoiceUploadPage.tsx
        │   └── invoice-review/
        │       ├── index.ts
        │       └── ui/
        │           └── InvoiceReviewPage.tsx
        ├── features/
        │   └── invoice-import/
        │       ├── index.ts        # Public API
        │       ├── api/
        │       │   └── invoicesApi.ts    # RTK Query endpoints
        │       ├── model/
        │       │   └── types.ts
        │       └── ui/
        │           ├── InvoiceUploadDropzone.tsx
        │           ├── InvoiceReviewTable.tsx
        │           ├── InvoiceItemRow.tsx
        │           └── SkuMappingSelector.tsx
        ├── entities/
        │   ├── invoice/
        │   │   ├── index.ts
        │   │   └── model/
        │   │       └── types.ts
        │   ├── sku/
        │   │   └── ...
        │   └── supplier/
        │       └── ...
        └── shared/
            ├── api/
            │   └── baseApi.ts      # RTK Query base config
            ├── lib/
            │   └── ...
            ├── ui/                 # Reusable primitives (Button, Input, etc.)
            └── config/
                └── env.ts          # Read VITE_* env vars
```

---

## 5. Database schema

Use Alembic for migrations. Generate one initial migration that creates all tables below.

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Suppliers (synced from Esupl)
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    esupl_id TEXT UNIQUE NOT NULL,           -- ID in Esupl
    name TEXT NOT NULL,
    contact_info JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_suppliers_active ON suppliers(is_active);

-- SKUs (synced from Esupl)
CREATE TABLE skus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    esupl_id TEXT UNIQUE NOT NULL,           -- ID in Esupl
    code TEXT,                                -- Article/SKU code if present
    name TEXT NOT NULL,                       -- "Молоко 2.5% 1л"
    unit TEXT NOT NULL,                       -- "л", "кг", "шт"
    category TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    name_embedding vector(1024),              -- Voyage embeddings via Anthropic
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_skus_active ON skus(is_active);
CREATE INDEX idx_skus_embedding ON skus USING ivfflat (name_embedding vector_cosine_ops) WITH (lists = 100);

-- Invoices (uploaded by user)
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identifying info (from OCR or manual)
    supplier_id UUID REFERENCES suppliers(id),
    supplier_name_raw TEXT,                   -- Whatever was in the invoice
    invoice_number TEXT,
    invoice_date DATE,
    total_amount NUMERIC(12, 2),
    currency TEXT DEFAULT 'BYN',
    
    -- File reference
    image_path TEXT NOT NULL,                 -- Path relative to /uploads/
    image_mime_type TEXT,
    
    -- OCR result
    raw_ocr_result JSONB,                     -- Full Claude Vision response
    ocr_processed_at TIMESTAMPTZ,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'draft',
        -- draft | confirmed | esupl_synced | error
    
    error_message TEXT,                       -- If status='error'
    
    confirmed_at TIMESTAMPTZ,
    esupl_synced_at TIMESTAMPTZ,
    esupl_document_id TEXT,                   -- Receipt ID in Esupl after sync
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(invoice_date DESC);

-- Invoice line items
CREATE TABLE invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    
    -- Raw data from OCR
    name_raw TEXT NOT NULL,                   -- "Зерно эфиопия Иргачеф 1кг"
    quantity NUMERIC(12, 3) NOT NULL,
    unit_raw TEXT,                            -- As written in invoice ("уп", "шт")
    price_per_unit NUMERIC(12, 2),
    total_price NUMERIC(12, 2),
    
    -- OCR metadata
    ocr_region JSONB,                         -- Bounding box {x, y, width, height} if available
    
    -- Mapping
    sku_id UUID REFERENCES skus(id),
    mapping_source TEXT,
        -- auto_from_history | semantic_search | manual | unmapped
    mapping_confidence FLOAT,                 -- For semantic search: similarity score
    
    position INTEGER NOT NULL,                -- Order in invoice
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

-- Saved mappings (the heart of the system)
CREATE TABLE sku_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    raw_name TEXT NOT NULL,                   -- Normalized name from invoice
    sku_id UUID NOT NULL REFERENCES skus(id),
    
    times_used INTEGER NOT NULL DEFAULT 1,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(supplier_id, raw_name)
);
CREATE INDEX idx_sku_mappings_lookup ON sku_mappings(supplier_id, raw_name);
```

**Notes on schema:**

- `raw_name` in `sku_mappings` must be **normalized** before storing/lookup: lowercase, trim whitespace, collapse multiple spaces to one. Otherwise "Молоко 2.5%" and "молоко  2.5%" won't match.
- `name_embedding` is `vector(1024)` because Voyage embeddings (recommended by Anthropic) are 1024-dimensional. If you use OpenAI text-embedding-3-small instead, change to 1536.
- `image_path` is relative to `./uploads/` (mounted as volume). Use UUID-based filenames to avoid collisions.

---

## 6. Backend implementation

### 6.1 Configuration

`app/config.py` reads from `.env`:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    
    # Database
    database_url: str
    
    # Anthropic
    anthropic_api_key: str
    claude_vision_model: str = "claude-sonnet-4-7"  # Use latest
    claude_embedding_model: str = "voyage-3"        # Via Voyage API
    
    # Esupl
    esupl_api_url: str
    esupl_api_key: str
    
    # App
    uploads_dir: str = "./uploads"
    cors_origins: list[str] = ["http://localhost:5173"]
    log_level: str = "INFO"
    
    # OCR
    ocr_max_image_size_mb: int = 10
    ocr_supported_mime_types: list[str] = [
        "image/jpeg", "image/png", "image/webp", "application/pdf"
    ]

settings = Settings()
```

### 6.2 Esupl integration

**Important:** Esupl API documentation must be obtained from the user before implementation. If unavailable at start, the agent should:

1. Create a stub interface `EsuplClient` with all required methods
2. Implement methods that raise `NotImplementedError("Esupl API contract not yet defined")`
3. Build the rest of the system around this interface
4. The user will provide the actual API specs later

Required interface (minimum):

```python
class EsuplClient:
    async def list_suppliers(self) -> list[EsuplSupplier]: ...
    async def list_skus(self) -> list[EsuplSku]: ...
    async def create_receipt(self, receipt: EsuplReceiptCreate) -> EsuplReceipt: ...
    async def health_check(self) -> bool: ...
```

For initial development without real API access, create a `MockEsuplClient` that returns realistic test data. Toggle via env var `ESUPL_USE_MOCK=true`.

### 6.3 Claude Vision OCR

`app/integrations/claude/vision.py` — the prompt must be very specific. Here is the **exact prompt to use** (do not modify it without testing):

```
You are an expert at extracting structured data from invoices and delivery notes (накладные) for a coffee shop in Belarus.

Extract the following information from the invoice image. Return ONLY valid JSON with no additional text.

Required output schema:
{
  "supplier_name": string | null,    // Name of the supplier organization
  "invoice_number": string | null,    // Invoice/document number  
  "invoice_date": string | null,      // ISO date format YYYY-MM-DD
  "currency": string,                  // "BYN", "USD", "EUR", "RUB"
  "items": [
    {
      "name": string,                  // Product name as written
      "quantity": number,              // Quantity (numeric)
      "unit": string,                  // Unit as written ("шт", "уп", "кг", "л", etc.)
      "price_per_unit": number,        // Unit price (numeric)
      "total_price": number            // Line total (numeric)
    }
  ],
  "total_amount": number | null,       // Invoice grand total
  "extraction_notes": string | null    // Any concerns: blurry text, multiple pages, etc.
}

Rules:
- If a value cannot be extracted with confidence, return null (do not guess).
- For Russian/Belarusian text, preserve original spelling — do not translate or normalize.
- Numbers must be returned as numbers, not strings. Use period as decimal separator.
- If the image shows multiple invoices, extract only the first one and add a note in extraction_notes.
- If the image is not an invoice, return all fields as null with explanation in extraction_notes.
```

Then in Python:

```python
async def extract_invoice_from_image(image_bytes: bytes, mime_type: str) -> dict:
    response = await anthropic_client.messages.create(
        model=settings.claude_vision_model,
        max_tokens=4096,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": mime_type,
                        "data": base64.b64encode(image_bytes).decode()
                    }
                },
                {
                    "type": "text",
                    "text": INVOICE_EXTRACTION_PROMPT
                }
            ]
        }]
    )
    # Parse JSON from response, handle errors
    raw_text = response.content[0].text
    return json.loads(raw_text)
```

### 6.4 Mapping logic

`app/modules/invoices/mapping.py`:

For each `InvoiceItem` after OCR:

```python
async def map_item_to_sku(
    session: AsyncSession,
    supplier_id: UUID,
    raw_name: str,
) -> MappingResult:
    """
    Returns MappingResult with one of:
    - source="auto_from_history" if previous mapping exists → high confidence
    - source="semantic_search" with top-3 SKU candidates → user must choose
    - source="unmapped" if no candidates found → user must select manually
    """
    normalized = normalize_name(raw_name)
    
    # 1. Check sku_mappings table
    existing = await session.execute(
        select(SkuMapping)
        .where(
            SkuMapping.supplier_id == supplier_id,
            SkuMapping.raw_name == normalized
        )
    )
    mapping = existing.scalar_one_or_none()
    if mapping:
        return MappingResult(
            source="auto_from_history",
            sku_id=mapping.sku_id,
            confidence=1.0,
            candidates=[mapping.sku_id]
        )
    
    # 2. Semantic search via pgvector
    embedding = await get_embedding(normalized)
    candidates = await session.execute(
        select(Sku, Sku.name_embedding.cosine_distance(embedding).label("distance"))
        .where(Sku.is_active == True)
        .order_by("distance")
        .limit(3)
    )
    rows = candidates.all()
    if rows:
        top_distance = rows[0].distance
        return MappingResult(
            source="semantic_search",
            sku_id=None,  # User must confirm
            confidence=1.0 - top_distance,  # Cosine similarity
            candidates=[r.Sku.id for r in rows]
        )
    
    return MappingResult(source="unmapped", sku_id=None, candidates=[])


def normalize_name(name: str) -> str:
    """Lowercase, trim, collapse whitespace."""
    return " ".join(name.lower().strip().split())
```

When the user confirms an invoice with manually-corrected mappings, **save each correction** to `sku_mappings` table:

```python
async def save_mappings_on_confirm(
    session: AsyncSession,
    invoice: Invoice,
    items: list[InvoiceItem]
):
    for item in items:
        if not item.sku_id:
            continue  # Skip unmapped
        
        normalized = normalize_name(item.name_raw)
        
        # Upsert (update times_used if exists)
        stmt = insert(SkuMapping).values(
            supplier_id=invoice.supplier_id,
            raw_name=normalized,
            sku_id=item.sku_id,
        ).on_conflict_do_update(
            index_elements=["supplier_id", "raw_name"],
            set_={
                "times_used": SkuMapping.times_used + 1,
                "last_used_at": func.now(),
                "sku_id": item.sku_id,  # Update if user changed it
            }
        )
        await session.execute(stmt)
```

### 6.5 API endpoints

All endpoints under `/api/v1`. JSON responses. Errors follow this format:

```json
{
  "error": {
    "code": "INVOICE_NOT_FOUND",
    "message": "Invoice with id <uuid> does not exist",
    "details": {}
  }
}
```

#### Required endpoints

**`GET /api/v1/health`**  
Returns `{"status": "ok"}`. Used by frontend on startup.

**`GET /api/v1/suppliers`**  
Returns list of all active suppliers. No pagination (we have ~10).

**`GET /api/v1/skus`**  
Returns list of all active SKUs. Query params: `q` (search by name, optional), `limit` (default 50).

**`POST /api/v1/invoices/upload`**  
Multipart upload of invoice image.  
Request: `file: UploadFile`, `supplier_id: UUID (optional)` (user can pre-select).  
Response: `Invoice` with items, mappings, and OCR results.  
Flow: save file → call Claude Vision → save Invoice + items → run mapping for each item → return result.  
Status after this: `draft`.

**`GET /api/v1/invoices`**  
List of all invoices. Query params: `status` (filter), `limit`, `offset`.

**`GET /api/v1/invoices/{id}`**  
Single invoice with items, mappings, image URL.

**`PATCH /api/v1/invoices/{id}/items/{item_id}`**  
Update a line item (correct sku_id, quantity, price, etc.).  
Request: partial `InvoiceItem` update.  
Response: updated `InvoiceItem`.

**`PATCH /api/v1/invoices/{id}`**  
Update invoice metadata (supplier_id, invoice_date, etc.).

**`POST /api/v1/invoices/{id}/confirm`**  
User confirms the invoice. This:
1. Validates all items have `sku_id` set
2. Saves mappings to `sku_mappings` table
3. Calls Esupl API to create receipt
4. Sets `status="esupl_synced"` if successful, `status="error"` if not  

Response: updated `Invoice` with new status.

**`DELETE /api/v1/invoices/{id}`**  
Soft delete (set `status="deleted"`). Only allowed if `status="draft"`.

**`GET /api/v1/uploads/{filename}`**  
Serve uploaded image (for review UI). Validate that filename matches an existing invoice (no directory traversal).

#### Pydantic schemas

```python
# Request schemas
class InvoiceUploadRequest(BaseModel):
    supplier_id: UUID | None = None

class InvoiceItemUpdate(BaseModel):
    sku_id: UUID | None = None
    quantity: Decimal | None = None
    price_per_unit: Decimal | None = None
    total_price: Decimal | None = None

class InvoiceUpdate(BaseModel):
    supplier_id: UUID | None = None
    invoice_date: date | None = None
    invoice_number: str | None = None
    total_amount: Decimal | None = None

# Response schemas
class SupplierResponse(BaseModel):
    id: UUID
    name: str
    is_active: bool

class SkuResponse(BaseModel):
    id: UUID
    name: str
    unit: str
    code: str | None
    category: str | None

class InvoiceItemResponse(BaseModel):
    id: UUID
    name_raw: str
    quantity: Decimal
    unit_raw: str | None
    price_per_unit: Decimal | None
    total_price: Decimal | None
    sku_id: UUID | None
    sku: SkuResponse | None  # Nested
    mapping_source: str | None
    mapping_confidence: float | None
    suggested_skus: list[SkuResponse] = []  # For semantic_search source
    ocr_region: dict | None
    position: int

class InvoiceResponse(BaseModel):
    id: UUID
    supplier_id: UUID | None
    supplier: SupplierResponse | None  # Nested
    supplier_name_raw: str | None
    invoice_number: str | None
    invoice_date: date | None
    total_amount: Decimal | None
    currency: str
    image_url: str  # /api/v1/uploads/<filename>
    status: str
    items: list[InvoiceItemResponse]
    error_message: str | None
    created_at: datetime
```

### 6.6 Initial setup script

`scripts/sync_esupl.py` — run once on first startup:

1. Fetch all suppliers from Esupl → upsert into `suppliers` table
2. Fetch all SKUs from Esupl → upsert into `skus` table
3. For each SKU, compute embedding from `name` → save to `name_embedding`

Run via: `docker compose run --rm backend python scripts/sync_esupl.py`

---

## 7. Frontend implementation

### 7.1 Tailwind v4 setup

**`vite.config.ts`:**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000'
    }
  }
})
```

**`src/index.css`:**

```css
@import "tailwindcss";

@theme {
  --color-brand: #2D5F3F;
  --color-brand-light: #4a8b4a;
  --color-warm: #c97a5f;
  --font-sans: "Inter", system-ui, sans-serif;
}
```

**Do NOT create `tailwind.config.js`** — Tailwind v4 uses CSS-first configuration.

### 7.2 FSD structure

Strict adherence to Feature-Sliced Design:

- **`shared`** — reusable primitives, no business logic
- **`entities`** — domain models (invoice, sku, supplier) — just types and minimal display components
- **`features`** — user-facing functionality (invoice-import)
- **`widgets`** — composite UI blocks (not needed for MVP-1, but keep folder)
- **`pages`** — route-level components
- **`app`** — providers, routing, store

Import rules:
- `shared` ← no imports from above
- `entities` ← only from `shared`
- `features` ← from `shared` and `entities`
- `widgets` ← from `shared`, `entities`, `features`
- `pages` ← from anything below
- `app` ← from anything

### 7.3 Routes

- `/` — redirect to `/invoices`
- `/invoices` — list of invoices (`InvoicesListPage`)
- `/invoices/upload` — upload form (`InvoiceUploadPage`)
- `/invoices/:id` — review/edit invoice (`InvoiceReviewPage`)

### 7.4 RTK Query

`src/shared/api/baseApi.ts`:

```typescript
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/v1' }),
  tagTypes: ['Invoice', 'Sku', 'Supplier'],
  endpoints: () => ({}),
});
```

`src/features/invoice-import/api/invoicesApi.ts`:

```typescript
import { baseApi } from '@/shared/api/baseApi';
import type { Invoice, InvoiceItem } from '@/entities/invoice';

export const invoicesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listInvoices: builder.query<Invoice[], { status?: string }>({
      query: (params) => ({ url: '/invoices', params }),
      providesTags: ['Invoice'],
    }),
    getInvoice: builder.query<Invoice, string>({
      query: (id) => `/invoices/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Invoice', id }],
    }),
    uploadInvoice: builder.mutation<Invoice, FormData>({
      query: (formData) => ({
        url: '/invoices/upload',
        method: 'POST',
        body: formData,
      }),
      invalidatesTags: ['Invoice'],
    }),
    updateInvoiceItem: builder.mutation<
      InvoiceItem,
      { invoiceId: string; itemId: string; data: Partial<InvoiceItem> }
    >({
      query: ({ invoiceId, itemId, data }) => ({
        url: `/invoices/${invoiceId}/items/${itemId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_r, _e, { invoiceId }) => [{ type: 'Invoice', id: invoiceId }],
    }),
    confirmInvoice: builder.mutation<Invoice, string>({
      query: (id) => ({
        url: `/invoices/${id}/confirm`,
        method: 'POST',
      }),
      invalidatesTags: ['Invoice'],
    }),
  }),
});

export const {
  useListInvoicesQuery,
  useGetInvoiceQuery,
  useUploadInvoiceMutation,
  useUpdateInvoiceItemMutation,
  useConfirmInvoiceMutation,
} = invoicesApi;
```

### 7.5 Key UI components

#### `InvoiceUploadPage`

Single drag-and-drop zone (or button to choose file). Optional dropdown to pre-select supplier. On submit:
1. Show loading state (Claude Vision takes 5-15 seconds)
2. On success → navigate to `/invoices/:id`
3. On error → show error message, allow retry

#### `InvoiceReviewPage` — most critical UI

Layout: **two-column split**.

**Left column (sticky):** original invoice image with zoom/pan controls. If `ocr_region` available for hovered/selected row, highlight the region.

**Right column:** editable table of items.

For each row, show:
- Original name (`name_raw`) — read-only
- Recognized quantity and unit — editable inline
- Recognized price — editable
- **SKU mapping selector** (the key UX):
  - If `mapping_source="auto_from_history"`: show SKU name with small "auto" badge, allow override
  - If `mapping_source="semantic_search"`: show dropdown with top-3 candidates pre-selected, allow choosing other SKU from full list
  - If `mapping_source="unmapped"`: show full SKU search/dropdown, required field

Above the table: editable header (supplier, date, invoice number, total).

Bottom action bar (sticky):
- "Сохранить черновик" (saves but doesn't post to Esupl) — secondary button
- "Подтвердить и записать в Esupl" — primary button, disabled if any item unmapped
- "Удалить" — destructive, only for draft

#### `InvoicesListPage`

Simple table:
- Date, supplier, total, status, actions
- Status badges with colors: `draft` (gray), `esupl_synced` (green), `error` (red)
- Click row → navigate to review page

### 7.6 UX details that matter

- **Image preview:** show thumbnail in list, full image in review. Use `<img>` with `loading="lazy"`.
- **Loading states:** every async action must have a visible loading state. Use Tailwind's `animate-pulse` for skeletons.
- **Error handling:** display errors inline (not as toasts that disappear). User must explicitly dismiss.
- **Numeric inputs:** use `inputMode="decimal"`, format on blur, validate on submit.
- **Russian labels:** all user-facing text in Russian. Code/comments in English.
- **No animations beyond essentials.** No fancy transitions. Speed > polish for MVP.

---

## 8. Docker Compose

**`docker-compose.yml`:**

```yaml
version: '3.9'

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: localos
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: localos
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U localos"]
      interval: 5s
      timeout: 3s
      retries: 10

  backend:
    build:
      context: ./backend
    environment:
      DATABASE_URL: postgresql+asyncpg://localos:${POSTGRES_PASSWORD}@postgres:5432/localos
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      ESUPL_API_URL: ${ESUPL_API_URL}
      ESUPL_API_KEY: ${ESUPL_API_KEY}
      ESUPL_USE_MOCK: ${ESUPL_USE_MOCK:-false}
      UPLOADS_DIR: /uploads
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
      - uploads_data:/uploads
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "5173:5173"
    command: npm run dev -- --host 0.0.0.0
    depends_on:
      - backend

volumes:
  postgres_data:
  uploads_data:
```

**`.env.example`:**

```bash
POSTGRES_PASSWORD=changeme
ANTHROPIC_API_KEY=sk-ant-...
ESUPL_API_URL=https://api.esupl.com/v1
ESUPL_API_KEY=...
ESUPL_USE_MOCK=true     # Set to false when real Esupl creds available
```

---

## 9. Acceptance criteria

This MVP is **done** when all of the following are true:

### Backend
- [ ] `docker compose up` starts all services without errors
- [ ] Database migrations apply cleanly on fresh DB
- [ ] `GET /api/v1/health` returns 200 OK
- [ ] `python scripts/sync_esupl.py` populates `suppliers` and `skus` (with mock data if real API unavailable)
- [ ] After sync, all SKUs have non-null `name_embedding`
- [ ] `POST /api/v1/invoices/upload` accepts an image, returns parsed invoice within 30 seconds
- [ ] Claude Vision response is correctly parsed into `Invoice` and `InvoiceItem` rows
- [ ] For each item, mapping logic runs: existing mapping found → auto-mapped; not found → semantic search returns top-3 candidates
- [ ] `POST /api/v1/invoices/{id}/confirm` saves mappings and posts to Esupl (or mock)
- [ ] Saved mappings are reused on subsequent invoices (auto-mapping works on second invoice from same supplier with same product name)
- [ ] Error states (Claude API fails, Esupl API fails, invalid file type) return clear error messages

### Frontend
- [ ] `npm run dev` starts without errors
- [ ] Tailwind v4 styling applied (test: a `bg-brand` element shows the configured green)
- [ ] `/invoices` page loads and shows list (empty initially)
- [ ] Drag-and-drop upload works on `/invoices/upload`
- [ ] Loading state shown during OCR processing
- [ ] Review page shows image + items side-by-side
- [ ] SKU mapping selector works for all three mapping sources (auto/semantic/unmapped)
- [ ] User can edit any field and save
- [ ] Confirm button disabled when items unmapped, enabled when all mapped
- [ ] After confirm, status changes to `esupl_synced` and is shown visually

### End-to-end test scenario

The agent must verify this scenario works manually:

1. Start fresh: `docker compose down -v && docker compose up -d`
2. Run `python scripts/sync_esupl.py` — verify suppliers and SKUs populated
3. Open `http://localhost:5173`
4. Navigate to `/invoices/upload`
5. Upload a test invoice image (provide one in `tests/fixtures/`)
6. Verify OCR extraction shown on review page
7. Verify auto-mapping for items with existing mappings (initially zero)
8. Manually map all items
9. Click "Подтвердить и записать в Esupl"
10. Verify status changes to `esupl_synced`
11. Upload the **same** invoice again (different filename)
12. Verify all items are auto-mapped this time (mapping table populated)

---

## 10. Implementation order (recommended)

The agent should implement in this order:

1. **Day 1: Skeleton**
   - Project structure (folders, configs)
   - Docker Compose with PostgreSQL
   - FastAPI app with `/health` endpoint
   - Vite + React + Tailwind v4 starter
   - Verify everything starts

2. **Day 2: Data layer**
   - SQLAlchemy models for all tables
   - Alembic initial migration
   - Pydantic schemas
   - Mock Esupl client with realistic data
   - `scripts/sync_esupl.py` with mock data

3. **Day 3: OCR pipeline**
   - Claude Vision integration
   - `POST /invoices/upload` endpoint
   - File storage in `./uploads/`
   - Test with real invoice image

4. **Day 4: Mapping logic**
   - Voyage embeddings integration
   - Semantic search via pgvector
   - `sku_mappings` table logic
   - Auto-mapping on repeated invoices

5. **Day 5: Frontend — list and upload**
   - RTK Query setup
   - Invoices list page
   - Upload page with drag-and-drop
   - Routing

6. **Day 6: Frontend — review page**
   - Image viewer
   - Editable items table
   - SKU mapping selector
   - Confirm flow

7. **Day 7: Polish**
   - Error handling
   - Loading states
   - Manual end-to-end testing
   - README with setup instructions

This is **7 days of focused work** for an experienced agent. Realistically: 10-14 calendar days.

---

## 11. Critical reminders

1. **The supplier-aware mapping is the heart of the system.** Without persistent mappings, the product has no value. Test this thoroughly: upload the same invoice twice, second time must require zero mapping effort.

2. **Russian language matters.** All user-facing text is in Russian. All code, comments, and logs are in English. Do not mix.

3. **Tailwind v4, not v3.** No `tailwind.config.js`. Use `@theme` in CSS. Use `@tailwindcss/vite` plugin.

4. **Esupl mock is acceptable for initial development**, but the interface must match reality once the user provides API specs. Plan accordingly.

5. **Keep it simple.** Do not add features not in this spec. Do not "improve" the UX with extra functionality. The user explicitly asked for minimum viable scope.

6. **Ask the user when unsure**, do not guess. Specifically: Esupl API contract, sample invoice for testing, exact business rules for edge cases.

---

## 12. What the user will provide

Before starting, the user must provide:

- `.env` file with `ANTHROPIC_API_KEY`
- (Optional) `ESUPL_API_URL` + `ESUPL_API_KEY` — if available; otherwise mock mode
- Esupl API documentation — at any point during development
- 5 sample invoice images for testing — at the start of OCR work
- Confirmation of expected unit/measurement handling per business case

---

## End of specification.
