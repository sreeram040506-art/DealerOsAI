import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { allFields } from './formDefinitions.js';

const TEAL = rgb(0.059, 0.463, 0.431);
const INK = rgb(0.07, 0.09, 0.15);
const MUTE = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.75, 0.77, 0.8);
const TINT = rgb(0.9, 0.95, 0.95);
const M = 40;

const money = (value) => {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '';
  const n = Number(value);
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const dateText = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value || '') : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

/** A tiny top-to-bottom layout helper over pdf-lib. */
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
  /** Label above value, laid out in a row of columns: cells = [[label, value, weight]] */
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

/** Lays out the plain "label / answer" sections of a form, two or three per row. */
function answerSections(sheet, form, data) {
  for (const section of form.sections) {
    const fields = section.fields;
    // Optional sections the person left completely blank are skipped.
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

export async function renderFormPdf({ formType, form, data, vehicle, dealership, terms, submittedAt }) {
  const dealer = dealership?.name || 'Dealership';
  const footer = `Submitted online ${dateText(submittedAt)} through a secure DealerOS AI link. ${formType === 'INSPECTION_REPORT' ? '' : 'Have your attorney review before first use.'}`;
  const { pdf, sheet } = await newDoc({ title: form.title, subtitle: `${dealer}${dealership?.phone ? `   |   ${dealership.phone}` : ''}`, footer });
  pdf.setTitle(form.title);

  if (formType === 'PURCHASE_CONTRACT') {
    sheet.cells([['Contract date', dateText(submittedAt), 1], ['Dealership', dealer, 2], ['Deal / stock #', vehicle?.stockNumber, 1]]);
    answerSections(sheet, { sections: [form.sections[0]] }, data);
    answerSections(sheet, { sections: [form.sections[1]] }, data);
    vehicleCells(sheet, vehicle);
    answerSections(sheet, { sections: [form.sections[2]] }, data);
    sheet.section('Price and charges (set by the dealership)');
    const t = terms || {};
    const lines = [['Cash price of vehicle', t.cashPrice], ['Documentary / doc fee', t.docFee], ['Sales tax, title and registration', t.taxAndFees], ['Service contract / add-ons', t.addOns], ['Less trade-in allowance', t.tradeAllowance ? -Math.abs(t.tradeAllowance) : null], ['Less cash down payment', data.cashDown ? -Math.abs(Number(data.cashDown)) : null]];
    for (let i = 0; i < lines.length; i += 2) sheet.cells(lines.slice(i, i + 2).map(([l, v]) => [l, v == null ? '' : money(v)]));
    const total = lines.reduce((s, [, v]) => s + (Number(v) || 0), 0);
    sheet.cells([['TOTAL AMOUNT DUE', money(total), 1]]);
    answerSections(sheet, { sections: [form.sections[3]] }, data);
    sheet.section('Condition of sale');
    sheet.paragraph('Warranty: this vehicle is sold according to the Buyers Guide displayed on it. The information on the Buyers Guide is part of this contract and overrides any contrary provision below.', { size: 8 });
    sheet.paragraph('1. Delivery. The buyer takes delivery on the date above and accepts the vehicle in its present condition except as stated in the warranty section.\n2. Title. Seller will deliver a clear title, or pay off any lien shown above, within the time required by law, and states the vehicle is free of liens other than those disclosed.\n3. Odometer. The odometer reading shown is, to the best of the seller\'s knowledge, the actual mileage unless a separate Odometer Disclosure Statement says otherwise.\n4. Risk of loss. Buyer is responsible for insurance from delivery. Proof of insurance is required before the vehicle leaves the lot.\n5. Cancellation. This agreement is not binding on the seller until accepted by an authorized dealer representative. Any right to cancel is only as stated by applicable state law.\n6. Entire agreement. This contract and the documents it names are the whole agreement. Changes must be in writing and signed by both parties.', { size: 7.5, lead: 10 });
    sheet.paragraph(form.consent, { size: 8, bold: true });
    sheet.signature('Buyer signature (typed and agreed online)', data.signature, dateText(submittedAt));
    sheet.paragraph('Dealer acceptance: ______________________________   Date: ______________', { size: 8 });
  } else if (formType === 'LOAN_APPLICATION') {
    sheet.cells([['Application date', dateText(submittedAt), 1], ['Dealership', dealer, 2]]);
    answerSections(sheet, { sections: form.sections.slice(0, 3) }, data);
    vehicleCells(sheet, vehicle);
    sheet.cells([['Cash price', money(terms?.cashPrice), 1], ['Asking / list price', money(vehicle?.askingPrice), 1]]);
    answerSections(sheet, { sections: form.sections.slice(3) }, data);
    sheet.section('Authorization');
    sheet.paragraph(form.consent, { size: 7.5, lead: 10 });
    sheet.paragraph('Notice: federal law requires lenders to give notice of the reason for any adverse action. The lender, not the dealer, makes the final credit decision.', { size: 7.5 });
    sheet.signature('Applicant signature (typed and agreed online)', data.signature, dateText(submittedAt));
  } else {
    sheet.cells([['Inspection date', dateText(data.inspectionDate), 1], ['Inspector', data.inspectorName, 1.4], ['Shop', data.shop, 1.4]]);
    vehicleCells(sheet, { ...vehicle, mileage: data.odometer ?? vehicle?.mileage });
    answerSections(sheet, { sections: form.sections.slice(1) }, data);
    sheet.paragraph(form.consent, { size: 8, bold: true });
  }
  return Buffer.from(await pdf.save());
}

/** Used-car information sheet for the window, filled from the inventory record. */
export async function renderStickerPdf({ vehicle, dealership }) {
  const { pdf, sheet } = await newDoc({ title: 'USED VEHICLE INFORMATION SHEET', subtitle: 'Display beside the FTC Buyers Guide. This sheet does not replace the Buyers Guide.', footer: 'Generated by DealerOS AI' });
  sheet.section(vehicleName(vehicle) || 'Vehicle');
  sheet.cells([['Year', String(vehicle.year || ''), 0.6], ['Make', vehicle.make, 1.2], ['Model', vehicle.model, 1.3], ['Color', vehicle.color, 1]]);
  sheet.cells([['VIN', vehicle.vin, 2.2], ['Stock #', vehicle.stockNumber, 1], ['Odometer', vehicle.mileage != null ? `${Number(vehicle.mileage).toLocaleString('en-US')} mi` : '', 1]]);
  sheet.section('Price');
  sheet.cells([['Our price', money(vehicle.askingPrice) || 'Ask for price', 1], ['Doc fee', '', 1]]);
  sheet.section('Details to fill in');
  for (let i = 0; i < 3; i += 1) sheet.cells([['Feature', '', 1], ['Feature', '', 1]]);
  sheet.cells([['Title', 'Clean  /  Rebuilt  /  Lemon buyback', 1], ['Owners', '1   2   3+   Unknown', 1], ['Accident history', 'None  /  Reported  /  Unknown', 1.3]]);
  sheet.section('Dealership');
  sheet.cells([['Name', dealership?.name, 1.6], ['Phone', dealership?.phone, 1], ['Email', dealership?.email, 1.3]]);
  sheet.paragraph('Ask for the Buyers Guide, the vehicle inspection report and the history report. Price excludes tax, title and registration fees. Pictures may differ from the vehicle. Equipment and mileage are subject to verification at sale.', { size: 7 });
  return Buffer.from(await pdf.save());
}

/** Mirror hangtag (5.5 x 8.5 in). */
export async function renderHangtagPdf({ vehicle, dealership }) {
  const { pdf, sheet } = await newDoc({ title: dealership?.name || 'VEHICLE HANGTAG', subtitle: 'Hang from the rear-view mirror', footer: 'Generated by DealerOS AI', size: [396, 612] });
  sheet.section('Vehicle');
  sheet.cells([['Year', String(vehicle.year || ''), 0.7], ['Make', vehicle.make, 1.2]]);
  sheet.cells([['Model', vehicle.model, 1]]);
  sheet.cells([['Color', vehicle.color, 1], ['Odometer', vehicle.mileage != null ? Number(vehicle.mileage).toLocaleString('en-US') : '', 1]]);
  sheet.cells([['VIN', vehicle.vin, 1]]);
  sheet.cells([['Stock #', vehicle.stockNumber, 1], ['Key tag #', '', 1]]);
  sheet.section('Price');
  sheet.y -= 4;
  sheet.page.drawText(sheet.safe(money(vehicle.askingPrice) || 'Ask for price', sheet.bold), { x: M, y: sheet.y - 30, size: 30, font: sheet.bold, color: INK });
  sheet.y -= 56;
  sheet.cells([['Phone', dealership?.phone, 1]]);
  return Buffer.from(await pdf.save());
}
