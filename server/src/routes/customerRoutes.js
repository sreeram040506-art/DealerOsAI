import express from 'express';
import prisma from '../db/prisma.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});
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
    const { firstName, lastName, email, phone, address, city, state, zip, driverLicense, notes } = req.body;
    if (!firstName) {
      return res.status(400).json({ message: 'First name is required' });
    }
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

    // Find sales matching this customer
    const sales = await prisma.sale.findMany({
      where: {
        dealershipId: req.dealershipId,
        OR: [
          { customerName: { contains: customer.firstName, mode: 'insensitive' } },
          ...(customer.phone ? [{ phone: customer.phone }] : [])
        ]
      },
      include: {
        vehicle: true
      }
    });

    // Refine matching for sales (prevent false positives if just first name matches broadly)
    const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim().toLowerCase();
    const matchedSales = sales.filter(s => {
      if (s.phone && customer.phone && s.phone === customer.phone) return true;
      const saleName = s.customerName.toLowerCase();
      return saleName.includes(customer.firstName.toLowerCase()) && 
             (customer.lastName ? saleName.includes(customer.lastName.toLowerCase()) : true);
    });

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
        const registries = await prisma.documentRegistry.findMany({
          where: { vin: sale.vehicle.vin, dealershipId: req.dealershipId, documentBase64: { not: null } }
        });
        registries.forEach(r => docs.push({ type: r.documentType || 'Document', base64: r.documentBase64, name: r.sourceFileName || r.documentType }));
      }

      return {
        ...sale,
        documents: docs
      };
    }));

    res.json({
      ...customer,
      sales: salesWithDocs
    });
  } catch (err) {
    next(err);
  }
});

// PUT update customer
router.put('/:id', async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, address, city, state, zip, driverLicense, notes } = req.body;
    if (!firstName) {
      return res.status(400).json({ message: 'First name is required' });
    }

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
      }
    });
    res.json(customer);
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
      'Content-Disposition': `attachment; filename="${doc.fileName || 'customer-document'}"`,
    });
    res.end(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
