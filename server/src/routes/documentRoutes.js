import express from 'express';
import multer from 'multer';
import { readFile } from 'fs/promises';
import {
  cleanDispositionName,
  extractAcquisitionDetailsFromText,
  extractDispositionDetailsFromText,
  extractTotalFromText,
  extractVehicleInfo,
  extractText,
  extractVinFromText,
  isValidVin
} from '../../services/documentParser.js';
import { buildUsedVehiclePdfFileName, fillUsedVehiclePdf } from '../../services/usedVehiclePdfService.js';
import prisma from '../db/prisma.js';

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const defaultUsedVehicleTemplatePath = new URL('../../used-vechile-report.jpeg', import.meta.url);
let cachedTemplateBuffer = null;

async function getTemplateBuffer() {
  if (!cachedTemplateBuffer) {
    cachedTemplateBuffer = await readFile(defaultUsedVehicleTemplatePath);
  }
  return cachedTemplateBuffer;
}

function parseCurrency(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).replace(/[^0-9.-]+/g, ""));
  return isNaN(parsed) ? 0 : parsed;
}

function isReasonableVehicleAmount(value) {
  const num = parseCurrency(value);
  return Number.isFinite(num) && num >= 50 && num <= 100000;
}

function hasBoilerplateVehicleText(value) {
  return /\b(any\s+legally\s+required|repairs?\s+prior\s+to\s+sale|terms?\s+and\s+conditions|warrant(?:y|ies)|purchaser\s+acknowledges|buyer\s+agree|seller\s+agree|disclosures?|arbitration|invoice|payment|remit|line\s+total|outstanding\s+balance|co\s+inc\s+buyer)\b/i.test(String(value || ''));
}

function sanitizeVehicleIdentity(info = {}) {
  const cleaned = { ...info };
  if (hasBoilerplateVehicleText(cleaned.make)) cleaned.make = '';
  if (hasBoilerplateVehicleText(cleaned.model)) cleaned.model = '';
  return cleaned;
}

function mergeExtractionInfo(baseInfo, fallbackInfo) {
  if (!baseInfo) return fallbackInfo || {};
  if (!fallbackInfo) return baseInfo;
  const merged = { ...baseInfo };
  for (const [key, value] of Object.entries(fallbackInfo)) {
    if (merged[key] === undefined || merged[key] === null || merged[key] === '') {
      merged[key] = value;
    }
  }
  return merged;
}

function clearDispositionInfo(info = {}) {
  return {
    ...info,
    disposedTo: '',
    disposedAddress: '',
    disposedCity: '',
    disposedState: '',
    disposedZip: '',
    disposedDate: null,
    disposedPrice: 0,
    disposedOdometer: 0,
    disposedDlNumber: '',
    disposedDlState: '',
  };
}

function isAuctionSourceName(value) {
  return /\b(ADESA|MANHEIM|CARMAX|CMAA|CENTRAL MASS|AMERICA'?S\s+(?:AA|AUTO AUCTION)|ACV|COPART|IAAI|AUCTION)\b/i.test(String(value || ''));
}

/**
 * Heuristic: detect whether a document looks like a REPAIR invoice/bill (not a Bill of Sale).
 * This is intentionally lightweight because the upload-auto endpoint already has more expensive
 * AI extraction later; we only need a quick keyword classification to choose the right path.
 */
function detectRepairDocument(rawText = '', fileName = '') {
  const text = String(rawText || '');
  const name = String(fileName || '').toUpperCase();

  // Filename-level guard to avoid misrouting obvious bill-of-sale uploads.
  if (/\b(BILL[\s_-]*OF[\s_-]*SALE|BOS)\b/i.test(name)) {
    return false;
  }

  // Hard stop: if this is clearly a bill of sale/disposition form, do NOT route as repair.
  // Many sale forms contain words like "inspection" or "service" in fee rows.
  if (
    /\b(BILL\s+OF\s+SALE|FOR\s+A\s+MOTOR\s+VEHICLE,\s*MOBILE\s+HOME,\s*OFF-HIGHWAY\s+VEHICLE\s+OR\s+VESSEL|DISPOSITION\s+OF\s+MOTOR\s+VEHICLE|MOTOR\s+VEHICLE\s+PURCHASE\s+CONTRACT|VEHICLE\s+INFORMATION|ITEMIZATION\s+OF\s+SALE|TOTAL\s+CONTRACT\s+PRICE|TOTAL\s+BALANCE\s+DUE|DEALER\/SELLER\s+NAME\s+AND\s+ADDRESS|PURCHASER(?:\(S\)|'S)?\s+NAME(?:\(S\))?(?:\s+AND\s+ADDRESS(?:\(ES\)|ES)?)?|WE\s+DO\s+HEREBY\s+SELL|SELLING\s+PRICE|ODOMETER\s+DISCLOSURE|CERTIFICATE\s+OF\s+TITLE\s+NUMBER)\b/i.test(
      text
    )
  ) {
    return false;
  }

  // Common repair/service invoice patterns (OCR tolerant)
  return /\b(repair|repairs?|service|serviced|work\s*order|invoice|mechanic|labor|part(s)?|parts|estimate|service\s+rendered|service\s+invoice)\b/i.test(
    text
  ) && (
    /\b(labor\s*cost|parts\s*cost|amount\s*due|total\s*due|bill\s*to|payment\s+due)\b/i.test(text) ||
    /\b(authorization|warranty|diagnostic|inspection)\b/i.test(text)
  );
}

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

function getBasePurchaseCost(purchase) {
  if (!purchase) return 0;
  return (Number(purchase.purchasePrice) || 0)
    + (Number(purchase.transportCost) || 0)
    + (Number(purchase.buyerFee) || 0)
    + (Number(purchase.inspectionCost) || 0)
    + (Number(purchase.registrationCost) || 0);
}

async function findRecentDuplicateRepair({ vehicleId, dealershipId, amount, sourceFileName }) {
  const normalizedAmount = Number(amount) || 0;
  const lookback = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const needle = sourceFileName ? `Repair bill uploaded: ${sourceFileName}` : '';

  const existing = await prisma.repair.findFirst({
    where: {
      vehicleId,
      dealershipId,
      partsCost: normalizedAmount,
      laborCost: 0,
      ...(needle ? { description: needle } : {}),
      createdAt: { gte: lookback }
    },
    orderBy: { createdAt: 'desc' }
  });

  return existing || null;
}

function normalizeVinToken(value) {
  return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function collectRepairVinCandidates(rawText = '', bodyVin = '') {
  const candidates = [];
  const seen = new Set();
  const bannedChunks = /(DATE|TOTAL|AMOUNT|INVOICE|REPAIR|LABOR|PARTS|SERVICE)/i;

  const addCandidate = (value, source = 'unknown') => {
    const vin = normalizeVinToken(value);
    if (vin.length !== 17) return;
    if (seen.has(vin)) return;
    if (bannedChunks.test(vin)) return;
    seen.add(vin);
    candidates.push({ vin, source });
  };

  if (bodyVin) addCandidate(bodyVin, 'body');

  const text = String(rawText || '').toUpperCase();
  const labeledRegexes = [
    /\bVIN\s*[:#]?\s*([A-HJ-NPR-Z0-9]{17})\b/g,
    /\bVEHICLE\s*IDENTIFICATION\s*NUMBER\s*[:#]?\s*([A-HJ-NPR-Z0-9]{17})\b/g
  ];
  for (const re of labeledRegexes) {
    for (const match of text.matchAll(re)) addCandidate(match[1], 'labeled');
  }

  const parserVin = extractVinFromText(text);
  if (parserVin) addCandidate(parserVin, 'parser');

  // OCR can split VIN characters with symbols/spaces. Try condensed per-line sliding windows.
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const condensed = normalizeVinToken(line);
    if (condensed.length < 17) continue;
    for (let i = 0; i + 17 <= condensed.length; i++) {
      addCandidate(condensed.slice(i, i + 17), 'line-window');
    }
  }

  return candidates;
}

async function resolveRepairVehicleFromCandidates(req, vinCandidates) {
  if (!vinCandidates.length) return null;
  const vins = vinCandidates.map((candidate) => candidate.vin);

  // 1) Exact match inside this dealership first.
  const exactVehicle = await prisma.vehicle.findFirst({
    where: {
      dealershipId: req.dealershipId,
      vin: { in: vins }
    }
  });
  if (exactVehicle) return { vehicle: exactVehicle, vin: exactVehicle.vin, mode: 'exact-dealership' };

  // 2) Fuzzy match with current dealership inventory only.
  const inventory = await prisma.vehicle.findMany({
    where: { dealershipId: req.dealershipId },
    select: { id: true, vin: true, dealershipId: true }
  });
  if (!inventory.length) return null;

  let best = null;
  for (const candidate of vinCandidates) {
    for (const inv of inventory) {
      const invVin = normalizeVinToken(inv.vin);
      const candVin = normalizeVinToken(candidate.vin);
      if (invVin.length !== 17 || candVin.length !== 17) continue;
      const dist = levenshteinDistance(invVin, candVin);
      const sharedTail = inv.vin.slice(-6) === candidate.vin.slice(-6);
      let score = 0;
      if (dist === 0) score = 10;
      else if (sharedTail) score = 8;
      else if (dist <= 2) score = 6;
      if (!score) continue;

      if (!best || score > best.score || (score === best.score && dist < best.dist)) {
        best = { vehicle: inv, score, dist, vin: inv.vin };
      }
    }
  }

  if (best && best.score >= 6) {
    return { vehicle: best.vehicle, vin: best.vin, mode: 'fuzzy-dealership' };
  }
  return null;
}

function collectBillOfSaleVinCandidates(docVin = '', bodyVin = '') {
  const candidates = [];
  const seen = new Set();

  const add = (value, source) => {
    const vin = normalizeVinToken(value);
    if (vin.length !== 17 || seen.has(vin)) return;
    seen.add(vin);
    candidates.push({ vin, source });
  };

  add(bodyVin, 'body');
  add(docVin, 'document');
  return candidates;
}

async function resolveBillOfSaleVehicle(req, vinCandidates) {
  if (!vinCandidates.length) return null;
  const candidateVins = vinCandidates.map((candidate) => candidate.vin);

  const exact = await prisma.vehicle.findFirst({
    where: {
      dealershipId: req.dealershipId,
      vin: { in: candidateVins }
    },
    include: { purchase: true, repairs: true, sale: true }
  });
  if (exact) return exact;

  const allVehicles = await prisma.vehicle.findMany({
    where: { dealershipId: req.dealershipId },
    include: { purchase: true, repairs: true, sale: true }
  });

  let best = null;
  for (const candidate of vinCandidates) {
    const candidateVin = normalizeVinToken(candidate.vin);
    for (const v of allVehicles) {
      const vehicleVin = normalizeVinToken(v.vin);
      if (vehicleVin.length !== 17 || candidateVin.length !== 17) continue;

      const dist = levenshteinDistance(vehicleVin, candidateVin);
      const shareSerial = vehicleVin.slice(-5) === candidateVin.slice(-5);

      let score = 0;
      if (dist === 0) score = 10;
      else if (shareSerial) score = 9;
      else if (vehicleVin.endsWith(candidateVin.slice(-6))) score = 8;
      else if (dist <= 3) score = 6;
      else if (vehicleVin.includes(candidateVin) || candidateVin.includes(vehicleVin)) score = 4;
      if (!score) continue;

      if (!best || score > best.score || (score === best.score && dist < best.dist)) {
        best = { vehicle: v, score, dist };
      }
    }
  }

  if (best && best.score >= 6) return best.vehicle;
  return null;
}

/**
 * VIN checksum validation (ISO 3779).
 * Helps prevent OCR from extracting random 17-char strings that match the regex but aren't real VINs.
 */
function isVinChecksumValid(vin) {
  if (!vin || String(vin).length !== 17) return false;

  const v = String(vin).toUpperCase();
  // Allowed VIN chars (no I, O, Q)
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return false;

  // Transliteration: letters to numbers
  const charMap = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5,
    P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  };

  // Weights by position 1..17 (check digit at position 9)
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = v[i];
    const val = charMap[ch];
    if (val === undefined) return false;
    sum += val * weights[i];
  }

  const remainder = sum % 11;
  const checkDigit = v[8]; // 9th char
  if (remainder === 10) return checkDigit === 'X';
  return checkDigit === String(remainder);
}

// Attempt to parse a simple US street address block from OCR/text
function parseAddressFromText(text) {
  if (!text || !text.trim()) return null;
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const cityStateZipRegex = /([A-Za-z .'-]+),?\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/i;
  const streetRegex = /^\d{1,5}\s+.+/; // simple street line starting with number

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (streetRegex.test(line)) {
      // Look ahead for city/state/zip in same line or next 2 lines
      let cityStateLine = null;
      if (cityStateZipRegex.test(line)) cityStateLine = line;
      else if (i + 1 < lines.length && cityStateZipRegex.test(lines[i + 1])) cityStateLine = lines[i + 1];
      else if (i + 2 < lines.length && cityStateZipRegex.test(lines[i + 2])) cityStateLine = lines[i + 2];

      if (cityStateLine) {
        const m = cityStateZipRegex.exec(cityStateLine);
        if (m) {
          const street = line;
          const city = m[1].trim();
          const state = m[2].trim().toUpperCase();
          const zip = m[3].trim();
          // vendor might be the previous non-empty line before street
          const vendor = i - 1 >= 0 ? lines[i - 1] : null;
          return { street, city, state, zip, vendor };
        }
      }
    }
  }

  // As a last resort, try to find any city/state/zip block alone
  for (const l of lines) {
    const m = cityStateZipRegex.exec(l);
    if (m) {
      return { street: null, city: m[1].trim(), state: m[2].trim().toUpperCase(), zip: m[3].trim(), vendor: null };
    }
  }

  return null;
}

/**
 * Fuzzy VIN matching to handle OCR errors (5/S, 0/O, 1/I, etc)
 */
async function findFuzzyRegistryEntry(vin, type, req) {
  if (!vin) return null;
  const upperVin = vin.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Only do fuzzy matching on valid 17-char VINs
  if (upperVin.length !== 17) {
    // For non-standard VINs, only do exact match
    const entry = await prisma.documentRegistry.findFirst({
      where: { 
        vin: upperVin, 
        documentType: type,
        dealershipId: req.dealershipId
      },
      orderBy: { createdAt: 'desc' }
    });
    return entry || null;
  }

  // 1. Exact match first
  let entry = await prisma.documentRegistry.findFirst({
    where: { 
      vin: upperVin, 
      documentType: type,
      dealershipId: req.dealershipId
    },
    orderBy: { createdAt: 'desc' }
  });
  if (entry) return entry;

  // 2. Try common OCR swaps (single character swap only)
  const swaps = { '5': 'S', 'S': '5', '0': 'O', 'O': '0', '1': 'I', 'I': '1', 'B': '8', '8': 'B' };
  const vinChars = upperVin.split('');
  
  for (let i = 0; i < vinChars.length; i++) {
    const char = vinChars[i];
    if (swaps[char]) {
      const altVin = [...vinChars];
      altVin[i] = swaps[char];
      const altVinStr = altVin.join('');
      
      entry = await prisma.documentRegistry.findFirst({
        where: { 
          vin: altVinStr, 
          documentType: type,
          dealershipId: req.dealershipId
        },
        orderBy: { createdAt: 'desc' }
      });
      if (entry) {
        console.log(`[FuzzyMatch] Found match by swapping ${char}->${swaps[char]} at pos ${i}: ${altVinStr}`);
        return entry;
      }
    }
  }

  // NOTE: Removed the old "last 8 characters" match — it was too aggressive
  // and caused different vehicles to share documents when they had similar VINs.

  return null;
}

/**
 * Fuzzy VIN matching for Vehicle table to prevent duplicate inventory records (OCR swaps like 5/S, 0/O, etc)
 */
async function findFuzzyVehicle(vin, dealershipId) {
  if (!vin) return null;
  const upperVin = vin.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (upperVin.length !== 17) {
    return await prisma.vehicle.findFirst({
      where: { vin: upperVin, dealershipId }
    });
  }

  // 1. Exact match
  let vehicle = await prisma.vehicle.findFirst({
    where: { vin: upperVin, dealershipId }
  });
  if (vehicle) return vehicle;

  // 2. OCR swap fuzzy match (single character swap only)
  const swaps = { '5': 'S', 'S': '5', '0': 'O', 'O': '0', '1': 'I', 'I': '1', 'B': '8', '8': 'B' };
  const vinChars = upperVin.split('');
  
  for (let i = 0; i < vinChars.length; i++) {
    const char = vinChars[i];
    if (swaps[char]) {
      const altVin = [...vinChars];
      altVin[i] = swaps[char];
      const altVinStr = altVin.join('');
      
      vehicle = await prisma.vehicle.findFirst({
        where: { vin: altVinStr, dealershipId }
      });
      if (vehicle) {
        console.log(`[FuzzyVehicleMatch] Found duplicate check match by swapping ${char}->${swaps[char]} at pos ${i}: ${altVinStr}`);
        return vehicle;
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// ROUTE: /scan-document — Quick scan, no inventory action
// ═══════════════════════════════════════════════════════════════
router.post('/scan-document', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    const info = await extractVehicleInfo(req.file.buffer, req.file.mimetype);
    res.json({ success: true, info });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// ROUTE: /generate-used-vehicle-form — USER_FORM processing
// Extracts: Motor Vehicle Details + Execution ONLY
// Stores: INVENTORY with status = "Available"
// ═══════════════════════════════════════════════════════════════
router.post(
  '/generate-used-vehicle-form',
  upload.fields([
    { name: 'sourceFile', maxCount: 1 },
    { name: 'templateFile', maxCount: 1 },
  ]),
  async (req, res, next) => {
    let info = null;
    try {
      const sourceFile = req.files?.sourceFile?.[0];
      const templateFile = req.files?.templateFile?.[0];
      const supportedTemplateMimeTypes = new Set([
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
      ]);

      if (!sourceFile) {
        return res.status(400).json({ status: 'error', message: 'Source document is required' });
      }

      if (templateFile && !supportedTemplateMimeTypes.has(templateFile.mimetype)) {
        return res.status(400).json({
          status: 'error',
          message: 'Used vehicle template must be a PDF, JPG, or PNG',
        });
      }

      // ── Extract acquisition/auction data strictly. Disposition is filled later from a sale bill of sale. ──
      info = sanitizeVehicleIdentity(await extractVehicleInfo(sourceFile.buffer, sourceFile.mimetype, 'acquisition'));
      info = sanitizeVehicleIdentity(info || {});
      info = clearDispositionInfo(info || {});
      console.log(`[UserForm] Extracted VIN: ${info.vin}, Make: ${info.make}, Model: ${info.model}`);

      // ── Generate PDF ──
      const templateBuffer = templateFile
        ? templateFile.buffer
        : await getTemplateBuffer();
      const templateMimeType = templateFile?.mimetype || 'image/jpeg';

      const isPushToInventory = req.body.pushToInventory === 'true';
      let vehicleId = null;
      let registryId = null;

      if (!info.vin) {
        return res.status(400).json({
          status: 'error',
          message: 'Could not extract a valid VIN from the document. Please ensure the image is clear and try again.'
        });
      }

      // Prefer deterministic auction/facility details over AI seller/consignor guesses.
      const warnings = {};
      
      // ── OPTIMIZATION: Bypass heavy local OCR if Vision successfully extracted the VIN ──
      const hasCompleteAcquisition = !!info.vin;
      
      let rawText = '';
      if (!hasCompleteAcquisition) {
        try {
          console.log('[UserForm] Acquisition details incomplete. Running fallback text extraction...');
          rawText = await extractText(sourceFile.buffer, sourceFile.mimetype);
          const parsed = extractAcquisitionDetailsFromText(rawText);
          if (parsed && Object.keys(parsed).length) {
            info.purchasedFrom = parsed.purchasedFrom || info.purchasedFrom;
            if (parsed.usedVehicleSourceAddress) {
              info.usedVehicleSourceAddress = parsed.usedVehicleSourceAddress;
              info.usedVehicleSourceCity = parsed.usedVehicleSourceCity || '';
              info.usedVehicleSourceState = parsed.usedVehicleSourceState || '';
              info.usedVehicleSourceZipCode = parsed.usedVehicleSourceZipCode || '';
            } else if (isAuctionSourceName(parsed.purchasedFrom)) {
              info.usedVehicleSourceAddress = '';
              info.usedVehicleSourceCity = '';
              info.usedVehicleSourceState = '';
              info.usedVehicleSourceZipCode = '';
            }
            console.log('[DocumentRoute] Applied auction acquisition details from text:', parsed);
          }

          const totalFromText = extractTotalFromText(rawText, 'acquisition');
          if (isReasonableVehicleAmount(totalFromText)) {
            if (info.purchasePrice !== totalFromText) {
              console.log(`[DocumentRoute] Preferring authoritative total price over raw purchase price: ${info.purchasePrice} → ${totalFromText}`);
            }
            info.purchasePrice = totalFromText;
          }

          if (!info.usedVehicleSourceAddress) {
            warnings.addressMissing = true;
            console.log('[DocumentRoute] Address missing after text fallback');
          }
        } catch (err) {
          if (!info.usedVehicleSourceAddress) warnings.addressMissing = true;
          console.warn('[DocumentRoute] Text fallback failed:', err?.message || err);
        }
      } else {
        console.log('[UserForm] Vision extraction succeeded with complete details. Bypassing slow OCR/fallback text path entirely!');
        if (!info.usedVehicleSourceAddress) {
          warnings.addressMissing = true;
        }
      }

      // ── Generate PDF AFTER all data corrections ──
      info = sanitizeVehicleIdentity(info);
      if (!info.make) {
        info.make = 'Unknown';
        if (!warnings) warnings = {};
        warnings.makeMissing = true;
      }
      if (!info.model) {
        info.model = 'Unknown';
        if (!warnings) warnings = {};
        warnings.modelMissing = true;
      }
      if (!info.year) {
        info.year = 2020;
        if (!warnings) warnings = {};
        warnings.yearMissing = true;
      }

      if (!isReasonableVehicleAmount(info.purchasePrice)) {
        if (!warnings) warnings = {};
        warnings.priceMissing = true;
        console.warn('[DocumentRoute] Purchase price missing after all parsing fallbacks. Using fallback price.');
        info.purchasePrice = 10000; // Fallback price
      }

      let pdfBase64Str;
      const isAlreadyUsedVehicleRecord = /\b(?:USED VEHICLE RECORD|Motor Vehicle\/Part Identification|Disposition of Motor Vehicle)\b/i.test(rawText);
      if (isAlreadyUsedVehicleRecord) {
        console.log(`[DocumentRoute] Scanned document is ALREADY a Used Vehicle Record. Preserving original file in registry.`);
        pdfBase64Str = sourceFile.buffer.toString('base64');
      } else {
        console.log(`[UserForm] Generating PDF with: VIN=${info.vin}, From=${info.purchasedFrom}, Addr=${info.usedVehicleSourceAddress}, City=${info.usedVehicleSourceCity}, State=${info.usedVehicleSourceState}`);
        const filledPdf = await fillUsedVehiclePdf(templateBuffer, info, templateMimeType);
        pdfBase64Str = filledPdf;
      }

      // ── Save/Update in Document Registry ──
      try {
        const docData = {
          vin: info.vin,
          make: info.make || null,
          model: info.model || null,
          year: info.year ? String(info.year) : null,
          titleNumber: info.titleNumber || null,
          purchasedFrom: info.purchasedFrom || null,
          sellerAddress: info.usedVehicleSourceAddress || null,
          sellerCity: info.usedVehicleSourceCity || null,
          sellerState: info.usedVehicleSourceState || null,
            sellerZip: info.usedVehicleSourceZipCode || null,
            disposedTo: null,
            disposedAddress: null,
            disposedCity: null,
            disposedState: null,
            disposedZip: null,
            disposedDate: null,
            disposedPrice: null,
            disposedOdometer: null,
            disposedDlNumber: null,
            disposedDlState: null,
            documentType: 'Used Vehicle Record',
          documentBase64: pdfBase64Str,
          sourceFileName: sourceFile.originalname || null,
          sourceDocumentBase64: sourceFile.buffer.toString('base64'),
          dealershipId: req.dealershipId,
          createdAt: new Date() // Refresh timestamp to move to top
        };

        const existingLog = await findFuzzyRegistryEntry(info.vin, 'Used Vehicle Record', req);

        if (existingLog) {
          await prisma.documentRegistry.updateMany({
            where: { id: existingLog.id, dealershipId: req.dealershipId },
            data: { ...docData, vin: info.vin } // Prefer the new (likely corrected) VIN
          });
          
          // Cleanup any other duplicates for this VIN to keep it clean
          await prisma.documentRegistry.deleteMany({
            where: {
              vin: { in: [info.vin, existingLog.vin] },
              documentType: 'Used Vehicle Record',
              dealershipId: req.dealershipId,
              id: { not: existingLog.id }
            }
          });
          console.log(`[Registry] Updated existing log for VIN: ${info.vin} (matched ${existingLog.vin})`);
        } else {
          await prisma.documentRegistry.create({
            data: docData
          });
          console.log(`[Registry] Created new log for VIN: ${info.vin}`);
        }
        registryId = 'logged';
      } catch (logErr) {
        console.error('Failed to save/update DocumentRegistry:', logErr);
      }

      // ── Push to Inventory with status = "Available" ──
      if (isPushToInventory) {
        const normalizedVin = info.vin ? info.vin.toUpperCase().trim() : '';

        // Check for duplicate ONLY when pushing to inventory (with fuzzy OCR swap matching)
        const existingVehicle = await findFuzzyVehicle(normalizedVin, req.dealershipId);
        
        if (existingVehicle) {
          return res.status(409).json({ 
            status: 'error', 
            message: `Vehicle with VIN ${normalizedVin} already exists in inventory (matched existing VIN: ${existingVehicle.vin}).`,
            existingId: existingVehicle.id,
            info, // Return info anyway so UI can see it
            pdfBase64: pdfBase64Str,
            registryAdded: !!registryId,
            warnings: warnings || {}
          });
        }

        const purchasePrice = parseCurrency(info.purchasePrice);
        const transportCost = parseCurrency(info.transportCost);
        const repairCost = parseCurrency(info.repairCost);
        const inspectionCost = parseCurrency(info.inspectionCost);
        const registrationCost = parseCurrency(info.registrationCost);
        const totalPurchaseCost = purchasePrice + transportCost + inspectionCost + registrationCost;

        const vehicle = await prisma.vehicle.create({
          data: {
            vin: normalizedVin,
            make: info.make || 'Unknown',
            model: info.model || 'Unknown',
            year: Number(info.year) || new Date().getFullYear(),
            mileage: Number(info.mileage) || 0,
            color: info.color || 'Unknown',
            purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
            titleNumber: info.titleNumber || null,
            status: 'Available', // USER_FORM → status = AVAILABLE
            dealershipId: req.dealershipId,
            purchase: {
              create: {
                sellerName: info.purchasedFrom || 'Auction',
                sellerAddress: info.usedVehicleSourceAddress || '',
                sellerCity: info.usedVehicleSourceCity || '',
                sellerState: info.usedVehicleSourceState || '',
                sellerZip: info.usedVehicleSourceZipCode || '',
                purchasePrice,
                transportCost,
                inspectionCost,
                registrationCost,
                totalPurchaseCost,
                purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
                paymentMethod: 'Bank Transfer',
                documentBase64: pdfBase64Str,
                sourceDocumentBase64: sourceFile.buffer.toString('base64'),
                dealershipId: req.dealershipId
              }
            },
            ...(repairCost > 0 && {
              repairs: {
                create: {
                  repairShop: 'Initial Pre-Purchase',
                  partsCost: repairCost,
                  laborCost: 0,
                  description: 'Initial repairs added during document scan',
                  repairDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
                  dealershipId: req.dealershipId
                }
              }
            })
          }
        });
        vehicleId = vehicle.id;
        const cacheKey = `vehicle-list:${req.dealershipId}`;
        vehicleCache.delete(cacheKey); // Invalidate cache
      }

      const fileName = buildUsedVehiclePdfFileName(info);

      res.json({
        status: 'success',
        action: 'user_form_processed',
        info,
        fileName,
        pdfBase64: pdfBase64Str,
        inventoryAdded: !!vehicleId,
        registryAdded: !!registryId,
        warnings: warnings || {}
      });
    } catch (err) {
      if (err.message && err.message.includes('already exists in inventory')) {
         const vin = info?.vin;
         const existing = await prisma.vehicle.findFirst({ 
           where: { vin, dealershipId: req.dealershipId } 
         });
         return res.status(409).json({ 
           status: 'error',
           message: err.message, 
           existingId: existing?.id 
         });
      }
      next(err);
    }
  }
);

import { vehicleCache, salesCache } from '../utils/cache.js';
const CUSTOMER_META_PREFIX = 'APH_CUSTOMER_META:';

function buildCustomerNotes(meta) {
  return `${CUSTOMER_META_PREFIX}${JSON.stringify(meta)}`;
}

// ═══════════════════════════════════════════════════════════════
// ROUTE: /upload-bill-of-sale — BILL_OF_SALE processing
// Extracts: Disposition + VIN ONLY
// VIN Match: EXACT match in inventory required
// Action: AVAILABLE → SOLD, move to SALES
// ═══════════════════════════════════════════════════════════════
function splitCustomerName(customerName = '') {
  const parts = String(customerName).trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'Unknown',
    lastName: parts.slice(1).join(' ') || null
  };
}

function parseCustomerAddress(address = '') {
  const parts = String(address).split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 4) {
    const zip = parts.pop() || null;
    const state = parts.pop() || null;
    const city = parts.pop() || null;
    return { address: parts.join(', ') || null, city, state, zip };
  }
  return { address: String(address).trim() || null, city: null, state: null, zip: null };
}

async function upsertCustomerFromBillOfSale(req, saleData) {
  const { firstName, lastName } = splitCustomerName(saleData.customerName);
  const addressParts = parseCustomerAddress(saleData.address);
  const email = saleData.email ? String(saleData.email).trim() : null;
  const phone = saleData.phone ? String(saleData.phone).trim() : null;

  const existing = await prisma.customer.findFirst({
    where: {
      dealershipId: req.dealershipId,
      OR: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone, firstName }] : []),
        { firstName, lastName }
      ]
    },
    orderBy: { updatedAt: 'desc' }
  });

  const data = {
    firstName,
    lastName,
    email,
    phone,
    address: addressParts.address,
    city: addressParts.city,
    state: addressParts.state,
    zip: addressParts.zip,
    driverLicense: saleData.driverLicense || null,
    notes: buildCustomerNotes({
      category: 'Bought Vehicle',
      vehicleId: saleData.vehicleId,
      vehicleLabel: saleData.vehicleLabel
    }),
    dealershipId: req.dealershipId
  };

  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null && value !== ''))
    });
  }

  return prisma.customer.create({ data });
}

router.post('/upload-auto', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }

    const rawText = await extractText(req.file.buffer, req.file.mimetype);
    const isRepairDoc = detectRepairDocument(rawText, req.file.originalname);

    if (isRepairDoc) {
      // ── Repair path ──
      const bodyVin = req.body.vin ? String(req.body.vin).trim().toUpperCase() : '';
      const vinCandidates = collectRepairVinCandidates(rawText, bodyVin);
      const resolved = await resolveRepairVehicleFromCandidates(req, vinCandidates);

      if (!resolved) {
        return res.status(400).json({ status: 'error', message: 'VIN not found in repair bill' });
      }

      const { vehicle, vin } = resolved;

      const total = pickRepairTotal({ rawText, bodyTotal: req.body.total });

      // Try to infer shop/vendor name from top of document
      const candidateLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 6);
      let vendor = null;
      for (const line of candidateLines) {
        if (/TOTAL|INVOICE|BILL|AMOUNT|DATE/i.test(line)) continue;
        if (/[A-Za-z]{3,}/.test(line) && line.length > 3) { vendor = line; break; }
      }

      const duplicateRepair = await findRecentDuplicateRepair({
        vehicleId: vehicle.id,
        dealershipId: req.dealershipId,
        amount: total || 0,
        sourceFileName: req.file.originalname
      });
      if (duplicateRepair) {
        // If we dedupe against an older row that is missing the document blob,
        // attach the latest uploaded file so preview/download works in Vehicle dialog.
        if (!duplicateRepair.documentBase64) {
          const patchedRepair = await prisma.repair.update({
            where: { id: duplicateRepair.id },
            data: {
              documentBase64: req.file.buffer.toString('base64'),
              sourceFileName: req.file.originalname || duplicateRepair.sourceFileName || null
            }
          });
          return res.json({ status: 'success', success: true, kind: 'repair', repair: patchedRepair, vin, total, deduped: true });
        }
        return res.json({ status: 'success', success: true, kind: 'repair', repair: duplicateRepair, vin, total, deduped: true });
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

      return res.json({ status: 'success', success: true, kind: 'repair', repair, vin, total });
    }

    // ── Bill-of-sale path ──
    // Reuse the same logic from /upload-bill-of-sale by executing the core steps here.
    let billOfSaleInfo = await extractVehicleInfo(req.file.buffer, req.file.mimetype, 'sale');
    billOfSaleInfo = sanitizeVehicleIdentity(billOfSaleInfo || {});

    const hasCompleteVision = !!billOfSaleInfo.vin;

    if (!hasCompleteVision) {
      try {
        const rawBillText = await extractText(req.file.buffer, req.file.mimetype);
        const dispositionFallback = extractDispositionDetailsFromText(rawBillText);

        for (const key of ['disposedTo', 'disposedAddress', 'disposedCity', 'disposedState', 'disposedZip']) {
          if (dispositionFallback[key]) billOfSaleInfo[key] = billOfSaleInfo[key] || dispositionFallback[key];
        }

        const saleTotal = extractTotalFromText(rawBillText, 'sale');
        if (isReasonableVehicleAmount(saleTotal) && !billOfSaleInfo.disposedPrice) {
          billOfSaleInfo.disposedPrice = saleTotal;
        }
      } catch (err) {
        console.warn('[UploadAuto][BillOfSale] Disposition text fallback failed:', err?.message || err);
      }
    }

    const docVin = billOfSaleInfo.vin ? String(billOfSaleInfo.vin).trim().toUpperCase() : null;
    const bodyVin = req.body.vin ? String(req.body.vin).trim().toUpperCase() : null;
    const extractedVin = (bodyVin && bodyVin.length === 17) ? bodyVin : docVin;
    const vinCandidates = collectBillOfSaleVinCandidates(docVin, bodyVin);
    if (!vinCandidates.length) {
      return res.status(400).json({ status: 'error', message: 'VIN not found in BILL_OF_SALE' });
    }

    const customerName = cleanDispositionName(billOfSaleInfo.disposedTo || req.body.customerName) || 'Unknown Customer';
    billOfSaleInfo.disposedTo = customerName !== 'Unknown Customer' ? customerName : '';

    const customerPhone = req.body.phone || req.body.customerPhone || 'N/A';
    const customerEmail = req.body.email || req.body.customerEmail || null;

    let vehicle = await resolveBillOfSaleVehicle(req, vinCandidates);
    if (!vehicle) {
      return res.status(404).json({
        message: `Cannot upload Bill of Sale. Vehicle with VIN ${extractedVin || docVin || bodyVin} is not in your inventory. Please add the vehicle to inventory first.`
      });
    }

    // update status
    await prisma.vehicle.update({
      where: { id: vehicle.id, dealershipId: req.dealershipId },
      data: { status: 'Sold' }
    });

    let salePrice = parseCurrency(billOfSaleInfo.disposedPrice || billOfSaleInfo.purchasePrice || req.body.salePrice || req.body.price || req.body.disposedPrice);
    const purchaseCost = getBasePurchaseCost(vehicle.purchase);

    if (!isReasonableVehicleAmount(salePrice)) {
      salePrice = purchaseCost > 0 ? (purchaseCost + 3000) : 15000;
    }

    const repairCost = vehicle.repairs?.reduce((acc, r) => acc + (r.partsCost || 0) + (r.laborCost || 0), 0) || 0;
    const profit = salePrice - purchaseCost - repairCost;

    const saleAddress = [
      billOfSaleInfo.disposedAddress,
      billOfSaleInfo.disposedCity,
      billOfSaleInfo.disposedState,
      billOfSaleInfo.disposedZip
    ].filter(Boolean).join(', ') || (vehicle.sale?.address || 'N/A');

    await prisma.sale.upsert({
      where: { vehicleId: vehicle.id },
      create: {
        vehicleId: vehicle.id,
        customerName,
        phone: customerPhone,
        address: saleAddress,
        driverLicense: billOfSaleInfo.disposedDlNumber || null,
        saleDate: billOfSaleInfo.disposedDate ? new Date(billOfSaleInfo.disposedDate) : new Date(),
        salePrice,
        paymentMethod: 'Cash',
        profit,
        billOfSaleBase64: req.file.buffer.toString('base64'),
        hasBillOfSale: true,
        dealershipId: req.dealershipId
      },
      update: {
        customerName,
        phone: customerPhone,
        address: saleAddress,
        driverLicense: billOfSaleInfo.disposedDlNumber || vehicle.sale?.driverLicense || null,
        saleDate: billOfSaleInfo.disposedDate ? new Date(billOfSaleInfo.disposedDate) : (vehicle.sale?.saleDate || new Date()),
        salePrice: salePrice || vehicle.sale?.salePrice,
        profit: salePrice ? (salePrice - purchaseCost - repairCost) : vehicle.sale?.profit,
        hasBillOfSale: true,
        billOfSaleBase64: req.file.buffer.toString('base64')
      }
    });

    await upsertCustomerFromBillOfSale(req, {
      customerName,
      email: customerEmail,
      phone: customerPhone,
      address: saleAddress,
      driverLicense: billOfSaleInfo.disposedDlNumber || vehicle.sale?.driverLicense,
      vehicleId: vehicle.id,
      vehicleLabel: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin
    });

    const vCacheKey = `vehicle-list:${req.dealershipId}`;
    const sCacheKey = `sales-list:${req.dealershipId}`;
    vehicleCache.delete(vCacheKey);
    salesCache.delete(sCacheKey);

    return res.json({ status: 'success', success: true, kind: 'bill_of_sale', vin: extractedVin, info: billOfSaleInfo });
  } catch (err) {
    console.error('[UploadAuto] ERROR:', err);
    next(err);
  }
});

router.post('/upload-bill-of-sale', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }

    // ── Step 1: Extract Disposition + VIN from Bill of Sale (purpose: sale) ──
    let billOfSaleInfo = await extractVehicleInfo(req.file.buffer, req.file.mimetype, 'sale');
    billOfSaleInfo = sanitizeVehicleIdentity(billOfSaleInfo || {});

    // ── OPTIMIZATION: Bypass heavy local OCR if Vision successfully extracted the VIN ──
    const hasCompleteVision = !!billOfSaleInfo.vin;
    
    if (!hasCompleteVision) {
      try {
        console.log('[BillOfSale] Vision extraction was incomplete. Running fallback text extraction...');
        const rawBillText = await extractText(req.file.buffer, req.file.mimetype);
        const dispositionFallback = extractDispositionDetailsFromText(rawBillText);
        for (const key of ['disposedTo', 'disposedAddress', 'disposedCity', 'disposedState', 'disposedZip']) {
          if (dispositionFallback[key]) billOfSaleInfo[key] = billOfSaleInfo[key] || dispositionFallback[key];
        }
        const saleTotal = extractTotalFromText(rawBillText, 'sale');
        if (isReasonableVehicleAmount(saleTotal) && !billOfSaleInfo.disposedPrice) {
          billOfSaleInfo.disposedPrice = saleTotal;
        }
      } catch (err) {
        console.warn('[BillOfSale] Disposition text fallback failed:', err?.message || err);
      }
    } else {
      console.log('[BillOfSale] Vision extraction succeeded with complete details. Bypassing slow OCR/fallback text path entirely!');
    }
    
    console.log(`[BillOfSale] Extracted:`, JSON.stringify(billOfSaleInfo, null, 2));

    // ── Step 2: Validate VIN ──
    const docVin = billOfSaleInfo.vin ? String(billOfSaleInfo.vin).trim().toUpperCase() : null;
    const bodyVin = req.body.vin ? String(req.body.vin).trim().toUpperCase() : null;
    const extractedVin = (bodyVin && bodyVin.length === 17) ? bodyVin : docVin;
    const vinCandidates = collectBillOfSaleVinCandidates(docVin, bodyVin);
    if (!vinCandidates.length) {
      return res.status(400).json({ status: 'error', message: 'VIN not found in BILL_OF_SALE' });
    }

    // Use manual customer name fallback if AI didn't extract it
    const customerName = cleanDispositionName(billOfSaleInfo.disposedTo || req.body.customerName) || 'Unknown Customer';
    billOfSaleInfo.disposedTo = customerName !== 'Unknown Customer' ? customerName : '';
    const customerPhone = req.body.phone || req.body.customerPhone || 'N/A';
    const customerEmail = req.body.email || req.body.customerEmail || null;

    // ── Step 3: VIN match in inventory ──
    let vehicle = await resolveBillOfSaleVehicle(req, vinCandidates);
    if (!vehicle) {
      console.log(`[BillOfSale] Rejected: Vehicle with VIN ${extractedVin || docVin || bodyVin} not found in inventory.`);
      return res.status(404).json({
        message: `Cannot upload Bill of Sale. Vehicle with VIN ${extractedVin || docVin || bodyVin} is not in your inventory. Please add the vehicle to inventory first.`
      });
    }

    const matchedVin = vehicle.vin;
    console.log(`[BillOfSale] VIN matched: ${matchedVin} → Vehicle ID: ${vehicle.id}`);

    // ── Step 4: Update vehicle status: AVAILABLE → SOLD ──
    await prisma.vehicle.update({
      where: { id: vehicle.id, dealershipId: req.dealershipId },
      data: { status: 'Sold' }
    });
    console.log(`[BillOfSale] Vehicle status updated: Available → Sold`);

    // ── Step 5: Create Sale record (move to SALES) ──
    let salePrice = parseCurrency(billOfSaleInfo.disposedPrice || billOfSaleInfo.purchasePrice || req.body.salePrice || req.body.price || req.body.disposedPrice);
    const purchaseCost = getBasePurchaseCost(vehicle.purchase);
    if (!isReasonableVehicleAmount(salePrice)) {
      console.warn('[BillOfSale] Sale price missing after all fallbacks. Using fallback sale price.');
      salePrice = purchaseCost > 0 ? (purchaseCost + 3000) : 15000;
    }
    const repairCost = vehicle.repairs?.reduce((acc, r) => acc + (r.partsCost || 0) + (r.laborCost || 0), 0) || 0;
    const profit = salePrice - purchaseCost - repairCost;

    const saleAddress = [
      billOfSaleInfo.disposedAddress,
      billOfSaleInfo.disposedCity,
      billOfSaleInfo.disposedState,
      billOfSaleInfo.disposedZip
    ].filter(Boolean).join(', ') || (vehicle.sale?.address || 'N/A');
    const normalizedCustomerName = customerName !== 'Unknown Customer' ? customerName : (vehicle.sale?.customerName || customerName);
    const normalizedPhone = customerPhone !== 'N/A' ? customerPhone : (vehicle.sale?.phone || customerPhone);

    await prisma.sale.upsert({
      where: { vehicleId: vehicle.id },
      create: {
        vehicleId: vehicle.id,
        customerName: normalizedCustomerName,
        phone: normalizedPhone,
        address: saleAddress,
        driverLicense: billOfSaleInfo.disposedDlNumber || null,
        saleDate: billOfSaleInfo.disposedDate ? new Date(billOfSaleInfo.disposedDate) : new Date(),
        salePrice,
        paymentMethod: 'Cash',
        profit,
        billOfSaleBase64: req.file.buffer.toString('base64'),
        hasBillOfSale: true,
        dealershipId: req.dealershipId
      },
      update: {
        customerName: normalizedCustomerName,
        phone: normalizedPhone,
        address: saleAddress,
        driverLicense: billOfSaleInfo.disposedDlNumber || vehicle.sale?.driverLicense,
        saleDate: billOfSaleInfo.disposedDate ? new Date(billOfSaleInfo.disposedDate) : (vehicle.sale?.saleDate || new Date()),
        salePrice: salePrice || vehicle.sale?.salePrice,
        profit: salePrice ? (salePrice - purchaseCost - repairCost) : vehicle.sale?.profit,
        billOfSaleBase64: req.file.buffer.toString('base64'),
        hasBillOfSale: true
      }
    });
    await upsertCustomerFromBillOfSale(req, {
      customerName: normalizedCustomerName,
      email: customerEmail,
      phone: normalizedPhone,
      address: saleAddress,
      driverLicense: billOfSaleInfo.disposedDlNumber || vehicle.sale?.driverLicense,
      vehicleId: vehicle.id,
      vehicleLabel: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin
    });
    console.log(`[BillOfSale] Sale record upserted: price=${salePrice}, profit=${profit}`);

    // ── Step 6: Update Registry entry with disposition data ──
    const existingEntry = await findFuzzyRegistryEntry(extractedVin, 'Used Vehicle Record', req);

    let filledPdf;
    if (existingEntry || vehicle) {
      // Merge disposition data into existing registry entry (or build from scratch if none exists)
      // IMPORTANT: We strictly preserve Acquisition and Motor Vehicle data from the database record
      // and only use the Bill of Sale for Disposition fields.
      const mergedInfo = {
        // 1. Motor Vehicle Identification (Strictly from Database)
        vin: vehicle?.vin || extractedVin,
        make: vehicle?.make || '',
        model: vehicle?.model || '',
        year: vehicle?.year || '',
        color: vehicle?.color || '',
        mileage: vehicle?.mileage || 0, // This is Odometer IN
        titleNumber: vehicle?.titleNumber || '',

        // 2. Acquisition Section (Strictly from Original Purchase)
        purchasedFrom: vehicle?.purchase?.sellerName || '',
        purchaseDate: vehicle?.purchaseDate?.toISOString() || vehicle?.purchase?.purchaseDate?.toISOString(),
        purchasePrice: vehicle?.purchase?.purchasePrice || 0,
        usedVehicleSourceAddress: vehicle?.purchase?.sellerAddress || '',
        usedVehicleSourceCity: vehicle?.purchase?.sellerCity || '',
        usedVehicleSourceState: vehicle?.purchase?.sellerState || '',
        usedVehicleSourceZipCode: vehicle?.purchase?.sellerZip || '',

        // 3. Disposition Section (Strictly from Bill of Sale extraction)
        disposedTo: customerName,
        disposedAddress: billOfSaleInfo.disposedAddress || '',
        disposedCity: billOfSaleInfo.disposedCity || '',
        disposedState: billOfSaleInfo.disposedState || '',
        disposedZip: billOfSaleInfo.disposedZip || '',
        disposedDate: billOfSaleInfo.disposedDate || new Date().toISOString(),
        disposedPrice: parseCurrency(billOfSaleInfo.disposedPrice),
        disposedOdometer: billOfSaleInfo.disposedOdometer || '',
        disposedDlNumber: billOfSaleInfo.disposedDlNumber || '',
        disposedDlState: billOfSaleInfo.disposedDlState || '',
      };

      const templateBuffer = await getTemplateBuffer();
      filledPdf = await fillUsedVehiclePdf(templateBuffer, mergedInfo, 'image/jpeg');

      const shouldOverwriteDoc = !existingEntry || (existingEntry.documentBase64 !== existingEntry.sourceDocumentBase64);
      if (existingEntry) {
        await prisma.documentRegistry.updateMany({
          where: { id: existingEntry.id, dealershipId: req.dealershipId },
          data: {
            disposedTo: String(customerName || ''),
            disposedAddress: String(billOfSaleInfo.disposedAddress || ''),
            disposedCity: String(billOfSaleInfo.disposedCity || ''),
            disposedState: String(billOfSaleInfo.disposedState || ''),
            disposedZip: String(billOfSaleInfo.disposedZip || ''),
            disposedDate: billOfSaleInfo.disposedDate ? String(billOfSaleInfo.disposedDate) : null,
            disposedPrice: String(parseCurrency(billOfSaleInfo.disposedPrice) || ''),
            disposedOdometer: billOfSaleInfo.disposedOdometer ? String(billOfSaleInfo.disposedOdometer) : null,
            disposedDlNumber: String(billOfSaleInfo.disposedDlNumber || ''),
            disposedDlState: String(billOfSaleInfo.disposedDlState || ''),
            ...(shouldOverwriteDoc ? { documentBase64: filledPdf } : {})
          }
        });
        
        // Delete any other duplicates for this VIN (and the matched VIN) to keep the registry clean
        await prisma.documentRegistry.deleteMany({
          where: {
            vin: { in: [extractedVin, existingEntry.vin] },
            documentType: 'Used Vehicle Record',
            dealershipId: req.dealershipId,
            id: { not: existingEntry.id }
          }
        });
        console.log(`[BillOfSale] Registry duplicates CLEANED for VIN: ${extractedVin} (matched ${existingEntry.vin})`);
      } else {
        await prisma.documentRegistry.create({
          data: {
            vin: extractedVin,
            make: vehicle?.make || '',
            model: vehicle?.model || '',
            year: String(vehicle?.year || ''),
            documentType: 'Used Vehicle Record',
            documentBase64: filledPdf,
            disposedTo: String(customerName || ''),
            disposedAddress: String(billOfSaleInfo.disposedAddress || ''),
            disposedCity: String(billOfSaleInfo.disposedCity || ''),
            disposedState: String(billOfSaleInfo.disposedState || ''),
            disposedZip: String(billOfSaleInfo.disposedZip || ''),
            disposedDate: billOfSaleInfo.disposedDate ? String(billOfSaleInfo.disposedDate) : null,
            disposedPrice: String(parseCurrency(billOfSaleInfo.disposedPrice) || ''),
            disposedOdometer: billOfSaleInfo.disposedOdometer ? String(billOfSaleInfo.disposedOdometer) : null,
            disposedDlNumber: String(billOfSaleInfo.disposedDlNumber || ''),
            disposedDlState: String(billOfSaleInfo.disposedDlState || ''),
            sourceFileName: req.file.originalname,
            sourceDocumentBase64: req.file.buffer.toString('base64'),
            dealershipId: req.dealershipId
          }
        });
        console.log(`[BillOfSale] New Registry entry CREATED with disposition data`);
      }
      // Also update the Purchase record's documentBase64 if the vehicle exists
      if (vehicle && vehicle.purchase) {
        await prisma.purchase.updateMany({
          where: { id: vehicle.purchase.id, dealershipId: req.dealershipId },
          data: { documentBase64: filledPdf }
        });
        console.log(`[BillOfSale] Purchase record UPDATED with new Generated Record for vehicle: ${vehicle.id}`);
      }
    }

    // ── Step 7: Invalidate caches ──
    const vCacheKey = `vehicle-list:${req.dealershipId}`;
    const sCacheKey = `sales-list:${req.dealershipId}`;
    vehicleCache.delete(vCacheKey);
    salesCache.delete(sCacheKey);

    // ── Step 8: Return strict JSON response ──
    const fileName = `UsedVehicleRecord_${extractedVin}.pdf`;
    res.json({
      status: 'success',
      action: 'updated_inventory_and_sales',
      vin: extractedVin,
      info: billOfSaleInfo,
      pdfBase64: typeof filledPdf !== 'undefined' ? filledPdf : null,
      fileName
    });

  } catch (err) {
    console.error('[BillOfSale] ERROR:', err);
    next(err);
  }
});

function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

export default router;
