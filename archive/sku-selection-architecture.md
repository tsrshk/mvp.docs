---
doc: sku-selection-architecture
title: "Дизайн SKU-selection (эпоха DEC-0011)"
status: archived
archived: 2026-07-15
archived_from: repo-root (d:/_work/mvp)
reason: "Решение кодифицировано в [[ADR-018]]/[[ADR-019]] и фичах; SSOT теперь там"
trust_tier: 3
---

> Архивировано 2026-07-15 из корня репозитория. Документ инертен — не читается как актуальный. Хранится для истории.
# SKU Selection Mechanism — Architecture Design

## Overview
Design for a flexible, extensible SKU selection system with factory pattern, live search dropdown, and intelligent grouping. Spans suppliers, ingredients, and products with org/subdivision awareness.

---

## 1. Factory Pattern: `SkuHandlerFactory`

### Purpose
Centralize creation of SKU-handling logic. Different entity types (suppliers, ingredients, products) have different selection contexts and grouping strategies. The factory abstracts these differences and ensures a single point of configuration.

### Design

```typescript
/**
 * Enum of handled entity types. Each has different resolution context:
 * - 'supplier': maps to POS supplier catalogue → lists all ingredients from that supplier
 * - 'ingredient': maps to POS SKU catalogue → groups by supplier, then all others
 * - 'product': maps to supplier product catalogue (future) → org/subdiv aware
 */
type SkuEntityType = 'supplier' | 'ingredient' | 'product'

/**
 * Context needed to resolve and filter SKUs for a given entity type.
 * org/subdivision scope is always present; the 'supplier' field is optional
 * (only set when a supplier is pre-selected, to enable grouping).
 */
interface SkuSelectionContext {
  entityType: SkuEntityType
  orgId: string
  subdivisionId: string
  /** Supplier ID, if one is already selected. Used for grouping results. */
  supplierId?: string
}

/**
 * Handler interface — every entity type implements these operations.
 * Created by the factory based on context.entityType.
 */
interface SkuHandler {
  /** Fetch all available SKUs for this context. Org/subdivision-scoped. */
  fetchSkus(): Promise<Sku[]>
  
  /** Fetch supplier product IDs that have been delivered before (history-based grouping). */
  fetchSupplierProductIds(supplierId: string): Promise<string[]>
  
  /** Live search: filter SKUs by query string. */
  searchSkus(skus: Sku[], query: string): Sku[]
  
  /** Group filtered results for rendering. */
  groupSkus(
    skus: Sku[],
    supplierProductIds: Set<string>,
    options?: {
      /** If set, put these SKUs first. */
      prioritySkuIds?: string[]
      /** Locale for sorting. */
      locale?: string
    }
  ): GroupedSkus
}

/**
 * Grouped results, ready for rendering.
 * Group keys are defined per entity type (e.g., 'supplier', 'all', 'recent').
 */
interface GroupedSkus {
  groups: SkuGroup[]
  /** Total count across all groups (for empty-state UI). */
  totalCount: number
}

interface SkuGroup {
  /** Display label: 'Ингредиенты поставщика', 'Все', 'Недавно использованные' … */
  label: string
  /** Unique id for the group (for React keys, CSS classes, etc.). */
  id: string
  /** SKUs in this group, in order. */
  skus: Sku[]
  /** If true, this group should be expanded by default in multi-group renders. */
  isDefault?: boolean
}

/**
 * The factory: single entry point, returns the right handler based on context.
 */
class SkuHandlerFactory {
  static create(context: SkuSelectionContext): SkuHandler {
    switch (context.entityType) {
      case 'supplier':
        return new SupplierSkuHandler(context)
      case 'ingredient':
        return new IngredientSkuHandler(context)
      case 'product':
        return new ProductSkuHandler(context)
      default:
        throw new Error(`Unknown entity type: ${context.entityType}`)
    }
  }
}
```

### Handler Implementations

#### `IngredientSkuHandler` (current primary use case)
```typescript
class IngredientSkuHandler implements SkuHandler {
  private context: SkuSelectionContext
  private posProvider: PosProvider

  constructor(context: SkuSelectionContext) {
    this.context = context
    this.posProvider = getPosProvider(config)
  }

  async fetchSkus(): Promise<Sku[]> {
    // From POS provider (backend → ERP)
    // All SKUs in the org/subdiv, scoped by the backend auth
    return this.posProvider.listSkus()
  }

  async fetchSupplierProductIds(supplierId: string): Promise<string[]> {
    // From POS provider: which supplier-catalogue products this supplier has delivered
    // (used to group "items from this supplier" first)
    return this.posProvider.listSupplierProductIds(supplierId)
  }

  searchSkus(skus: Sku[], query: string): Sku[] {
    const q = query.toLowerCase().trim()
    if (!q) return skus

    return skus.filter((sku) => {
      const name = sku.name.toLowerCase()
      const unit = sku.unit.toLowerCase()
      return name.includes(q) || unit.includes(q)
    })
  }

  groupSkus(
    skus: Sku[],
    supplierProductIds: Set<string>,
    options?: { prioritySkuIds?: string[]; locale?: string }
  ): GroupedSkus {
    const groups: SkuGroup[] = []
    const supplierSkus: Sku[] = []
    const restSkus: Sku[] = []

    // Separate: supplier group, then the rest
    for (const sku of skus) {
      if (
        this.context.supplierId &&
        sku.productId &&
        supplierProductIds.has(sku.productId)
      ) {
        supplierSkus.push(sku)
      } else {
        restSkus.push(sku)
      }
    }

    // Sort each group alphabetically (by locale if provided)
    const collator = new Intl.Collator(options?.locale || 'en')
    const sortByName = (a: Sku, b: Sku) =>
      collator.compare(a.name, b.name)

    supplierSkus.sort(sortByName)
    restSkus.sort(sortByName)

    // Assemble groups
    if (supplierSkus.length > 0) {
      groups.push({
        id: 'supplier',
        label: 'Ингредиенты этого поставщика',
        skus: supplierSkus,
        isDefault: true,
      })
    }

    groups.push({
      id: 'all',
      label: supplierSkus.length > 0 ? 'Остальные ингредиенты' : 'Все ингредиенты',
      skus: restSkus,
      isDefault: supplierSkus.length === 0,
    })

    return {
      groups,
      totalCount: supplierSkus.length + restSkus.length,
    }
  }
}
```

#### `SupplierSkuHandler` (for future supplier selection)
```typescript
class SupplierSkuHandler implements SkuHandler {
  async fetchSkus(): Promise<Sku[]> {
    return this.posProvider.listSuppliers()
  }

  async fetchSupplierProductIds(): Promise<string[]> {
    // N/A for suppliers, return empty
    return []
  }

  searchSkus(skus: Sku[], query: string): Sku[] {
    const q = query.toLowerCase().trim()
    if (!q) return skus

    return skus.filter((supplier) => {
      const name = (supplier as any).name.toLowerCase()
      const unp = (supplier as any).unp?.toLowerCase()
      return name.includes(q) || (unp && unp.includes(q))
    })
  }

  groupSkus(skus: Sku[]): GroupedSkus {
    // Suppliers: no sub-grouping, just alphabetical
    const collator = new Intl.Collator('en')
    const sorted = [...skus].sort((a, b) =>
      collator.compare((a as any).name, (b as any).name)
    )

    return {
      groups: [
        {
          id: 'suppliers',
          label: 'Поставщики',
          skus: sorted,
          isDefault: true,
        },
      ],
      totalCount: sorted.length,
    }
  }
}
```

#### `ProductSkuHandler` (for future supplier-catalogue products)
```typescript
class ProductSkuHandler implements SkuHandler {
  async fetchSkus(): Promise<Sku[]> {
    // When linked to a supplier, fetch that supplier's products
    if (!this.context.supplierId) {
      throw new Error(
        'ProductSkuHandler requires supplierId in context'
      )
    }

    // From catalogue API (org/subdiv aware)
    return this.catalogueApi.listSupplierProducts(
      this.context.orgId,
      this.context.subdivisionId,
      this.context.supplierId
    )
  }

  searchSkus(skus: Sku[], query: string): Sku[] {
    const q = query.toLowerCase().trim()
    if (!q) return skus

    return skus.filter((sku) =>
      sku.name.toLowerCase().includes(q)
    )
  }

  groupSkus(skus: Sku[]): GroupedSkus {
    // Products from a single supplier: no sub-grouping
    return {
      groups: [
        {
          id: 'products',
          label: 'Товары поставщика',
          skus,
          isDefault: true,
        },
      ],
      totalCount: skus.length,
    }
  }
}
```

---

## 2. Dropdown Component: `SkuDropdown`

### Architecture
A reusable dropdown component that:
- Accepts a `SkuHandler` instance (created by factory)
- Manages internal search state
- Detects supplier selection from Redux
- Renders grouped results
- Handles keyboard navigation, click-outside, focus management

### Component Structure

```typescript
/**
 * Props for the dropdown.
 * The handler is created outside (by the feature code) and passed in,
 * so the component stays focused on UI.
 */
interface SkuDropdownProps {
  value: string | null
  handler: SkuHandler
  supplierProductIds: Set<string>
  invalid?: boolean
  placeholder?: string
  onPick: (skuId: string | null) => void
  onCreate?: () => void
  className?: string
}

/**
 * Internal state, managed by the component.
 */
interface SkuDropdownState {
  isOpen: boolean
  searchQuery: string
  allSkus: Sku[]
  filteredSkus: Sku[]
  groupedResults: GroupedSkus
  selectedIndex: number | null
}

/**
 * Pseudocode for the dropdown component:
 * 1. Load all SKUs on mount (via handler.fetchSkus())
 * 2. On search: filter via handler.searchSkus()
 * 3. On grouping: handler.groupSkus()
 * 4. Render grouped results with proper structure
 * 5. Keyboard nav: arrow up/down, enter, escape
 * 6. Click outside to close
 */
export function SkuDropdown({
  value,
  handler,
  supplierProductIds,
  invalid = false,
  placeholder = 'Выберите товар…',
  onPick,
  onCreate,
  className = '',
}: SkuDropdownProps) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // ===== Lifecycle: load SKUs on mount =====
  useEffect(() => {
    (async () => {
      try {
        const allSkus = await handler.fetchSkus()
        dispatch({ type: 'SKUS_LOADED', payload: allSkus })
      } catch (err) {
        dispatch({
          type: 'ERROR',
          payload: err instanceof Error ? err.message : 'Failed to load SKUs',
        })
      }
    })()
  }, [handler])

  // ===== Live search: filter and regroup on query change =====
  useEffect(() => {
    if (state.allSkus.length === 0) return

    const filtered = handler.searchSkus(state.allSkus, state.searchQuery)
    const grouped = handler.groupSkus(filtered, supplierProductIds)

    dispatch({
      type: 'SEARCH_RESULTS',
      payload: { filtered, grouped },
    })
  }, [state.searchQuery, state.allSkus, handler, supplierProductIds])

  // ===== Click outside to close =====
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        dispatch({ type: 'CLOSE' })
      }
    }

    if (state.isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () =>
        document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [state.isOpen])

  // ===== Render =====
  const selectedSku = state.allSkus.find((s) => s.id === value)

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Input display */}
      <div
        className={`cursor-text border rounded px-3 py-2 ${
          invalid ? 'border-warn bg-warn-soft text-warn' : ''
        } ${className}`}
        onClick={() => {
          dispatch({ type: 'OPEN' })
          inputRef.current?.focus()
        }}
      >
        {state.isOpen ? (
          <input
            ref={inputRef}
            type="text"
            value={state.searchQuery}
            onChange={(e) =>
              dispatch({
                type: 'SEARCH_QUERY_CHANGED',
                payload: e.target.value,
              })
            }
            onKeyDown={(e) => handleKeyDown(e, state, dispatch)}
            onBlur={() =>
              setTimeout(() => dispatch({ type: 'CLOSE' }), 150)
            }
            placeholder={placeholder}
            className="w-full border-none bg-transparent outline-none"
            autoFocus
          />
        ) : (
          <span className="block truncate">
            {selectedSku?.name || placeholder}
          </span>
        )}
      </div>

      {/* Dropdown list */}
      {state.isOpen && (
        <div className="absolute top-full left-0 right-0 z-10 mt-1 max-h-64 overflow-y-auto rounded border bg-white shadow-lg">
          {/* Empty state */}
          {state.groupedResults.totalCount === 0 && (
            <div className="px-3 py-2 text-center text-sm text-muted">
              {state.searchQuery
                ? 'Ничего не найдено'
                : 'Нет доступных товаров'}
            </div>
          )}

          {/* Create option (if no value selected) */}
          {!value && onCreate && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent-soft"
              onClick={() => {
                onCreate()
                dispatch({ type: 'CLOSE' })
              }}
            >
              ＋ Создать новый…
            </button>
          )}

          {/* Clear option (if value selected) */}
          {value && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent-soft"
              onClick={() => {
                onPick(null)
                dispatch({ type: 'CLOSE' })
              }}
            >
              — Очистить —
            </button>
          )}

          {/* Grouped results */}
          {state.groupedResults.groups.map((group) => (
            <div key={group.id}>
              {state.groupedResults.groups.length > 1 && (
                <div className="px-3 py-1.5 text-xs font-semibold text-muted uppercase">
                  {group.label}
                </div>
              )}
              {group.skus.map((sku) => (
                <button
                  key={sku.id}
                  type="button"
                  className={`w-full px-3 py-2.5 text-left text-sm hover:bg-accent-soft ${
                    value === sku.id
                      ? 'bg-accent-soft text-accent font-semibold'
                      : ''
                  }`}
                  onClick={() => {
                    onPick(sku.id)
                    dispatch({ type: 'CLOSE' })
                  }}
                >
                  <div className="font-medium">{sku.name}</div>
                  <div className="text-xs text-muted">{sku.unit}</div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ===== Keyboard handling =====
function handleKeyDown(
  e: React.KeyboardEvent<HTMLInputElement>,
  state: SkuDropdownState,
  dispatch: React.Dispatch<Action>
) {
  switch (e.key) {
    case 'Escape':
      dispatch({ type: 'CLOSE' })
      e.preventDefault()
      break

    case 'ArrowDown':
      // Move to next item in grouped results
      dispatch({ type: 'SELECT_NEXT' })
      e.preventDefault()
      break

    case 'ArrowUp':
      // Move to previous item
      dispatch({ type: 'SELECT_PREV' })
      e.preventDefault()
      break

    case 'Enter':
      // Pick currently selected item
      if (state.selectedIndex !== null) {
        const flattened = state.groupedResults.groups.flatMap(
          (g) => g.skus
        )
        const sku = flattened[state.selectedIndex]
        dispatch({ type: 'PICK', payload: sku.id })
      }
      e.preventDefault()
      break
  }
}
```

---

## 3. Grouping Logic

### Decision Tree: Detecting "Supplier Selected"

```typescript
/**
 * Where does the supplier come from?
 * 1. Redux invoice session: state.invoiceSession.supplier (manually selected)
 * 2. Redux SKU state: state.skus.selectedSupplierId (explicitly set for this picker)
 * 3. React context / prop: passed to the component
 *
 * Priority:
 * - If line's supplier is set → use it (most specific, explicit context)
 * - Else if Redux supplier selected → use it (most common case)
 * - Else: no grouping (show all, alphabetical)
 */

interface SupplierDetectionContext {
  /** Supplier ID from the invoice header (if selected). */
  invoiceSupplier?: Supplier
  /** Supplier ID from the line's own context (less common). */
  lineSupplier?: Supplier
  /** Supplier ID from Redux or component state. */
  selectedSupplierId?: string
}

/**
 * Resolve supplier ID for grouping.
 * Returns null if no supplier is selected.
 */
function resolveSupplierForGrouping(
  context: SupplierDetectionContext
): string | null {
  // Line supplier (most specific)
  if (context.lineSupplier?.id) {
    return context.lineSupplier.id
  }
  // Invoice supplier (common case)
  if (context.invoiceSupplier?.id) {
    return context.invoiceSupplier.id
  }
  // Explicit Redux state
  if (context.selectedSupplierId) {
    return context.selectedSupplierId
  }
  return null
}
```

### Grouping Algorithm (in Handler)

```typescript
/**
 * Grouping happens in two stages:
 *
 * Stage 1: Split by supplier (only if supplier is selected)
 *   - Items with productId ∈ supplierProductIds → "supplier group"
 *   - Everything else → "rest group"
 *
 * Stage 2: Sort within groups
 *   - Alphabetical by name (respecting locale)
 *   - Packings within each SKU are always in the SKU's order
 *
 * Result: GroupedSkus with proper labels and structure
 */

function groupSkusIntel(
  skus: Sku[],
  supplierId: string | null,
  supplierProductIds: Set<string>,
  locale: string = 'en'
): GroupedSkus {
  const groups: SkuGroup[] = []
  const collator = new Intl.Collator(locale)

  if (supplierId && supplierProductIds.size > 0) {
    // Two-group case: supplier + rest
    const supplierSkus = skus.filter(
      (sku) => sku.productId && supplierProductIds.has(sku.productId)
    )
    const restSkus = skus.filter(
      (sku) => !sku.productId || !supplierProductIds.has(sku.productId)
    )

    if (supplierSkus.length > 0) {
      supplierSkus.sort((a, b) => collator.compare(a.name, b.name))
      groups.push({
        id: 'supplier',
        label: 'Ингредиенты этого поставщика',
        skus: supplierSkus,
        isDefault: true,
      })
    }

    if (restSkus.length > 0) {
      restSkus.sort((a, b) => collator.compare(a.name, b.name))
      groups.push({
        id: 'rest',
        label: 'Остальные ингредиенты',
        skus: restSkus,
      })
    }
  } else {
    // Single group: all SKUs, alphabetical
    const sorted = [...skus].sort((a, b) =>
      collator.compare(a.name, b.name)
    )
    groups.push({
      id: 'all',
      label: 'Все ингредиенты',
      skus: sorted,
      isDefault: true,
    })
  }

  return {
    groups,
    totalCount: skus.length,
  }
}
```

---

## 4. Integration Points

### 4.1 Invoice Form → SKU Selection

```typescript
/**
 * Where SKU pickers live in the invoice workbench:
 * 1. Line table row/card (per-line picker)
 * 2. Future: quick-add widget
 *
 * Current usage (SkuSearchSelect in LineRow.tsx):
 */

export function LineRow({
  line,
  onSkuPick,
  supplierProductIds,
  // ... other props
}: LineRowProps) {
  const supplier = useAppSelector(
    (s) => s.invoiceSession.supplier
  )

  // Create handler context from invoice state
  const handlerContext: SkuSelectionContext = {
    entityType: 'ingredient',
    orgId: supplier?.id || 'unknown', // or from auth state
    subdivisionId: 'default', // or from org context
    supplierId: supplier?.id,
  }

  // Create handler once (memoize)
  const handler = useMemo(
    () => SkuHandlerFactory.create(handlerContext),
    [handlerContext]
  )

  return (
    <SkuDropdown
      value={line.skuId || null}
      handler={handler}
      supplierProductIds={supplierProductIds}
      onPick={(skuId) => onSkuPick(line.id, skuId)}
    />
  )
}
```

### 4.2 Supplier Selection → SKU Grouping

```typescript
/**
 * When user selects a supplier in the invoice header:
 * 1. Dispatch supplierSelected(supplier) → Redux
 * 2. All SKU dropdowns detect it via handler context
 * 3. Each dropdown re-groups results (supplier items first)
 *
 * Current flow (in sessionSlice):
 */

// In invoice header component:
const onSupplierSelect = (supplier: Supplier | null) => {
  dispatch(supplierSelected(supplier))

  // If supplier changed, load product IDs for grouping
  if (supplier) {
    ;(async () => {
      const handler = SkuHandlerFactory.create({
        entityType: 'ingredient',
        orgId: auth.orgId,
        subdivisionId: auth.subdivisionId,
        supplierId: supplier.id,
      })
      const productIds = await handler.fetchSupplierProductIds(
        supplier.id
      )
      // Dispatch to Redux so all pickers re-group
      dispatch(supplierProductIdsLoaded(productIds))
    })()
  }
}
```

### 4.3 Org/Subdivision Scope

```typescript
/**
 * Every handler is scoped to org + subdivision.
 * This ensures:
 * - SKUs returned by handler.fetchSkus() are only for this org/subdiv
 * - Backend auth validates scope via session cookie
 * - Supplier product IDs are also scoped (ERP owns the data)
 *
 * Handler receives scope in context:
 */

interface SkuSelectionContext {
  entityType: SkuEntityType
  orgId: string // ← scopes the data fetch
  subdivisionId: string // ← further scopes within org
  supplierId?: string
}

// Implementation (IngredientSkuHandler):
async fetchSkus(): Promise<Sku[]> {
  // Backend request is scoped by session cookie (no orgId in URL)
  // But handler stores org/subdiv for future multi-tenant scenarios
  return this.posProvider.listSkus()
}
```

### 4.4 Async Search & Caching

```typescript
/**
 * Caching strategy:
 * - SKUs are loaded once on component mount (via handler.fetchSkus())
 * - Search happens client-side (no API calls on every keystroke)
 * - Supplier product IDs are cached per supplier (loaded when supplier changes)
 *
 * The handler doesn't implement caching itself — that's the component's job.
 * The handler is a pure function for search/group logic.
 */

export function SkuDropdown({
  handler,
  // ...
}: SkuDropdownProps) {
  const [state, dispatch] = useReducer(reducer, {
    allSkus: [], // loaded once
    filteredSkus: [],
    searchQuery: '',
    isOpen: false,
  })

  // Load SKUs once on mount
  useEffect(() => {
    (async () => {
      const skus = await handler.fetchSkus()
      dispatch({ type: 'SKUS_LOADED', payload: skus })
    })()
  }, [handler]) // handler is stable, won't re-create often

  // Filter on every keystroke (client-side, instant)
  useEffect(() => {
    const filtered = handler.searchSkus(state.allSkus, state.searchQuery)
    dispatch({ type: 'FILTERED', payload: filtered })
  }, [state.searchQuery, state.allSkus, handler])

  // Grouping also client-side
  useEffect(() => {
    const grouped = handler.groupSkus(state.filteredSkus, supplierProductIds)
    dispatch({ type: 'GROUPED', payload: grouped })
  }, [state.filteredSkus, supplierProductIds, handler])

  // ...
}
```

---

## 5. Type Definitions & Interfaces (Complete)

### Core Types (shared/pos/types.ts)
```typescript
/** SKU (ingredient) — unchanged from current code. */
export interface Sku {
  id: string
  name: string
  unit: string
  packings?: SkuPacking[]
  unitId?: string
  productId?: string // ← key to supplier grouping
}

export interface SkuPacking {
  name: string
  factor: number
  isDefault: boolean
}

export interface Supplier {
  id: string
  name: string
  unp?: string
}

// (existing types: Warehouse, Unit, PreparedInvoice, etc.)
```

### Factory & Handler Types (shared/sku/factory.ts)
```typescript
type SkuEntityType = 'supplier' | 'ingredient' | 'product'

interface SkuSelectionContext {
  entityType: SkuEntityType
  orgId: string
  subdivisionId: string
  supplierId?: string
}

interface SkuHandler {
  fetchSkus(): Promise<Sku[]>
  fetchSupplierProductIds(supplierId: string): Promise<string[]>
  searchSkus(skus: Sku[], query: string): Sku[]
  groupSkus(
    skus: Sku[],
    supplierProductIds: Set<string>,
    options?: {
      prioritySkuIds?: string[]
      locale?: string
    }
  ): GroupedSkus
}

interface SkuGroup {
  label: string
  id: string
  skus: Sku[]
  isDefault?: boolean
}

interface GroupedSkus {
  groups: SkuGroup[]
  totalCount: number
}

class SkuHandlerFactory {
  static create(context: SkuSelectionContext): SkuHandler
}
```

### Dropdown Component Types (features/lines-table/ui/SkuDropdown.tsx)
```typescript
interface SkuDropdownProps {
  value: string | null
  handler: SkuHandler
  supplierProductIds: Set<string>
  invalid?: boolean
  placeholder?: string
  onPick: (skuId: string | null) => void
  onCreate?: () => void
  className?: string
}

interface SkuDropdownState {
  isOpen: boolean
  searchQuery: string
  allSkus: Sku[]
  filteredSkus: Sku[]
  groupedResults: GroupedSkus
  selectedIndex: number | null
  error?: string
}

type SkuDropdownAction =
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'SEARCH_QUERY_CHANGED'; payload: string }
  | { type: 'SKUS_LOADED'; payload: Sku[] }
  | { type: 'SEARCH_RESULTS'; payload: { filtered: Sku[]; grouped: GroupedSkus } }
  | { type: 'SELECT_NEXT' }
  | { type: 'SELECT_PREV' }
  | { type: 'PICK'; payload: string | null }
  | { type: 'ERROR'; payload: string }
```

### Redux Integration Types (entities/sku/model/types.ts)
```typescript
interface SkusState {
  items: Sku[]
  selectedSupplierId: string | null
  searchQuery: string
  supplierProductIds: Set<string>
  loading: boolean
  error?: string
}

// Actions (in skusSlice):
export const {
  skusLoaded,
  supplierSelected,
  supplierProductIdsLoaded,
  searchQueryChanged,
  searchCleared,
} = skusSlice.actions

// Selectors:
export const selectAllSkus = (state: RootState) => state.skus.items
export const selectSelectedSupplierId = (state: RootState) =>
  state.skus.selectedSupplierId
export const selectSearchQuery = (state: RootState) => state.skus.searchQuery
export const selectFilteredSkus = (
  state: RootState,
  supplierProductIds?: Set<string>
) => {
  // ... filtering logic
}
```

---

## 6. Migration Path: Current → New Architecture

### Phase 1: Factory & Handler Interfaces
1. Create `shared/sku/factory.ts` with base `SkuHandler` interface
2. Implement `IngredientSkuHandler` (mirrors current `SkuSelect` + `SkuSearchSelect` logic)
3. Keep existing components working (no breaking changes)

### Phase 2: New Dropdown Component
1. Create `SkuDropdown` component using factory
2. Run side-by-side with old `SkuSearchSelect`
3. Migrate line table incrementally (feature flag or gradual rollout)

### Phase 3: Supplier & Product Handlers
1. Add `SupplierSkuHandler` (for future multi-step suppliers picker)
2. Add `ProductSkuHandler` (for supplier-catalogue products)
3. Reuse same `SkuDropdown` component with different handler

### Phase 4: Redux Integration
1. Extend `skusSlice` with supplier product IDs
2. Connect handler to Redux for automatic re-grouping on supplier change
3. Cache supplier product IDs per session

---

## 7. Example: Line Card SKU Selection (Current Use Case)

```typescript
// In LineCard.tsx (mobile view):
export function LineCard({
  line,
  onSkuPick,
  supplierProductIds,
  // ...
}: LineCardProps) {
  const supplier = useAppSelector((s) => s.invoiceSession.supplier)
  const allSkus = useAppSelector((s) => s.skus.items)

  // Create handler context
  const handlerContext: SkuSelectionContext = useMemo(
    () => ({
      entityType: 'ingredient',
      orgId: useAuth().orgId,
      subdivisionId: useAuth().subdivisionId,
      supplierId: supplier?.id,
    }),
    [supplier?.id]
  )

  // Create handler (stable, won't re-render if context didn't change)
  const handler = useMemo(
    () => SkuHandlerFactory.create(handlerContext),
    [handlerContext]
  )

  return (
    <div className="p-4 border rounded-lg">
      <div className="mb-3">
        <label className="text-xs font-semibold text-muted">Товар</label>
        <SkuDropdown
          value={line.skuId || null}
          handler={handler}
          supplierProductIds={supplierProductIds}
          invalid={line.errors?.includes('skuId')}
          onPick={(skuId) => onSkuPick(line.id, skuId)}
          className="mt-1 w-full"
        />
      </div>
      {/* Other line fields... */}
    </div>
  )
}
```

---

## 8. Rationale & Design Decisions

### Why Factory Pattern?
- **Extensibility**: Adding a new entity type (e.g., 'product', 'ingredient-variant') is just a new handler class.
- **Testability**: Each handler can be tested in isolation; mock handlers for tests are trivial.
- **Decoupling**: Component doesn't know about specific entity logic; it just calls handler methods.

### Why Separate Search & Grouping?
- Search is independent of grouping strategy.
- A handler can search first, then group (filter → split → sort).
- Future: if supplier changes mid-search, grouping re-runs, but search results stay fresh.

### Why No Redux Caching in Handler?
- Handlers are stateless, just logic functions.
- Caching belongs in the component (useEffect) or a caching layer (React Query, SWR).
- Redux holds the current state (supplier selection, search query); components drive the handlers.

### Why Org/Subdiv Scope in Context?
- Future multi-tenant scenarios; the backend will filter SKUs by scope.
- For now, backend auth is per-org via cookie, so scope is implicit.
- Passing it explicitly makes it obvious that scoping happens.

### Why Dropdown Handles Keyboard Nav?
- Better accessibility and UX (arrow keys to navigate, Enter to pick).
- Matches common patterns (native `<select>`, search UIs).
- Future: support for custom keybindings via settings.

---

## 9. Open Questions & Future Enhancements

1. **Async Search**: Should search be async (e.g., server-side for huge catalogues)?
   - Current: client-side (instant, no lag).
   - Future: if SKU count > 10k, consider server-side search or local indexing.

2. **Fuzzy Matching**: Should "ящ" match "ящик" or just substring?
   - Current: substring (name.includes(query)).
   - Future: Fuse.js for fuzzy search, user preference (Settings).

3. **Recent Picks**: Should recently selected SKUs appear first?
   - Current: no, just supplier group + alphabetical.
   - Future: prioritySkuIds parameter in groupSkus() already supports this.

4. **SKU Creation**: Should new ingredient creation happen in a modal or inline?
   - Current: stubbed (CREATE_SKU sentinel).
   - Future: linked to the "new ingredient" API endpoint (not yet built).

5. **Packings UI**: Should packings be shown as sub-options in the dropdown?
   - Current: hidden, default packing auto-applied on selection.
   - Future: might show packings for advanced users, controlled by settings.

---

## Summary

The architecture provides:
- **Factory pattern** for extensible SKU handling (ingredients, suppliers, products).
- **Reusable dropdown component** with live search, keyboard nav, accessibility.
- **Intelligent grouping** that detects supplier selection and prioritizes supplier items.
- **Clear integration points** for invoice form, Redux, org/subdivision scoping.
- **Testable, stateless handlers** that are easy to mock and extend.

The design is backward-compatible: existing `SkuSelect` and `SkuSearchSelect` can coexist with the new `SkuDropdown` during migration.
