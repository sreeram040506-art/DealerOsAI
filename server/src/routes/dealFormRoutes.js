import express from 'express';
import prisma from '../db/prisma.js';
import { decodeVin } from '../services/vinDecoder.js';
import { DEAL_FORMS, describeForms, prefill, renderForm, withTotals } from '../services/dealForms.js';

const router = express.Router();

const isObjectId = (v) => /^[a-f0-9]{24}$/i.test(String(v || ''));
const CARRIED = ['dealer_license_number', 'state_jurisdiction', 'warranty_type', 'warranty_labor_pct', 'warranty_parts_pct'];

async function loadSale(req) {
  if (!isObjectId(req.params.saleId)) return null;
  return prisma.sale.findFirst({
    where: { id: req.params.saleId, dealershipId: req.dealershipId },
    include: { vehicle: true },
  });
}

/** Staff-typed values win over what the app knows, which wins over nothing. */
async function currentValues(req, sale) {
  const dealership = await prisma.dealership.findUnique({ where: { id: req.dealershipId } });
  let decoded = {};
  try { if (sale.vehicle?.vin?.length === 17) decoded = await decodeVin(sale.vehicle.vin); } catch { /* NHTSA is optional */ }

  // Dealer licence number, state and warranty terms rarely change: reuse the last sale's.
  const previous = await prisma.sale.findFirst({
    where: { dealershipId: req.dealershipId, id: { not: sale.id }, NOT: { dealFormData: { equals: null } } },
    orderBy: { createdAt: 'desc' },
    select: { dealFormData: true },
  });
  const carried = Object.fromEntries(CARRIED.filter((k) => previous?.dealFormData?.[k]).map((k) => [k, previous.dealFormData[k]]));

  return { ...prefill({ sale, vehicle: sale.vehicle, dealership, decoded, carried }), ...(sale.dealFormData || {}) };
}

const cleanValues = (input) => {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (/^[a-z0-9_]{1,50}$/.test(k) && (typeof v === 'string' || typeof v === 'number')) out[k] = String(v).slice(0, 2000);
  }
  return out;
};

// GET /deal-forms/:saleId — field definitions, the forms, and current values
router.get('/:saleId', async (req, res, next) => {
  try {
    const sale = await loadSale(req);
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    const [meta, values] = await Promise.all([describeForms(), currentValues(req, sale)]);
    res.json({ ...meta, values });
  } catch (err) { next(err); }
});

// PUT /deal-forms/:saleId { values } — save what staff typed
router.put('/:saleId', async (req, res, next) => {
  try {
    const sale = await loadSale(req);
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    const values = cleanValues(req.body?.values);
    await prisma.sale.update({ where: { id: sale.id }, data: { dealFormData: values } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /deal-forms/:saleId/render { values?, forms? } — filled HTML for each form
router.post('/:saleId/render', async (req, res, next) => {
  try {
    const sale = await loadSale(req);
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    const base = await currentValues(req, sale);
    const values = withTotals({ ...base, ...cleanValues(req.body?.values) });
    const keys = Array.isArray(req.body?.forms) && req.body.forms.length ? req.body.forms : DEAL_FORMS.map((f) => f.key);
    const documents = [];
    for (const form of DEAL_FORMS.filter((f) => keys.includes(f.key))) {
      documents.push({ key: form.key, title: form.title, html: await renderForm(form.key, values) });
    }
    res.json({ documents });
  } catch (err) { next(err); }
});

export default router;
