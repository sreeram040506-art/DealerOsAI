import express from 'express';
import multer from 'multer';
import prisma from '../db/prisma.js';
import { extractText, extractVinFromText, extractTotalFromText, isValidVin } from '../../services/documentParser.js';
import { vehicleCache } from '../utils/cache.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function pickRepairTotal({ rawText, bodyTotal }) {
  const manualTotal = Number.parseFloat(bodyTotal);
  if (Number.isFinite(manualTotal) && manualTotal > 0) {
    return manualTotal;
  }

  const extractedRepairTotal = extractTotalFromText(rawText, 'repair');
  const extractedAutoTotal = extractedRepairTotal ?? extractTotalFromText(rawText, '');
  const extracted = Number(extractedAutoTotal);
  return Number.isFinite(extracted) && extracted >= 0 ? extracted : 0;
}

router.post('/', async (req, res, next) => {
  const { vehicleId, repairShop, partsCost, laborCost, description, repairDate } = req.body;
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, dealershipId: req.dealershipId },
      select: { id: true }
    });
    if (!vehicle) {
      return res.status(404).json({ status: 'error', message: 'Vehicle not found' });
    }

    const parsedPartsCost = parseFloat(partsCost) || 0;
    const parsedLaborCost = parseFloat(laborCost) || 0;

    const repair = await prisma.repair.create({
      data: {
        vehicleId,
        repairShop,
        partsCost: parsedPartsCost,
        laborCost: parsedLaborCost,
        description,
        repairDate: new Date(repairDate || Date.now()),
        dealershipId: req.dealershipId
      }
    });

    const cacheKey = `vehicle-list:${req.dealershipId}`;
    vehicleCache.delete(cacheKey);

    res.status(201).json(repair);
  } catch (err) {
    next(err);
  }
});

// Upload repair bill: extract VIN and total, attach repair to matching vehicle
router.post('/upload-bill', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'No file uploaded' });

    // For repair bills, VIN must be derived from the document text.
    // Frontend VIN fallback can be stale or OCR-noise -> causes wrong VIN lookups.
    const rawText = await extractText(req.file.buffer, req.file.mimetype);

    let vin = extractVinFromText(rawText);
    vin = vin ? String(vin).trim().toUpperCase() : null;
    if (vin && !isValidVin(vin)) {
      console.warn('[Repair Upload] Extracted VIN failed validation; discarding.', { vin });
      vin = null;
    }

    // Debug: helps confirm whether VIN or dealership scoping causes the "not found"
    console.log('[Repair Upload] VIN debug:', {
      dealershipId: req.dealershipId,
      finalVin: vin,
      rawTextSnippet: rawText ? rawText.replace(/\s+/g, ' ').slice(0, 120) : null
    });

    // Primary: repair-purpose total extraction
    // Fallback: auto extraction if repair-specific markers don't match the invoice format
    const total = pickRepairTotal({ rawText, bodyTotal: req.body.total });

    if (!vin) return res.status(400).json({ status: 'error', message: 'VIN not found in repair bill' });

    // Strict tenant-scoped VIN lookup.
    const vehicle = await prisma.vehicle.findFirst({
      where: { vin, dealershipId: req.dealershipId }
    });

    if (!vehicle) {
      return res.status(404).json({ status: 'error', message: `Vehicle with VIN ${vin} not found` });
    }

    // Try to infer shop/vendor name from top of document
    const candidateLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 6);
    let vendor = null;
    for (const line of candidateLines) {
      if (/TOTAL|INVOICE|BILL|AMOUNT|DATE/i.test(line)) continue;
      if (/[A-Za-z]{3,}/.test(line) && line.length > 3) { vendor = line; break; }
    }

    const repair = await prisma.repair.create({
      data: {
        vehicleId: vehicle.id,
        repairShop: vendor || 'Uploaded Repair Bill',
        partsCost: total || 0,
        laborCost: 0,
        description: req.body.description || `Repair bill uploaded: ${req.file.originalname}`,
        documentBase64: req.file.buffer.toString('base64'),
        sourceFileName: req.file.originalname || null,
        repairDate: new Date(),
        dealershipId: req.dealershipId
      }
    });

    const cacheKey = `vehicle-list:${req.dealershipId}`;
    vehicleCache.delete(cacheKey);

    res.json({ status: 'success', success: true, repair, vin, total });
  } catch (err) {
    next(err);
  }
});

export default router;
