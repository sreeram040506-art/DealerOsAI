import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { allFields } from './formDefinitions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──────────────────────────────────────────────────────────────────────
// Template loading & caching
// ──────────────────────────────────────────────────────────────────────
const templateCache = new Map();

function findTemplatePath(fileName) {
  const candidates = [
    path.resolve(__dirname, '../../../forms/custom', fileName),
    path.resolve(process.cwd(), 'forms/custom', fileName),
    path.resolve(process.cwd(), '../forms/custom', fileName),
    path.resolve(__dirname, '../../forms/custom', fileName),
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  return null;
}

function getTemplateBuffer(fileName) {
  if (templateCache.has(fileName)) return templateCache.get(fileName);
  const p = findTemplatePath(fileName);
  if (!p) {
    console.warn(`[formPdf] Template ${fileName} not found in custom forms paths. Falling back to programmatic sheet.`);
    return null;
  }
  try {
    const buf = fs.readFileSync(p);
    templateCache.set(fileName, buf);
    return buf;
  } catch (err) {
    console.error(`[formPdf] Error reading template ${fileName}:`, err?.message || err);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Formatting helpers
// ──────────────────────────────────────────────────────────────────────
const money = (value) => {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '';
  const n = Number(value);
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const dateText = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value || '') : d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

function safeSet(form, fieldName, value) {
  try {
    const f = form.getTextField(fieldName);
    if (f) {
      f.setText(String(value ?? ''));
    }
  } catch {
    // Field not present or not a text field
  }
}

function safeCheck(form, cbName, condition) {
  try {
    const cb = form.getCheckBox(cbName);
    if (cb) {
      if (condition) cb.check();
      else cb.uncheck();
    }
  } catch {
    // Checkbox not present
  }
}

// ──────────────────────────────────────────────────────────────────────
// Official Template Renderers (fills AcroForms in forms/custom/*.pdf)
// ──────────────────────────────────────────────────────────────────────

/** Motor Vehicle Purchase Contract (forms/custom/Motor_Vehicle_Purchase_Contract.pdf) */
export async function renderPurchaseContractPdf({ data = {}, vehicle = {}, dealership = {}, terms = {}, submittedAt = new Date() }) {
  const templateBuf = getTemplateBuffer('Motor_Vehicle_Purchase_Contract.pdf');
  if (!templateBuf) {
    return renderFallbackPdf({ formType: 'PURCHASE_CONTRACT', data, vehicle, dealership, terms, submittedAt });
  }

  const pdfDoc = await PDFDocument.load(templateBuf, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  const pages = pdfDoc.getPages();
  const page1 = pages[0];
  const page2 = pages[1] || page1;

  // Header overlay on Page 1
  if (dealership?.name) {
    page1.drawText(String(dealership.name).slice(0, 45), { x: 125, y: 737, size: 9, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
  }
  if (dealership?.licenseNumber || dealership?.license) {
    page1.drawText(String(dealership.licenseNumber || dealership.license).slice(0, 20), { x: 485, y: 737, size: 9, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
  }

  // Top fields
  safeSet(form, 'f1', dateText(submittedAt));
  safeSet(form, 'f2', dealership?.salesperson || 'Dealer Representative');
  safeSet(form, 'f3', vehicle?.stockNumber || (vehicle?.vin ? vehicle.vin.slice(-6) : ''));

  // Buyer
  safeSet(form, 'f4', data.buyerName);
  safeSet(form, 'f5', [data.buyerLicense, data.buyerLicenseState].filter(Boolean).join(' / '));
  safeSet(form, 'f6', data.buyerAddress);
  safeSet(form, 'f7', data.buyerCity);
  safeSet(form, 'f8', data.buyerState);
  safeSet(form, 'f9', data.buyerZip);
  safeSet(form, 'f10', data.buyerPhone);
  safeSet(form, 'f11', data.buyerEmail);
  safeSet(form, 'f12', dateText(data.buyerDob));

  // Co-buyer
  safeSet(form, 'f13', data.coName);
  safeSet(form, 'f14', [data.coLicense, data.coLicenseState].filter(Boolean).join(' / '));
  safeSet(form, 'f15', data.coAddress);
  safeSet(form, 'f16', data.coCity);
  safeSet(form, 'f17', data.coState);
  safeSet(form, 'f18', data.coZip);
  safeSet(form, 'f19', data.coPhone);
  safeSet(form, 'f20', data.coEmail);
  safeSet(form, 'f21', dateText(data.coDob));

  // Vehicle
  safeSet(form, 'f22', vehicle?.year ? String(vehicle.year) : '');
  safeSet(form, 'f23', vehicle?.make);
  safeSet(form, 'f24', vehicle?.model);
  safeSet(form, 'f25', vehicle?.trim || '');
  safeSet(form, 'f26', vehicle?.color);
  safeSet(form, 'f27', vehicle?.vin);
  safeSet(form, 'f28', vehicle?.stockNumber || (vehicle?.vin ? vehicle.vin.slice(-6) : ''));
  safeSet(form, 'f29', vehicle?.mileage != null ? Number(vehicle.mileage).toLocaleString('en-US') : '');
  safeSet(form, 'f30', vehicle?.plateNumber || '');
  safeSet(form, 'f31', vehicle?.titleNumber || '');
  safeSet(form, 'f32', vehicle?.titleState || '');

  // Trade-in
  safeSet(form, 'f33', data.tradeYear);
  safeSet(form, 'f34', data.tradeMake);
  safeSet(form, 'f35', data.tradeModel);
  safeSet(form, 'f36', data.tradeTrim || '');
  safeSet(form, 'f37', data.tradeColor || '');
  safeSet(form, 'f38', data.tradeVin);
  safeSet(form, 'f39', data.tradeMileage);
  safeSet(form, 'f40', money(data.tradePayoff));
  safeSet(form, 'f41', money(terms?.tradeAllowance));

  // Pricing
  const cashPrice = Number(terms?.cashPrice ?? vehicle?.askingPrice ?? 0);
  const docFee = Number(terms?.docFee ?? 0);
  const taxAndFees = Number(terms?.taxAndFees ?? 0);
  const addOns = Number(terms?.addOns ?? 0);
  const tradeAllowance = Number(terms?.tradeAllowance ?? 0);
  const cashDown = Number(data.cashDown ?? 0);
  const total = cashPrice + docFee + taxAndFees + addOns - tradeAllowance - cashDown;

  safeSet(form, 'f42', money(cashPrice));
  safeSet(form, 'f43', money(taxAndFees));
  safeSet(form, 'f44', money(docFee));
  safeSet(form, 'f46', money(addOns));
  safeSet(form, 'f48', tradeAllowance ? money(tradeAllowance) : '');
  safeSet(form, 'f49', cashDown ? money(cashDown) : '');
  safeSet(form, 'f51', money(total));

  // Payment method
  safeCheck(form, 'c52', data.paymentMethod === 'Cash');
  safeCheck(form, 'c53', data.paymentMethod === 'Check');
  safeCheck(form, 'c54', data.paymentMethod === 'Card');
  safeCheck(form, 'c55', data.paymentMethod === 'Dealer financing');
  safeCheck(form, 'c56', data.paymentMethod === 'Outside financing');

  // Financing fields
  safeSet(form, 'f57', data.lender);
  safeSet(form, 'f58', data.amountFinanced ? money(data.amountFinanced) : (data.paymentMethod?.includes('financing') && total > 0 ? money(total) : ''));
  safeSet(form, 'f59', data.apr ? `${data.apr}%` : '');
  safeSet(form, 'f60', data.loanTerm || '');
  safeSet(form, 'f61', data.monthlyPayment ? money(data.monthlyPayment) : '');

  // Warranty
  safeCheck(form, 'c62', !data.dealerWarranty); // AS IS
  safeCheck(form, 'c63', !!data.dealerWarranty);
  safeCheck(form, 'c64', false);

  // Signatures on Page 2
  if (data.signature) {
    page2.drawText(String(data.signature).slice(0, 40), { x: 40, y: 110, size: 14, font: italic, color: rgb(0.1, 0.1, 0.15) });
    page2.drawText(dateText(submittedAt), { x: 175, y: 110, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
  }
  if (data.coSignature || data.coName) {
    page2.drawText(String(data.coSignature || data.coName).slice(0, 40), { x: 235, y: 110, size: 12, font: italic, color: rgb(0.1, 0.1, 0.15) });
    page2.drawText(dateText(submittedAt), { x: 350, y: 110, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
  }
  page2.drawText('AUTHORIZED REPRESENTATIVE', { x: 410, y: 110, size: 8.5, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
  page2.drawText(dateText(submittedAt), { x: 520, y: 110, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });

  form.updateFieldAppearances(helvetica);
  form.flatten();

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

/** Vehicle Credit Application (forms/custom/Loan_Credit_Application.pdf) */
export async function renderLoanApplicationPdf({ data = {}, vehicle = {}, dealership = {}, terms = {}, submittedAt = new Date() }) {
  const templateBuf = getTemplateBuffer('Loan_Credit_Application.pdf');
  if (!templateBuf) {
    return renderFallbackPdf({ formType: 'LOAN_APPLICATION', data, vehicle, dealership, terms, submittedAt });
  }

  const pdfDoc = await PDFDocument.load(templateBuf, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  const pages = pdfDoc.getPages();
  const page2 = pages[1] || pages[0];

  safeSet(form, 'f1', dateText(submittedAt));
  safeSet(form, 'f2', dealership?.salesperson || 'Dealer Finance');
  safeSet(form, 'f3', dealership?.name || 'Dealership Preferred Lenders');

  safeCheck(form, 'c4', !data.coName);
  safeCheck(form, 'c5', !!data.coName);

  // Applicant
  safeSet(form, 'f6', data.applicantName);
  safeSet(form, 'f7', dateText(data.applicantDob));
  safeSet(form, 'f8', data.applicantSsn4 ? '***-**-' + String(data.applicantSsn4).slice(-4) : '');
  safeSet(form, 'f9', data.applicantAddress);
  safeSet(form, 'f10', data.applicantCity);
  safeSet(form, 'f11', data.applicantState);
  safeSet(form, 'f12', data.applicantZip);
  safeSet(form, 'f13', data.applicantYearsAtAddress);
  safeSet(form, 'f14', data.applicantHousing);
  safeSet(form, 'f15', money(data.applicantHousingPayment));
  safeSet(form, 'f16', data.applicantPhone);
  safeSet(form, 'f17', data.applicantEmail);
  safeSet(form, 'f18', data.applicantPreviousAddress);

  // Employment
  safeSet(form, 'f19', data.employer);
  safeSet(form, 'f20', data.jobTitle);
  safeSet(form, 'f21', data.timeAtJob);
  safeSet(form, 'f22', data.employerAddress);
  safeSet(form, 'f23', data.employerPhone);
  safeSet(form, 'f24', money(data.monthlyIncome));
  safeSet(form, 'f25', money(data.otherIncome));
  safeSet(form, 'f26', data.otherIncomeSource);

  // Co-applicant
  safeSet(form, 'f27', data.coName);
  safeSet(form, 'f28', dateText(data.coDob));
  safeSet(form, 'f29', data.coSsn4 ? '***-**-' + String(data.coSsn4).slice(-4) : '');
  safeSet(form, 'f30', data.coAddress);
  safeSet(form, 'f31', data.coCity);
  safeSet(form, 'f32', data.coState);
  safeSet(form, 'f33', data.coZip);
  safeSet(form, 'f34', data.coYearsAtAddress);
  safeSet(form, 'f35', data.coHousing);
  safeSet(form, 'f36', money(data.coHousingPayment));
  safeSet(form, 'f37', data.coPhone);
  safeSet(form, 'f38', data.coEmail);
  safeSet(form, 'f39', data.coPreviousAddress);

  safeSet(form, 'f40', data.coEmployer);
  safeSet(form, 'f41', data.coJobTitle);
  safeSet(form, 'f42', data.coTimeAtJob);
  safeSet(form, 'f43', data.coEmployerAddress);
  safeSet(form, 'f44', data.coEmployerPhone);
  safeSet(form, 'f45', money(data.coMonthlyIncome));
  safeSet(form, 'f46', money(data.coOtherIncome));
  safeSet(form, 'f47', data.coOtherIncomeSource);

  // Vehicle requested
  safeSet(form, 'f48', vehicle?.year ? String(vehicle.year) : '');
  safeSet(form, 'f49', vehicle?.make);
  safeSet(form, 'f50', vehicle?.model);
  safeSet(form, 'f51', vehicle?.trim || '');
  safeSet(form, 'f52', vehicle?.color);
  safeSet(form, 'f53', vehicle?.vin);
  safeSet(form, 'f54', vehicle?.stockNumber || (vehicle?.vin ? vehicle.vin.slice(-6) : ''));
  safeSet(form, 'f55', vehicle?.mileage != null ? Number(vehicle.mileage).toLocaleString('en-US') : '');

  const cashPrice = Number(terms?.cashPrice ?? vehicle?.askingPrice ?? 0);
  const tradeValue = Number(data.tradeValue ?? 0);
  const payoff = Number(data.tradePayoff ?? 0);
  const down = Number(data.cashDown ?? 0);
  const financed = Math.max(0, cashPrice - tradeValue + payoff - down);

  safeSet(form, 'f56', money(cashPrice));
  safeSet(form, 'f57', money(tradeValue));
  safeSet(form, 'f58', money(payoff));
  safeSet(form, 'f59', money(down));
  safeSet(form, 'f60', money(financed));

  // Page 2: References
  safeSet(form, 'f61', data.ref1Name);
  safeSet(form, 'f62', data.ref1Relationship);
  safeSet(form, 'f63', data.ref1Phone);
  safeSet(form, 'f64', data.ref2Name);
  safeSet(form, 'f65', data.ref2Relationship);
  safeSet(form, 'f66', data.ref2Phone);

  if (data.signature) {
    page2.drawText(String(data.signature).slice(0, 45), { x: 40, y: 88, size: 14, font: italic, color: rgb(0.1, 0.1, 0.15) });
    page2.drawText(dateText(submittedAt), { x: 320, y: 88, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
  }

  form.updateFieldAppearances(helvetica);
  form.flatten();

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

/** Used Vehicle Inspection Report (forms/custom/Used_Vehicle_Inspection_Report.pdf) */
export async function renderInspectionReportPdf({ data = {}, vehicle = {}, dealership = {}, submittedAt = new Date() }) {
  const templateBuf = getTemplateBuffer('Used_Vehicle_Inspection_Report.pdf');
  if (!templateBuf) {
    return renderFallbackPdf({ formType: 'INSPECTION_REPORT', data, vehicle, dealership, terms: {}, submittedAt });
  }

  const pdfDoc = await PDFDocument.load(templateBuf, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  const pages = pdfDoc.getPages();
  const page1 = pages[0];
  const page2 = pages[1] || page1;

  if (dealership?.name) {
    page1.drawText(String(dealership.name).slice(0, 45), { x: 125, y: 737, size: 9, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
  }
  if (dealership?.licenseNumber || dealership?.license) {
    page1.drawText(String(dealership.licenseNumber || dealership.license).slice(0, 20), { x: 485, y: 737, size: 9, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
  }

  safeSet(form, 'f1', dateText(data.inspectionDate || submittedAt));
  safeSet(form, 'f2', data.inspectorName);
  safeSet(form, 'f3', data.orderNumber || vehicle?.stockNumber || (vehicle?.vin ? vehicle.vin.slice(-6) : ''));

  safeSet(form, 'f4', vehicle?.year ? String(vehicle.year) : '');
  safeSet(form, 'f5', vehicle?.make);
  safeSet(form, 'f6', vehicle?.model);
  safeSet(form, 'f7', vehicle?.trim || '');
  safeSet(form, 'f8', vehicle?.color);
  safeSet(form, 'f9', vehicle?.vin);
  safeSet(form, 'f10', vehicle?.stockNumber || (vehicle?.vin ? vehicle.vin.slice(-6) : ''));
  safeSet(form, 'f11', data.odometer ? String(data.odometer) : (vehicle?.mileage != null ? Number(vehicle.mileage).toLocaleString('en-US') : ''));
  safeSet(form, 'f12', vehicle?.plateNumber || '');
  safeSet(form, 'f13', vehicle?.titleNumber || '');
  safeSet(form, 'f14', vehicle?.titleState || '');

  // 34 checklist items in exact template order
  const checklistKeys = [
    'oil', 'coolant', 'belts', 'battery', 'transmission', 'exhaust', 'axles', 'codes',
    'frontBrakes', 'rearBrakes', 'brakeFluid', 'shocks', 'joints', 'bearings', 'steering',
    'tread', 'tireAge', 'wheels', 'spare',
    'headlights', 'taillights', 'signals', 'glass', 'wipers',
    'body', 'collision',
    'belts2', 'airbag', 'horn', 'hvac', 'windows', 'controls', 'seats', 'odoWorks'
  ];

  checklistKeys.forEach((key, idx) => {
    const val = data[key] || 'OK';
    const baseCb = 15 + idx * 4;
    safeCheck(form, `c${baseCb}`, val === 'OK');
    safeCheck(form, `c${baseCb + 1}`, val === 'Needs repair');
    safeCheck(form, `c${baseCb + 2}`, val === 'Replaced');
    safeCheck(form, `c${baseCb + 3}`, val === 'N/A');
  });

  // Test drive & overall
  safeCheck(form, 'c151', data.testDrive === 'Passed');
  safeCheck(form, 'c152', data.testDrive === 'Passed with notes');
  safeCheck(form, 'c153', data.testDrive === 'Failed');

  safeCheck(form, 'c154', data.overall === 'Ready for sale');
  safeCheck(form, 'c155', data.overall === 'Repairs needed first');
  safeCheck(form, 'c156', data.overall === 'Do not sell');

  safeSet(form, 'f157', money(data.repairEstimate));
  safeSet(form, 'f158', data.notes ? String(data.notes).slice(0, 75) : '');
  safeSet(form, 'f159', data.notes ? String(data.notes).slice(75, 260) : '');

  page2.drawText(String(data.inspectorName || 'Inspector').slice(0, 35), { x: 40, y: 110, size: 12, font: italic, color: rgb(0.1, 0.1, 0.15) });
  page2.drawText(dateText(data.inspectionDate || submittedAt), { x: 180, y: 110, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
  page2.drawText('AUTHORIZED REPRESENTATIVE', { x: 320, y: 110, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
  page2.drawText(dateText(data.inspectionDate || submittedAt), { x: 490, y: 110, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });

  form.updateFieldAppearances(helvetica);
  form.flatten();

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

/** Used-car window sticker (forms/custom/Window_Sticker_Used_Car.pdf) */
export async function renderStickerPdf({ vehicle = {}, dealership = {} }) {
  const templateBuf = getTemplateBuffer('Window_Sticker_Used_Car.pdf');
  if (!templateBuf) {
    return renderFallbackStickerPdf({ vehicle, dealership });
  }

  const pdfDoc = await PDFDocument.load(templateBuf, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  safeSet(form, 'f1', vehicle?.year ? String(vehicle.year) : '');
  safeSet(form, 'f2', vehicle?.make);
  safeSet(form, 'f3', vehicle?.model);
  safeSet(form, 'f4', vehicle?.trim || '');
  safeSet(form, 'f5', vehicle?.color);
  safeSet(form, 'f6', vehicle?.interiorColor || '');
  safeSet(form, 'f7', vehicle?.vin);
  safeSet(form, 'f8', vehicle?.stockNumber || (vehicle?.vin ? vehicle.vin.slice(-6) : ''));
  safeSet(form, 'f9', vehicle?.mileage != null ? `${Number(vehicle.mileage).toLocaleString('en-US')} mi` : '');
  safeSet(form, 'f10', vehicle?.engine || '');
  safeSet(form, 'f11', vehicle?.transmission || '');
  safeSet(form, 'f12', vehicle?.drivetrain || '');
  safeSet(form, 'f13', vehicle?.fuelType || '');

  const priceStr = vehicle?.askingPrice ? money(vehicle.askingPrice) : 'Ask for price';
  safeSet(form, 'f14', priceStr);
  safeSet(form, 'f15', priceStr);
  safeSet(form, 'f16', dealership?.docFee ? money(dealership.docFee) : '');

  // Features
  const features = Array.isArray(vehicle?.features) && vehicle.features.length
    ? vehicle.features
    : ['Bluetooth / Hands-Free Calling', 'Backup Camera', 'Apple CarPlay & Android Auto', 'Keyless Entry & Push Button Start', 'Power Windows & Door Locks', 'Cruise Control & Multi-function Steering Wheel'];
  
  features.slice(0, 10).forEach((feat, i) => {
    safeSet(form, `f${17 + i}`, feat);
  });

  safeCheck(form, 'c27', true); // Clean title
  safeCheck(form, 'c31', true); // No accident reported
  safeCheck(form, 'c34', true); // 1 owner
  safeCheck(form, 'c38', true); // Inspected

  safeSet(form, 'f40', dealership?.name);
  safeSet(form, 'f41', dealership?.phone);
  safeSet(form, 'f42', dealership?.website || dealership?.email || '');

  form.updateFieldAppearances(helvetica);
  form.flatten();

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

/** Mirror hangtag (forms/custom/Mirror_Hangtag.pdf) */
export async function renderHangtagPdf({ vehicle = {}, dealership = {} }) {
  const templateBuf = getTemplateBuffer('Mirror_Hangtag.pdf');
  if (!templateBuf) {
    return renderFallbackHangtagPdf({ vehicle, dealership });
  }

  const pdfDoc = await PDFDocument.load(templateBuf, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.getPages()[0];
  if (dealership?.name) {
    page.drawText(String(dealership.name).slice(0, 36), { x: 95, y: 566, size: 8.5, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
  }

  safeSet(form, 'f1', vehicle?.year ? String(vehicle.year) : '');
  safeSet(form, 'f2', vehicle?.make);
  safeSet(form, 'f3', vehicle?.model);
  safeSet(form, 'f4', vehicle?.trim || '');
  safeSet(form, 'f5', vehicle?.color);
  safeSet(form, 'f6', vehicle?.mileage != null ? Number(vehicle.mileage).toLocaleString('en-US') : '');
  safeSet(form, 'f7', vehicle?.vin);
  safeSet(form, 'f8', vehicle?.stockNumber || (vehicle?.vin ? vehicle.vin.slice(-6) : ''));
  safeSet(form, 'f9', vehicle?.stockNumber || '');
  safeSet(form, 'f10', vehicle?.askingPrice ? money(vehicle.askingPrice) : 'Ask for price');
  safeSet(form, 'f13', dealership?.phone ? `Call: ${dealership.phone}` : '');
  safeSet(form, 'f14', dealership?.address || '');

  safeCheck(form, 'c15', vehicle?.status !== 'Sold' && vehicle?.status !== 'Pending');
  safeCheck(form, 'c16', vehicle?.status === 'Pending');
  safeCheck(form, 'c17', vehicle?.status === 'Sold');

  form.updateFieldAppearances(helvetica);
  form.flatten();

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

/** Main dispatcher called when forms are submitted */
export async function renderFormPdf({ formType, form, data, vehicle, dealership, terms, submittedAt }) {
  try {
    if (formType === 'PURCHASE_CONTRACT') {
      return await renderPurchaseContractPdf({ data, vehicle, dealership, terms, submittedAt });
    }
    if (formType === 'LOAN_APPLICATION') {
      return await renderLoanApplicationPdf({ data, vehicle, dealership, terms, submittedAt });
    }
    if (formType === 'INSPECTION_REPORT') {
      return await renderInspectionReportPdf({ data, vehicle, dealership, submittedAt });
    }
  } catch (err) {
    console.error(`[formPdf] Error rendering official template for ${formType}, using fallback sheet:`, err?.message || err);
  }

  return renderFallbackPdf({ formType, form, data, vehicle, dealership, terms, submittedAt });
}

// ──────────────────────────────────────────────────────────────────────
// Fallback programmatic layout (guarantees zero crashes if template file is ever absent)
// ──────────────────────────────────────────────────────────────────────

const TEAL = rgb(0.059, 0.463, 0.431);
const INK = rgb(0.07, 0.09, 0.15);
const MUTE = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.75, 0.77, 0.8);
const TINT = rgb(0.9, 0.95, 0.95);
const M = 40;

class Sheet {
  constructor(pdf, fonts, { title, subtitle, size = [612, 792], footer }) {
    this.pdf = pdf; this.font = fonts.regular; this.bold = fonts.bold; this.title = title; this.subtitle = subtitle; this.size = size; this.footer = footer;
    this.pageNo = 0; this.newPage();
  }
  safe(text, font = this.font) {
    const set = new Set(font.getCharacterSet());
    return [...String(text ?? '').replace(/[\r\n\t]+/g, ' ')].map((ch) => (set.has(ch.codePointAt(0)) ? ch : '?')).join('');
  }
  newPage() {
    this.page = this.pdf.addPage(this.size);
    this.pageNo += 1;
    const [w, h] = this.size;
    this.page.drawRectangle({ x: 0, y: h - 58, width: w, height: 58, color: TEAL });
    this.page.drawText(this.safe(this.title, this.bold), { x: M, y: h - 30, size: w < 400 ? 14 : 17, font: this.bold, color: rgb(1, 1, 1) });
    if (this.subtitle) this.page.drawText(this.safe(this.subtitle).slice(0, 110), { x: M, y: h - 46, size: 8.5, font: this.font, color: rgb(1, 1, 1) });
    this.page.drawText(this.safe(this.footer || ''), { x: M, y: 22, size: 6.5, font: this.font, color: MUTE });
    this.page.drawText(`Page ${this.pageNo}`, { x: w - M - 28, y: 22, size: 7, font: this.font, color: MUTE });
    this.y = h - 78;
  }
  need(height) { if (this.y - height < 44) this.newPage(); }
  get width() { return this.size[0] - 2 * M; }
  wrap(text, font, size, maxWidth) {
    const words = this.safe(text, font).split(' ');
    const lines = []; let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth || !line) line = test; else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }
  section(title) {
    this.need(34); this.y -= 8;
    this.page.drawRectangle({ x: M, y: this.y - 4, width: this.width, height: 16, color: TINT });
    this.page.drawText(this.safe(title.toUpperCase(), this.bold), { x: M + 6, y: this.y, size: 9, font: this.bold, color: TEAL });
    this.y -= 22;
  }
  cells(cells) {
    const total = cells.reduce((s, c) => s + (c[2] || 1), 0);
    const gap = 8; const avail = this.width - gap * (cells.length - 1);
    const prepared = cells.map(([label, value, weight = 1]) => {
      const w = (avail * weight) / total;
      return { label, w, lines: this.wrap(value || '—', this.font, 9.5, w) };
    });
    const rows = Math.max(...prepared.map((c) => c.lines.length));
    const height = 12 + rows * 12 + 10;
    this.need(height);
    let x = M;
    for (const c of prepared) {
      this.page.drawText(this.safe(c.label.toUpperCase(), this.font).slice(0, 60), { x, y: this.y, size: 6.5, font: this.font, color: MUTE });
      c.lines.forEach((line, i) => this.page.drawText(line, { x, y: this.y - 12 - i * 12, size: 9.5, font: this.font, color: INK }));
      this.page.drawLine({ start: { x, y: this.y - height + 8 }, end: { x: x + c.w, y: this.y - height + 8 }, thickness: 0.5, color: LINE });
      x += c.w + gap;
    }
    this.y -= height;
  }
  paragraph(text, { size = 8, bold = false, lead = 11 } = {}) {
    const font = bold ? this.bold : this.font;
    for (const block of String(text).split('\n')) {
      for (const line of this.wrap(block, font, size, this.width)) {
        this.need(lead); this.page.drawText(line, { x: M, y: this.y - size, size, font, color: INK }); this.y -= lead;
      }
      this.y -= 2;
    }
    this.y -= 3;
  }
  signature(label, name, when) {
    this.need(54); this.y -= 8;
    this.page.drawText(this.safe(name || ''), { x: M, y: this.y - 14, size: 15, font: this.fonts?.script || this.font, color: INK });
    this.page.drawLine({ start: { x: M, y: this.y - 20 }, end: { x: M + 280, y: this.y - 20 }, thickness: 0.7, color: INK });
    this.page.drawText(this.safe(label), { x: M, y: this.y - 31, size: 7.5, font: this.font, color: MUTE });
    this.page.drawText(this.safe(when || ''), { x: M + 310, y: this.y - 14, size: 10, font: this.font, color: INK });
    this.page.drawLine({ start: { x: M + 310, y: this.y - 20 }, end: { x: M + 460, y: this.y - 20 }, thickness: 0.7, color: INK });
    this.page.drawText('Date signed', { x: M + 310, y: this.y - 31, size: 7.5, font: this.font, color: MUTE });
    this.y -= 44;
  }
}

async function newDoc(options) {
  const pdf = await PDFDocument.create();
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold), script: await pdf.embedFont(StandardFonts.TimesRomanItalic) };
  const sheet = new Sheet(pdf, fonts, options);
  sheet.fonts = fonts;
  return { pdf, sheet };
}

const vehicleName = (v) => [v?.year, v?.make, v?.model].filter(Boolean).join(' ');

function vehicleCells(sheet, v) {
  sheet.section('Vehicle');
  sheet.cells([['Year', String(v?.year || ''), 0.6], ['Make', v?.make, 1.2], ['Model', v?.model, 1.3], ['Color', v?.color, 1]]);
  sheet.cells([['VIN', v?.vin, 2.2], ['Stock #', v?.stockNumber, 1], ['Odometer (miles)', v?.mileage != null ? Number(v.mileage).toLocaleString('en-US') : '', 1.2]]);
}

const answer = (data, field) => {
  const value = data[field.key];
  if (value === undefined || value === '') return '';
  if (field.type === 'date') return dateText(value);
  if (field.type === 'number') return money(value);
  return value;
};

function answerSections(sheet, form, data) {
  if (!form?.sections) return;
  for (const section of form.sections) {
    const fields = section.fields;
    if (/optional/i.test(section.title) && fields.every((f) => !answer(data, f))) continue;
    sheet.section(section.title);
    const isChecklist = fields.every((f) => f.type === 'radio' && f.inline && f.options.length === 4);
    if (isChecklist) {
      for (let i = 0; i < fields.length; i += 2) {
        sheet.cells(fields.slice(i, i + 2).map((f) => [f.label, answer(data, f) || 'Not marked', 1]));
      }
      continue;
    }
    let row = [];
    const flush = () => { if (row.length) sheet.cells(row); row = []; };
    for (const f of fields) {
      const weight = f.full || f.type === 'textarea' ? 3 : f.half ? 0.6 : 1;
      if (f.full || f.type === 'textarea') { flush(); sheet.cells([[f.label, answer(data, f), 3]]); continue; }
      row.push([f.label, answer(data, f), weight]);
      if (row.length === 3) flush();
    }
    flush();
  }
}

async function renderFallbackPdf({ formType, form, data, vehicle, dealership, terms, submittedAt }) {
  const dealer = dealership?.name || 'Dealership';
  const title = form?.title || (formType === 'PURCHASE_CONTRACT' ? 'Motor Vehicle Purchase Contract' : formType === 'LOAN_APPLICATION' ? 'Vehicle Credit Application' : 'Used Vehicle Inspection Report');
  const footer = `Submitted online ${dateText(submittedAt)} through a secure DealerOS AI link.`;
  const { pdf, sheet } = await newDoc({ title, subtitle: `${dealer}${dealership?.phone ? `   |   ${dealership.phone}` : ''}`, footer });
  pdf.setTitle(title);

  if (formType === 'PURCHASE_CONTRACT') {
    sheet.cells([['Contract date', dateText(submittedAt), 1], ['Dealership', dealer, 2], ['Deal / stock #', vehicle?.stockNumber, 1]]);
    if (form) {
      answerSections(sheet, { sections: [form.sections[0]] }, data);
      answerSections(sheet, { sections: [form.sections[1]] }, data);
    }
    vehicleCells(sheet, vehicle);
    if (form) answerSections(sheet, { sections: [form.sections[2]] }, data);
    sheet.section('Price and charges (set by the dealership)');
    const t = terms || {};
    const lines = [['Cash price of vehicle', t.cashPrice], ['Documentary / doc fee', t.docFee], ['Sales tax, title and registration', t.taxAndFees], ['Service contract / add-ons', t.addOns], ['Less trade-in allowance', t.tradeAllowance ? -Math.abs(t.tradeAllowance) : null], ['Less cash down payment', data.cashDown ? -Math.abs(Number(data.cashDown)) : null]];
    for (let i = 0; i < lines.length; i += 2) sheet.cells(lines.slice(i, i + 2).map(([l, v]) => [l, v == null ? '' : money(v)]));
    const total = lines.reduce((s, [, v]) => s + (Number(v) || 0), 0);
    sheet.cells([['TOTAL AMOUNT DUE', money(total), 1]]);
    if (form) answerSections(sheet, { sections: [form.sections[3]] }, data);
    sheet.signature('Buyer signature (typed and agreed online)', data.signature, dateText(submittedAt));
  } else if (formType === 'LOAN_APPLICATION') {
    sheet.cells([['Application date', dateText(submittedAt), 1], ['Dealership', dealer, 2]]);
    if (form) answerSections(sheet, { sections: form.sections.slice(0, 3) }, data);
    vehicleCells(sheet, vehicle);
    sheet.cells([['Cash price', money(terms?.cashPrice), 1], ['Asking / list price', money(vehicle?.askingPrice), 1]]);
    if (form) answerSections(sheet, { sections: form.sections.slice(3) }, data);
    sheet.signature('Applicant signature (typed and agreed online)', data.signature, dateText(submittedAt));
  } else {
    sheet.cells([['Inspection date', dateText(data.inspectionDate), 1], ['Inspector', data.inspectorName, 1.4], ['Shop', data.shop, 1.4]]);
    vehicleCells(sheet, { ...vehicle, mileage: data.odometer ?? vehicle?.mileage });
    if (form) answerSections(sheet, { sections: form.sections.slice(1) }, data);
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

async function renderFallbackStickerPdf({ vehicle, dealership }) {
  const { pdf, sheet } = await newDoc({ title: 'USED VEHICLE INFORMATION SHEET', subtitle: 'Display beside the FTC Buyers Guide.', footer: 'Generated by DealerOS AI' });
  sheet.section(vehicleName(vehicle) || 'Vehicle');
  sheet.cells([['Year', String(vehicle.year || ''), 0.6], ['Make', vehicle.make, 1.2], ['Model', vehicle.model, 1.3], ['Color', vehicle.color, 1]]);
  sheet.cells([['VIN', vehicle.vin, 2.2], ['Stock #', vehicle.stockNumber, 1], ['Odometer', vehicle.mileage != null ? `${Number(vehicle.mileage).toLocaleString('en-US')} mi` : '', 1]]);
  sheet.section('Price');
  sheet.cells([['Our price', money(vehicle.askingPrice) || 'Ask for price', 1], ['Doc fee', '', 1]]);
  sheet.section('Dealership');
  sheet.cells([['Name', dealership?.name, 1.6], ['Phone', dealership?.phone, 1], ['Email', dealership?.email, 1.3]]);
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

async function renderFallbackHangtagPdf({ vehicle, dealership }) {
  const { pdf, sheet } = await newDoc({ title: dealership?.name || 'VEHICLE HANGTAG', subtitle: 'Hang from the rear-view mirror', footer: 'Generated by DealerOS AI', size: [396, 612] });
  sheet.section('Vehicle');
  sheet.cells([['Year', String(vehicle.year || ''), 0.7], ['Make', vehicle.make, 1.2], ['Model', vehicle.model, 1]]);
  sheet.cells([['Color', vehicle.color, 1], ['Odometer', vehicle.mileage != null ? Number(vehicle.mileage).toLocaleString('en-US') : '', 1], ['VIN', vehicle.vin, 1]]);
  sheet.section('Price');
  sheet.y -= 4;
  sheet.page.drawText(sheet.safe(money(vehicle.askingPrice) || 'Ask for price', sheet.bold), { x: M, y: sheet.y - 30, size: 30, font: sheet.bold, color: INK });
  sheet.y -= 56;
  sheet.cells([['Phone', dealership?.phone, 1]]);
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
