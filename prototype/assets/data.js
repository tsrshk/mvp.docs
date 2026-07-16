/* =========================================================================
 * LCOS Prototype — mock data & formatting helpers
 * Single source of demo state for the clickable prototype.
 * Currency: BYN. Locale: ru-RU. Everything is in-memory (no backend).
 * ========================================================================= */

/* ---- formatting ---------------------------------------------------------- */
const fmtMoney = (n) =>
  Number(n ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n) =>
  Number(n ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};
const fmtDateLong = (iso) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const daysAgo = (iso) => Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
const relDate = (iso) => {
  const d = daysAgo(iso);
  if (d <= 0) return 'сегодня';
  if (d === 1) return 'вчера';
  if (d < 7) return `${d} дн. назад`;
  return fmtDate(iso);
};

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']; // 1..7

/* ---- supplier criteria registry (mirrors app/domain/supplier_criteria.py) */
const CRITERIA_SCHEMA = [
  { key: 'delivery_volume', label: 'Объём партии', kind: 'number', unit: 'ед./партия' },
  { key: 'delivery_lead_days', label: 'Срок поставки', kind: 'days', unit: 'дн.' },
  { key: 'delivery_weekdays', label: 'Дни доставки', kind: 'weekdays' },
  { key: 'payment_mode', label: 'Оплата', kind: 'choice',
    choices: [
      { value: 'prepay', label: 'Предоплата' },
      { value: 'on_delivery', label: 'По факту' },
      { value: 'deferred', label: 'Отсрочка' },
    ] },
  { key: 'payment_deferral_days', label: 'Отсрочка платежа', kind: 'days', unit: 'дн.' },
];

/* ---- invoice status machine (mirrors InvoiceStatus) ---------------------- */
const INVOICE_STATUS = {
  draft:     { label: 'Черновик',    tone: 'muted'  },
  validated: { label: 'Проверена',   tone: 'info'   },
  rejected:  { label: 'Отклонена',   tone: 'danger' },
  prepared:  { label: 'Готова к отправке', tone: 'accent' },
  written:   { label: 'Записана в POS', tone: 'good' },
  failed:    { label: 'Ошибка записи', tone: 'danger' },
};

/* ---- purchase order status machine (mirrors purchase_order_status) ------- */
const PO_STATUS = {
  draft:         { label: 'Черновик',   tone: 'muted'  },
  confirmed:     { label: 'Подтверждён', tone: 'accent' },
  sent_manually: { label: 'Отправлен',  tone: 'info'   },
  received:      { label: 'Получен',    tone: 'good'   },
  cancelled:     { label: 'Отменён',    tone: 'muted'  },
};

/* =========================================================================
 * Domain data
 * ========================================================================= */

const org = { name: 'Кофейня «Гранула»', subdivision: 'ул. Немига, 5', pos: 'Esupl' };

/* ---- ingredients (local catalog mirror of POS) --------------------------- */
const ingredients = [
  { id: 'ing-milk',   name: 'Молоко 3.2%, 1 л',            unit: 'л',  category: 'Молочка',   pack: { label: 'кор. × 12', factor: 12 }, stock: 9,   reorder: 24 },
  { id: 'ing-cream',  name: 'Сливки 33%, 1 л',             unit: 'л',  category: 'Молочка',   pack: { label: 'кор. × 6',  factor: 6 },  stock: 4,   reorder: 6  },
  { id: 'ing-braz',   name: 'Зёрна Бразилия Сантос, 1 кг', unit: 'кг', category: 'Кофе',      pack: { label: 'меш. × 5',  factor: 5 },  stock: 3,   reorder: 8  },
  { id: 'ing-ethio',  name: 'Зёрна Эфиопия Иргачеффе, 1 кг', unit: 'кг', category: 'Кофе',    pack: { label: 'меш. × 5',  factor: 5 },  stock: 11,  reorder: 6  },
  { id: 'ing-caramel',name: 'Сироп Карамель Monin, 1 л',   unit: 'шт', category: 'Сиропы',    pack: { label: 'уп. × 6',   factor: 6 },  stock: 2,   reorder: 6  },
  { id: 'ing-vanilla',name: 'Сироп Ваниль Monin, 1 л',     unit: 'шт', category: 'Сиропы',    pack: { label: 'уп. × 6',   factor: 6 },  stock: 5,   reorder: 4  },
  { id: 'ing-cup250', name: 'Стакан бумажный 250 мл',      unit: 'шт', category: 'Расходники', pack: { label: 'уп. × 50', factor: 50 }, stock: 40,  reorder: 150 },
  { id: 'ing-lid90',  name: 'Крышка 90 мм',                unit: 'шт', category: 'Расходники', pack: { label: 'уп. × 100', factor: 100 }, stock: 120, reorder: 150 },
  { id: 'ing-sugar',  name: 'Сахар порционный 5 г',        unit: 'шт', category: 'Бакалея',   pack: { label: 'кор. × 1000', factor: 1000 }, stock: 800, reorder: 500 },
];
const ingById = (id) => ingredients.find((i) => i.id === id);

/* ---- suppliers ----------------------------------------------------------- */
const suppliers = [
  {
    id: 1, name: 'Молочный Дом', tax_id: '191234567', is_active: true,
    contact_name: 'Ирина', phone: '+375 29 111-22-33',
    contact_channel: 'telegram', contact_value: '@moldom_zakaz',
    delivery_terms: 'Доставка с 7:00 до 10:00, разгрузка своими силами.',
    min_order_amount: 150, min_order_note: 'Ниже — самовывоз со склада',
    criteria: { delivery_lead_days: 1, delivery_weekdays: [1, 3, 5], payment_mode: 'on_delivery' },
    categories: ['Молочка'], sku_count: 6, last_delivery: '2026-07-14',
  },
  {
    id: 2, name: 'CoffeeTrade', tax_id: '192555444', is_active: true,
    contact_name: 'Алексей', phone: '+375 33 444-55-66',
    contact_channel: 'phone', contact_value: '+375 33 444-55-66',
    delivery_terms: 'Обжарка под заказ, свежесть до 5 дней от обжарки.',
    min_order_amount: 300, min_order_note: 'Бесплатная доставка от 500 BYN',
    criteria: { delivery_lead_days: 2, delivery_weekdays: [2, 4], payment_mode: 'prepay' },
    categories: ['Кофе', 'Сиропы'], sku_count: 12, last_delivery: '2026-07-11',
  },
  {
    id: 3, name: 'Бариста Плюс', tax_id: '193777888', is_active: true,
    contact_name: 'Марина', phone: '+375 44 777-88-99',
    contact_channel: 'viber', contact_value: '+375 44 777-88-99',
    delivery_terms: 'Расходники, крафт-упаковка. Минимальная партия — упаковка.',
    min_order_amount: 100, min_order_note: '',
    criteria: { delivery_lead_days: 3, delivery_weekdays: [1, 2, 3, 4, 5], payment_mode: 'deferred', payment_deferral_days: 14 },
    categories: ['Расходники'], sku_count: 8, last_delivery: '2026-07-09',
  },
  {
    id: 4, name: 'ЮнилайтБел', tax_id: '190333222', is_active: true,
    contact_name: 'Пётр', phone: '+375 25 333-22-11',
    contact_channel: 'whatsapp', contact_value: '+375 25 333-22-11',
    delivery_terms: 'Бакалея оптом.',
    min_order_amount: 200, min_order_note: '',
    criteria: { delivery_lead_days: 2, delivery_weekdays: [3], payment_mode: 'on_delivery' },
    categories: ['Бакалея'], sku_count: 5, last_delivery: '2026-06-30',
  },
  {
    id: 5, name: 'Фермерская Лавка', tax_id: '194010101', is_active: false,
    contact_name: 'Ольга', phone: '+375 29 900-10-20',
    contact_channel: 'telegram', contact_value: '@fermer_lavka',
    delivery_terms: 'Сезонная молочка. Сейчас не поставляет.',
    min_order_amount: 120, min_order_note: '',
    criteria: { delivery_weekdays: [6], payment_mode: 'on_delivery' },
    categories: ['Молочка'], sku_count: 3, last_delivery: '2026-05-18',
  },
];
const supById = (id) => suppliers.find((s) => s.id === Number(id));
const channelLabel = { telegram: 'Telegram', phone: 'Телефон', viber: 'Viber', whatsapp: 'WhatsApp', email: 'E-mail' };

/* ---- supplier prices per SKU (for comparison + alerts) -------------------
 * points[]: newest last. price in BYN per catalog unit.                      */
const supplierPrices = {
  'ing-milk': [
    { supplier_id: 1, min_batch: '1 короб', points: [
      { date: '2026-04-20', price: 2.10 }, { date: '2026-05-28', price: 2.18 }, { date: '2026-07-14', price: 2.35 } ] },
    { supplier_id: 5, min_batch: '1 короб', points: [
      { date: '2026-05-01', price: 1.98 } ] }, // stale (>60 дн.)
    { supplier_id: 4, min_batch: '2 короба', points: [
      { date: '2026-07-02', price: 2.19 } ] },
  ],
  'ing-braz': [
    { supplier_id: 2, min_batch: '1 мешок', points: [
      { date: '2026-05-10', price: 24.50 }, { date: '2026-07-11', price: 26.90 } ] },
    { supplier_id: 4, min_batch: '1 мешок', points: [
      { date: '2026-07-05', price: 25.40 } ] },
  ],
  'ing-cup250': [
    { supplier_id: 3, min_batch: '1 упаковка', points: [
      { date: '2026-06-15', price: 0.14 }, { date: '2026-07-09', price: 0.14 } ] },
    { supplier_id: 4, min_batch: '4 упаковки', points: [
      { date: '2026-07-03', price: 0.12 } ] },
  ],
};
const STALENESS_DAYS = 60;

/* ---- price alerts (mirrors price_alerts table) --------------------------- */
const alerts = [
  { id: 1, kind: 'price_increase', ingredient_id: 'ing-milk', supplier_id: 1,
    old_price: 2.18, new_price: 2.35, delta_pct: 7.8,
    message: 'Молоко 3.2% у «Молочный Дом» подорожало на 7,8% — с 2,18 до 2,35 BYN/л.',
    created_at: '2026-07-14', read_at: null },
  { id: 2, kind: 'cheaper_alternative', ingredient_id: 'ing-milk', supplier_id: 4,
    old_price: 2.35, new_price: 2.19, delta_pct: -6.8,
    message: 'У «ЮнилайтБел» молоко дешевле на 0,16 BYN/л, чем у текущего поставщика.',
    created_at: '2026-07-14', read_at: null },
  { id: 3, kind: 'price_increase', ingredient_id: 'ing-braz', supplier_id: 2,
    old_price: 24.50, new_price: 26.90, delta_pct: 9.8,
    message: 'Зёрна Бразилия у «CoffeeTrade» подорожали на 9,8% — с 24,50 до 26,90 BYN/кг.',
    created_at: '2026-07-11', read_at: '2026-07-12' },
];

/* ---- invoices ------------------------------------------------------------ */
const invoices = [
  { id: 1041, number: 'ТТН-4471', supplier_id: 1, issued_at: '2026-07-14', total_amount: 168.40, currency: 'BYN', status: 'written', line_count: 4 },
  { id: 1040, number: 'СФ-2200',  supplier_id: 2, issued_at: '2026-07-11', total_amount: 512.60, currency: 'BYN', status: 'prepared', line_count: 6 },
  { id: 1039, number: 'ТТН-4460', supplier_id: 3, issued_at: '2026-07-09', total_amount: 96.00,  currency: 'BYN', status: 'rejected', line_count: 3,
    validation_errors: 'Строка 2: не сопоставлена со SKU. Строка 3: сумма не сходится (расхождение 1,20 BYN).' },
  { id: 1038, number: '—',        supplier_id: 4, issued_at: '2026-07-08', total_amount: 214.00, currency: 'BYN', status: 'validated', line_count: 5 },
  { id: 1037, number: 'ТТН-4455', supplier_id: 1, issued_at: '2026-07-07', total_amount: 151.20, currency: 'BYN', status: 'written', line_count: 4 },
];

/* recognized lines for the import-flow demo (supplier: Молочный Дом) */
const demoOcrLines = [
  { raw: 'Молоко пит. 3.2% 1л', qty: 24, unit: 'шт', price: 2.35, sku: 'ing-milk',  match: 'mapped' },
  { raw: 'Сливки 33% 1000мл',   qty: 6,  unit: 'шт', price: 6.90, sku: 'ing-cream', match: 'mapped' },
  { raw: 'Масло слив. 82.5%',   qty: 4,  unit: 'шт', price: 4.20, sku: null,        match: 'needs' },
  { raw: 'Йогурт нат. 3.5%',    qty: 12, unit: 'шт', price: 1.15, sku: null,        match: 'suggest', suggestion: 'ing-cream' },
];

/* ---- purchase orders (planned domain) ------------------------------------ */
const purchaseOrders = [
  { id: 'PO-0032', supplier_id: 2, status: 'draft', created_at: '2026-07-15', confirmed_at: null,
    lines: [
      { ingredient_id: 'ing-braz',    qty: 2, packing: 'меш. × 5', unit_price: 26.90, origin: 'ai',      reason: 'Остаток 3 кг ниже порога 8 кг' },
      { ingredient_id: 'ing-caramel', qty: 1, packing: 'уп. × 6',  unit_price: 9.40,  origin: 'ai',      reason: 'Остаток 2 шт ниже порога 6 шт' },
      { ingredient_id: 'ing-vanilla', qty: 1, packing: 'уп. × 6',  unit_price: 9.40,  origin: 'prefill', reason: '' },
    ] },
  { id: 'PO-0031', supplier_id: 1, status: 'sent_manually', created_at: '2026-07-14', confirmed_at: '2026-07-14',
    lines: [
      { ingredient_id: 'ing-milk',  qty: 3, packing: 'кор. × 12', unit_price: 2.35, origin: 'manual', reason: '' },
      { ingredient_id: 'ing-cream', qty: 2, packing: 'кор. × 6',  unit_price: 6.90, origin: 'manual', reason: '' },
    ] },
  { id: 'PO-0030', supplier_id: 3, status: 'received', created_at: '2026-07-09', confirmed_at: '2026-07-09',
    lines: [
      { ingredient_id: 'ing-cup250', qty: 4, packing: 'уп. × 50',  unit_price: 0.14, origin: 'manual', reason: '' },
      { ingredient_id: 'ing-lid90',  qty: 2, packing: 'уп. × 100', unit_price: 0.09, origin: 'manual', reason: '' },
    ] },
];
const poTotal = (po) => po.lines.reduce((s, l) => s + l.qty * (packFactor(l.packing)) * l.unit_price, 0);
function packFactor(label) {
  const m = String(label).match(/×\s*(\d+)/);
  return m ? Number(m[1]) : 1;
}

/* helpers exposed to views */
const originMeta = {
  ai:      { label: 'AI', tone: 'accent', title: 'Предложено планировщиком' },
  prefill: { label: 'из истории', tone: 'info', title: 'Поставлялось ранее' },
  manual:  { label: 'вручную', tone: 'muted', title: 'Добавлено вручную' },
};

/* live prototype state (mutable) */
const state = {
  alerts,
  purchaseOrders,
  invoices,
  draft: null, // active order draft being edited
};
