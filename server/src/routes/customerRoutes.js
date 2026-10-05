import express from 'express';
import prisma from '../db/prisma.js';
import { upload } from '../config/upload.js';
import { matchRecords, summarizeCustomer } from '../utils/customerMatch.js';

// Where a customer came from (CarGurus, Google, Referral, or typed in). Trimmed free text.
const cleanLeadSource = (value) => {
  const text = String(value ?? '').trim().slice(0, 60);
  return text || null;
};

const router = express.Router();

// A malformed id used to reach Prisma and come back as a 500 with a database error message.
const OBJECT_ID = /^[a-f0-9]{24}$/i;
router.param('id', (req, res, next, id) => (OBJECT_ID.test(id) ? next() : res.status(404).json({ message: 'Customer not found' })));
router.param('docId', (req, res, next, id) => (OBJECT_ID.test(id) ? next() : res.status(404).json({ message: 'Document not found' })));

// "YYYY-MM-DD" or null. Stored at noon UTC so the calendar day reads the same in any timezone.
// Dates up to a day ahead are allowed to cover a client in a timezone ahead of the server.
function parseVisitDate(value) {
  if (value === null || value === '') return { value: null };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: 'Visit date must be YYYY-MM-DD.' };
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return { error: 'Visit date is not a real date.' };
  if (date.getTime() > Date.now() + 36 * 60 * 60 * 1000) return { error: 'A visit cannot be in the future.' };
  return { value: date };
}

const META_PREFIX = 'APH_CUSTOMER_META:';

function buildCustomerNotes(meta) {
  return `${META_PREFIX}${JSON.stringify(meta)}`;
}

// GET all customers for the dealership
router.get('/', async (req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({
      where: { dealershipId: req.dealershipId },
      orderBy: { createdAt: 'desc' }
    });

    // Cars bought and last visit per customer. If this extra lookup fails the list still loads.
    try {
      const [sales, notes] = await Promise.all([
        prisma.sale.findMany({ where: { dealershipId: req.dealershipId }, select: { id: true, customerName: true, phone: true, saleDate: true } }),
        prisma.customerNote.findMany({ where: { dealershipId: req.dealershipId }, select: { id: true, customerName: true, phone: true, email: true, createdAt: true } }),
      ]);
      const salesBy = matchRecords(customers, sales, { name: (r) => r.customerName, phone: (r) => r.phone });
      const notesBy = matchRecords(customers, notes, { name: (r) => r.customerName, phone: (r) => r.phone, email: (r) => r.email });
      return res.json(customers.map((c) => ({ ...c, ...summarizeCustomer(c, salesBy.get(c.id) ?? [], notesBy.get(c.id) ?? []) })));
    } catch (statsErr) {
      console.error('[Customers Stats Error]', statsErr?.message);
    }
    res.json(customers);
  } catch (err) {
    console.error('[Customers List Error]', {
      dealershipId: req.dealershipId,
      role: req.user?.role,
      message: err?.message,
    });
    // Keep UI alive even on query issues.
    res.json([]);
  }
});

// POST create customer
router.post('/', async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, address, city, state, zip, driverLicense, notes, leadSource, lastVisitAt } = req.body;
    if (!firstName) {
      return res.status(400).json({ message: 'First name is required' });
    }
    const visit = parseVisitDate(lastVisitAt ?? null);
    if (visit.error) return res.status(400).json({ message: visit.error });
    const customer = await prisma.customer.create({
      data: {
        firstName,
        lastName: lastName || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        driverLicense: driverLicense || null,
        notes: notes || null,
        leadSource: cleanLeadSource(leadSource),
        lastVisitAt: visit.value,
        dealershipId: req.dealershipId
      }
    });
    res.status(201).json(customer);
  } catch (err) {
    next(err);
  }
});

// POST import customers from existing sales data
router.post('/import-from-sales', async (req, res, next) => {
  try {
    const sales = await prisma.sale.findMany({
      where: { dealershipId: req.dealershipId },
      select: {
        customerName: true,
        phone: true,
        address: true,
        driverLicense: true,
        vehicleId: true,
        vehicle: {
          select: {
            year: true,
            make: true,
            model: true,
            vin: true
          }
        }
      }
    });

    let created = 0;
    let updated = 0;

    for (const sale of sales) {
      if (!sale.customerName?.trim()) continue;

      const nameParts = sale.customerName.trim().split(/\s+/);
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.slice(1).join(' ') || null;

      let city = null, state = null, zip = null, streetAddress = null;
      if (sale.address) {
        const parts = sale.address.split(',').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 4) {
          zip = parts.pop() || null;
          state = parts.pop() || null;
          city = parts.pop() || null;
          streetAddress = parts.join(', ') || null;
        } else {
          streetAddress = sale.address;
        }
      }

      const customerData = {
        firstName,
        lastName,
        phone: sale.phone || null,
        address: streetAddress,
        city,
        state,
        zip,
        driverLicense: sale.driverLicense || null,
        notes: buildCustomerNotes({
          category: 'Bought Vehicle',
          vehicleId: sale.vehicleId,
          vehicleLabel: sale.vehicle ? [sale.vehicle.year, sale.vehicle.make, sale.vehicle.model].filter(Boolean).join(' ') || sale.vehicle.vin : undefined
        }),
        dealershipId: req.dealershipId
      };

      const existing = await prisma.customer.findFirst({
        where: {
          dealershipId: req.dealershipId,
          OR: [
            ...(sale.phone ? [{ phone: sale.phone, firstName }] : []),
            { firstName, lastName },
            ...(streetAddress ? [{ firstName, address: streetAddress }] : [])
          ]
        }
      });

      if (existing) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: Object.fromEntries(
            Object.entries(customerData).filter(([, value]) => value !== null && value !== '')
          )
        });
        updated++;
      } else {
        await prisma.customer.create({ data: customerData });
        created++;
      }
    }

    res.json({
      message: `Imported ${created} new customer${created === 1 ? '' : 's'} and updated ${updated} from sales records`,
      count: created,
      updated
    });
  } catch (err) {
    next(err);
  }
});

// GET single customer
router.get('/:id', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId }
    });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    // Same matching as the customer list, so "cars bought" and this list always agree. The
    // matching pass skips the bill-of-sale files; only the matched sales are loaded in full.
    const candidates = await prisma.sale.findMany({
      where: { dealershipId: req.dealershipId },
      select: { id: true, customerName: true, phone: true },
    });
    const matchedIds = (matchRecords([customer], candidates, { name: (r) => r.customerName, phone: (r) => r.phone }).get(customer.id) ?? []).map((r) => r.id);
    const matchedSales = matchedIds.length
      ? await prisma.sale.findMany({ where: { id: { in: matchedIds }, dealershipId: req.dealershipId }, include: { vehicle: true } })
      : [];

    // For each matched sale, get the vehicle's documents
    const salesWithDocs = await Promise.all(matchedSales.map(async (sale) => {
      const docs = [];
      
      if (sale.billOfSaleBase64) {
        docs.push({ type: 'Bill of Sale', base64: sale.billOfSaleBase64, name: 'Bill of Sale' });
      }

      if (sale.vehicle?.vin) {
        // Insurance
        const insurances = await prisma.insurancePolicy.findMany({
          where: { vin: sale.vehicle.vin, dealershipId: req.dealershipId, documentBase64: { not: null } }
        });
        insurances.forEach(i => docs.push({ type: 'Insurance', base64: i.documentBase64, name: i.provider }));

        // Warranty
        const warranties = await prisma.warrantyContract.findMany({
          where: { vin: sale.vehicle.vin, dealershipId: req.dealershipId, documentBase64: { not: null } }
        });
        warranties.forEach(w => docs.push({ type: 'Warranty', base64: w.documentBase64, name: w.warrantyCompany }));
        
        // Registry Docs
        // documentBase64 is a required column on the registry, so it can't be filtered with
        // `not: null` (Prisma rejects that, which made this whole request fail with a 500).
        const registries = await prisma.documentRegistry.findMany({
          where: { vin: sale.vehicle.vin, dealershipId: req.dealershipId }
        });
        registries.forEach(r => docs.push({ type: r.documentType || 'Document', base64: r.documentBase64, name: r.sourceFileName || r.documentType }));
      }

      return {
        ...sale,
        documents: docs
      };
    }));

    const notes = await prisma.customerNote.findMany({
      where: { dealershipId: req.dealershipId },
      select: { id: true, customerName: true, phone: true, email: true, createdAt: true },
    });
    const customerNotes = matchRecords([customer], notes, { name: (r) => r.customerName, phone: (r) => r.phone, email: (r) => r.email }).get(customer.id) ?? [];

    res.json({
      ...customer,
      ...summarizeCustomer(customer, salesWithDocs, customerNotes),
      sales: salesWithDocs
    });
  } catch (err) {
    next(err);
  }
});

// PUT update customer
router.put('/:id', async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, address, city, state, zip, driverLicense, notes, leadSource, lastVisitAt } = req.body;
    if (!firstName) {
      return res.status(400).json({ message: 'First name is required' });
    }
    // Only changed when the form sends it (null clears it), so other clients don't wipe it.
    const visit = lastVisitAt === undefined ? null : parseVisitDate(lastVisitAt);
    if (visit?.error) return res.status(400).json({ message: visit.error });

    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId }
    });
    if (!existing) return res.status(404).json({ message: 'Customer not found' });

    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        firstName,
        lastName: lastName || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        driverLicense: driverLicense || null,
        notes: notes || null,
        // Only touched when the form sends it, so older clients don't wipe a saved source.
        ...(leadSource !== undefined && { leadSource: cleanLeadSource(leadSource) }),
        ...(visit && { lastVisitAt: visit.value }),
      }
    });
    res.json(customer);
  } catch (err) {
    next(err);
  }
});

// POST record a visit: today by default, or { date: 'YYYY-MM-DD' } for an earlier one.
router.post('/:id/visit', async (req, res, next) => {
  try {
    const parsed = req.body?.date ? parseVisitDate(req.body.date) : { value: new Date() };
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const { count } = await prisma.customer.updateMany({
      where: { id: req.params.id, dealershipId: req.dealershipId },
      data: { lastVisitAt: parsed.value },
    });
    if (!count) return res.status(404).json({ message: 'Customer not found' });
    res.json({ id: req.params.id, lastVisitAt: parsed.value });
  } catch (err) {
    next(err);
  }
});

// DELETE customer
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await prisma.customer.deleteMany({
      where: { id: req.params.id, dealershipId: req.dealershipId }
    });
    if (result.count === 0) return res.status(404).json({ message: 'Customer not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST upload customer document
router.post('/:id/documents', upload.single('file'), async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId },
    });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    if (!req.file) return res.status(400).json({ message: 'Document file is required' });

    const documentName = String(req.body.documentName || '').trim();
    if (!documentName) return res.status(400).json({ message: 'Document name is required' });

    const customerName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.firstName;

    const doc = await prisma.customerDocument.create({
      data: {
        customerId: customer.id,
        customerName,
        documentName,
        fileName: req.file.originalname || 'customer-document',
        mimeType: req.file.mimetype || 'application/octet-stream',
        fileBase64: req.file.buffer.toString('base64'),
        dealershipId: req.dealershipId,
      },
    });

    res.status(201).json({
      id: doc.id,
      customerId: doc.customerId,
      customerName: doc.customerName,
      documentName: doc.documentName,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      createdAt: doc.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

// GET list customer documents
router.get('/:id/documents', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId },
      select: { id: true },
    });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const docs = await prisma.customerDocument.findMany({
      where: { customerId: customer.id, dealershipId: req.dealershipId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        customerId: true,
        customerName: true,
        documentName: true,
        fileName: true,
        mimeType: true,
        createdAt: true,
      },
    });

    res.json(docs);
  } catch (err) {
    next(err);
  }
});

// GET download customer document
router.get('/documents/:docId/download', async (req, res, next) => {
  try {
    const doc = await prisma.customerDocument.findFirst({
      where: { id: req.params.docId, dealershipId: req.dealershipId },
      select: { fileBase64: true, fileName: true, mimeType: true },
    });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const buffer = Buffer.from(doc.fileBase64, 'base64');
    res.writeHead(200, {
      'Content-Type': doc.mimeType || 'application/octet-stream',
      'Content-Length': buffer.length,
      'Content-Disposition': `attachment; filename="${String(doc.fileName || 'customer-document').replace(/[^\w.\- ]+/g, '_')}"`,
    });
    res.end(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
