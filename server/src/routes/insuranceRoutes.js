import express from 'express';
import multer from 'multer';
import prisma from '../db/prisma.js';
import { extractVehicleInfo } from '../../services/documentParser.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function normalizeVin(value = '') {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
}

function addYear(value) {
  const num = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(num) ? num : null;
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.insurancePolicy.findMany({
      where: { dealershipId: req.dealershipId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { provider, policyNumber, effectiveDate, expirationDate, coverage, customerName, vin, status, notes } = req.body;
    if (!provider || !policyNumber || !effectiveDate || !expirationDate) {
      return res.status(400).json({ message: 'provider, policyNumber, effectiveDate, and expirationDate are required' });
    }
    const row = await prisma.insurancePolicy.create({
      data: {
        provider,
        policyNumber,
        effectiveDate: new Date(effectiveDate),
        expirationDate: new Date(expirationDate),
        coverage: coverage || null,
        customerName: customerName || null,
        vin: vin || null,
        status: status || 'ACTIVE',
        notes: notes || null,
        dealershipId: req.dealershipId,
      },
    });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

router.post('/upload-document', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Document file is required' });

    const info = await extractVehicleInfo(req.file.buffer, req.file.mimetype, '');
    const parsedVin = normalizeVin(info?.vin || req.body?.vin || '');

    let vehicle = null;
    if (parsedVin) {
      vehicle = await prisma.vehicle.findFirst({
        where: { dealershipId: req.dealershipId, vin: parsedVin },
        include: { sale: true }
      });
    }

    const make = info?.make || vehicle?.make || null;
    const model = info?.model || vehicle?.model || null;
    const year = addYear(info?.year || vehicle?.year);
    const customerName = req.body?.customerName || info?.disposedTo || vehicle?.sale?.customerName || null;

    const now = new Date();
    const oneYearLater = new Date(now);
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    const row = await prisma.insurancePolicy.create({
      data: {
        provider: req.body?.provider || 'Uploaded Insurance Document',
        policyNumber: req.body?.policyNumber || `AUTO-${Date.now()}`,
        effectiveDate: req.body?.effectiveDate ? new Date(req.body.effectiveDate) : now,
        expirationDate: req.body?.expirationDate ? new Date(req.body.expirationDate) : oneYearLater,
        coverage: req.body?.coverage || null,
        customerName,
        vin: parsedVin || null,
        make,
        model,
        year,
        sourceFileName: req.file.originalname || null,
        documentBase64: req.file.buffer.toString('base64'),
        status: req.body?.status || 'ACTIVE',
        notes: req.body?.notes || null,
        dealershipId: req.dealershipId,
      },
    });

    res.status(201).json({
      ...row,
      parsedVehicle: { vin: parsedVin || null, make, model, year }
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.insurancePolicy.findFirst({ where: { id: req.params.id, dealershipId: req.dealershipId } });
    if (!existing) return res.status(404).json({ message: 'Insurance policy not found' });

    const { effectiveDate, expirationDate, ...rest } = req.body;
    const row = await prisma.insurancePolicy.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(effectiveDate ? { effectiveDate: new Date(effectiveDate) } : {}),
        ...(expirationDate ? { expirationDate: new Date(expirationDate) } : {}),
      },
    });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await prisma.insurancePolicy.deleteMany({ where: { id: req.params.id, dealershipId: req.dealershipId } });
    if (!result.count) return res.status(404).json({ message: 'Insurance policy not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
