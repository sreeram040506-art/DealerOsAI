import { readFile } from 'fs/promises';

/**
 * Sale paperwork: nine HTML form templates (server/templates/deal-forms) with {{placeholders}}
 * that are filled from a sale. Values the app already knows are prefilled; the rest are left
 * for staff to type in, and whatever they enter is saved on the sale (Sale.dealFormData).
 */

const TEMPLATE_DIR = new URL('../../templates/deal-forms/', import.meta.url);

export const DEAL_FORMS = [
  { key: 'bill_of_sale', title: 'Motor Vehicle Bill of Sale', file: 'Form_1_Motor_Vehicle_Bill_of_Sale.html' },
  { key: 'odometer', title: 'Odometer Disclosure Statement', file: 'Form_2_Odometer_Disclosure_Statement.html' },
  { key: 'purchase_contract', title: 'Motor Vehicle Purchase Contract', file: 'Form_3_Motor_Vehicle_Purchase_Contract.html' },
  { key: 'title_registration', title: 'Title and Registration Worksheet', file: 'Form_4_Title_and_Registration_Worksheet.html' },
  { key: 'buyers_guide', title: 'FTC Used Car Buyers Guide', file: 'Form_5_FTC_Used_Car_Buyers_Guide.html' },
  { key: 'window_sticker', title: 'Vehicle Window Sticker', file: 'Form_6_Vehicle_Window_Sticker.html' },
  { key: 'hangtag', title: 'Rearview Mirror Hangtag', file: 'Form_7_Rearview_Mirror_Hangtag.html' },
  { key: 'credit_application', title: 'Vehicle Loan Credit Application', file: 'Form_8_Vehicle_Loan_Credit_Application.html' },
  { key: 'inspection', title: 'Used Vehicle Inspection Report', file: 'Form_9_Used_Vehicle_Inspection_Report.html' },
];

// Fields that are not {{placeholders}} but drive checkboxes in the templates.
const CHECK_FIELDS = {
  payment_method: { label: 'Payment method', group: 'Payment', options: ['Cash', 'Financed', 'Outside Lien'] },
  vehicle_condition: { label: 'Vehicle condition', group: 'Vehicle', options: ['New', 'Used', 'Demo'] },
  warranty_type: { label: 'Warranty', group: 'Warranty', options: ['As is - no dealer warranty', 'Dealer warranty', "Manufacturer's warranty"] },
};

const GROUPS = [
  ['Dealership', /^dealer_/],
  ['Buyer', /^(buyer|cobuyer)_|^(employer|job_|monthly_|residence_|employment_|ssn_)/],
  ['Vehicle', /^(vehicle_|vin$|stock_number|odometer|body_style|exterior_|interior_|engine_|transmission|drivetrain|fuel_type|title_number)/],
  ['Trade-in', /^trade_in|^net_trade_in/],
  ['Pricing', /(price|amount|fee|tax|discount|down_payment|balance|addons|financed|contract_number)/],
  ['Financing', /^(lender|lien_)/],
  ['Warranty', /^warranty_/],
  ['Title & registration', /^state_juris/],
  ['Dates & notes', /(date|notes)$/],
];

const LABEL_OVERRIDES = {
  vin: 'VIN', ssn_last4: 'SSN (last 4)', buyer_dl_number: 'Buyer driver license #', cobuyer_dl_number: 'Co-buyer driver license #',
  buyer_dob: 'Buyer date of birth', warranty_labor_pct: 'Dealer pays labor (%)', warranty_parts_pct: 'Dealer pays parts (%)',
  trade_in_vin: 'Trade-in VIN', doc_fee: 'Doc fee', tax_amount: 'Sales tax', addons_price: 'Accessories / add-ons',
};

const MONEY = new Set(['sale_price', 'tax_amount', 'doc_fee', 'other_fees', 'discounts', 'trade_in_allowance', 'trade_in_payoff', 'down_payment', 'final_balance',
  'addons_price', 'state_fees', 'subtotal_price', 'total_delivered_price', 'net_trade_in', 'amount_financed', 'total_dealer_price', 'monthly_income', 'monthly_housing']);
const DATES = new Set(['sale_date', 'delivery_date', 'signature_date', 'inspection_date', 'buyer_dob']);
const LONG = new Set(['inspector_notes']);

const templateCache = new Map();
async function loadTemplate(form) {
  if (!templateCache.has(form.key)) {
    templateCache.set(form.key, await readFile(new URL(form.file, TEMPLATE_DIR), 'utf8'));
  }
  return templateCache.get(form.key);
}

const fieldsIn = (html) => [...new Set([...html.matchAll(/{{([a-z0-9_]+)}}/g)].map((m) => m[1]))];

function describeField(name) {
  const group = GROUPS.find(([, re]) => re.test(name))?.[0] || 'Other';
  const label = LABEL_OVERRIDES[name] || name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const type = MONEY.has(name) ? 'money' : DATES.has(name) ? 'date' : LONG.has(name) ? 'textarea' : 'text';
  return { name, label, group, type };
}

export async function describeForms() {
  const forms = [];
  const seen = new Map();
  for (const form of DEAL_FORMS) {
    const html = await loadTemplate(form);
    const names = fieldsIn(html);
    forms.push({ key: form.key, title: form.title, fields: names });
    for (const n of names) if (!seen.has(n)) seen.set(n, describeField(n));
  }
  for (const [name, meta] of Object.entries(CHECK_FIELDS)) seen.set(name, { name, type: 'select', ...meta });
  const order = GROUPS.map(([g]) => g).concat('Other');
  const fields = [...seen.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  return { forms, fields };
}

const money = (n) => (Number.isFinite(n) ? n.toFixed(2) : '');
const mdy = (d) => {
  const date = d ? new Date(d) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
};
const toNum = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[$,()\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Values the app already knows, from the sale, its vehicle and the dealership. */
export function prefill({ sale, vehicle, dealership, decoded = {}, carried = {} }) {
  const payment = sale.paymentMethod === 'Loan' ? 'Financed' : sale.paymentMethod === 'Cash' ? 'Cash' : '';
  const loan = sale.loanAmount;
  const today = mdy(new Date());
  return {
    dealer_name: dealership?.name || '',
    dealer_address: dealership?.address || '',
    dealer_phone: dealership?.phone || '',
    dealer_contact_details: [dealership?.phone, dealership?.email].filter(Boolean).join(' | '),
    dealer_license_number: carried.dealer_license_number || '',
    state_jurisdiction: carried.state_jurisdiction || '',
    sale_date: mdy(sale.saleDate),
    delivery_date: mdy(sale.saleDate),
    signature_date: today,
    inspection_date: today,
    stock_number: vehicle?.stockNumber || '',
    buyer_name: sale.customerName || '',
    buyer_address: sale.address || '',
    buyer_phone: sale.phone || '',
    buyer_dl_number: sale.driverLicense || '',
    vehicle_year: vehicle?.year != null ? String(vehicle.year) : '',
    vehicle_make: vehicle?.make || '',
    vehicle_model: vehicle?.model || '',
    vehicle_trim: decoded.trim || '',
    vehicle_color: vehicle?.color || '',
    exterior_color: vehicle?.color || '',
    vin: vehicle?.vin || '',
    odometer_reading: vehicle?.mileage != null ? Number(vehicle.mileage).toLocaleString('en-US') : '',
    title_number: vehicle?.titleNumber || '',
    body_style: decoded.bodyClass || '',
    engine_type: [decoded.displacementL && `${decoded.displacementL}L`, decoded.engineCylinders && `${decoded.engineCylinders}-cyl`].filter(Boolean).join(' '),
    transmission: decoded.transmissionStyle || '',
    drivetrain: decoded.driveType || '',
    fuel_type: decoded.fuelType || '',
    sale_price: money(sale.salePrice),
    total_dealer_price: money(sale.salePrice),
    down_payment: sale.downPayment ? money(sale.downPayment) : '',
    lender_name: sale.financeCompany || '',
    amount_financed: loan ? money(loan) : '',
    payment_method: payment,
    vehicle_condition: 'Used',
    warranty_type: carried.warranty_type || 'As is - no dealer warranty',
    warranty_labor_pct: carried.warranty_labor_pct || '',
    warranty_parts_pct: carried.warranty_parts_pct || '',
  };
}

/** Totals the user left blank are worked out from the figures they did enter. */
export function withTotals(v) {
  const out = { ...v };
  const blank = (k) => out[k] === undefined || out[k] === null || String(out[k]).trim() === '';
  const price = toNum(out.sale_price);
  const hasPrice = !blank('sale_price');
  const net = toNum(out.trade_in_allowance) - toNum(out.trade_in_payoff);
  const hasTrade = !blank('trade_in_allowance') || !blank('trade_in_payoff');

  if (blank('net_trade_in') && hasTrade) out.net_trade_in = money(net);
  if (blank('subtotal_price') && hasPrice) out.subtotal_price = money(price + toNum(out.doc_fee) + toNum(out.addons_price));
  const subtotal = blank('subtotal_price') ? price : toNum(out.subtotal_price);
  if (blank('total_delivered_price') && hasPrice) out.total_delivered_price = money(subtotal + toNum(out.tax_amount) + toNum(out.state_fees));
  const delivered = blank('total_delivered_price') ? subtotal : toNum(out.total_delivered_price);
  if (blank('amount_financed') && hasPrice) out.amount_financed = money(delivered - toNum(out.net_trade_in) - toNum(out.down_payment));
  if (blank('final_balance') && hasPrice) {
    out.final_balance = money(price + toNum(out.tax_amount) + toNum(out.doc_fee) + toNum(out.other_fees) - toNum(out.discounts)
      - toNum(out.trade_in_allowance) + toNum(out.trade_in_payoff) - toNum(out.down_payment));
  }
  return out;
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BLANK = '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';

function tick(html, label, on) {
  return on ? html.replace(`[ ] ${label}`, `[X] ${label}`) : html;
}

function applyChecks(formKey, v, html) {
  const warranty = v.warranty_type || '';
  const asIs = warranty.startsWith('As is');
  const dealer = warranty.startsWith('Dealer');
  const mfr = warranty.startsWith('Manufacturer');
  if (formKey === 'bill_of_sale') {
    for (const opt of CHECK_FIELDS.payment_method.options) html = tick(html, opt, v.payment_method === opt);
  } else if (formKey === 'purchase_contract') {
    for (const opt of CHECK_FIELDS.vehicle_condition.options) html = tick(html, opt, v.vehicle_condition === opt);
    html = html.replace('[ ] <strong>AS IS', `${asIs ? '[X]' : '[ ]'} <strong>AS IS`)
      .replace('[ ] <strong>DEALER WARRANTY', `${dealer ? '[X]' : '[ ]'} <strong>DEALER WARRANTY`)
      .replace("[ ] <strong>MANUFACTURER'S", `${mfr ? '[X]' : '[ ]'} <strong>MANUFACTURER'S`);
  } else if (formKey === 'buyers_guide') {
    html = html.replace('[ &nbsp; ] AS IS', `${asIs ? '[ X ]' : '[ &nbsp; ]'} AS IS`)
      .replace('[ &nbsp; ] WARRANTY', `${dealer ? '[ X ]' : '[ &nbsp; ]'} WARRANTY`);
  }
  return html;
}

export async function renderForm(formKey, values) {
  const form = DEAL_FORMS.find((f) => f.key === formKey);
  if (!form) throw new Error(`Unknown form: ${formKey}`);
  const v = withTotals(values);
  let html = applyChecks(formKey, v, await loadTemplate(form));
  html = html.replace(/{{([a-z0-9_]+)}}/g, (_, name) => {
    const value = v[name];
    return value === undefined || value === null || String(value).trim() === '' ? BLANK : escapeHtml(value);
  });
  return html;
}
