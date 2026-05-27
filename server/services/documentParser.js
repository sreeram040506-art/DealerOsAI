import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import mammoth from 'mammoth';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env from the server folder
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const require = createRequire(import.meta.url);
const openaiApiKey = process.env.OPENAI_API_KEY;
const hasOpenaiKey = !!openaiApiKey && openaiApiKey !== 'YOUR_OPENAI_API_KEY_HERE';

const nvidiaApiKey = process.env.NVIDIA_API_KEY;
const hasNvidiaKey = !!nvidiaApiKey && nvidiaApiKey !== 'YOUR_NVIDIA_API_KEY_HERE';

// Strictly force OpenAI for parsing as requested by the user
const useOpenAI = true;
const useNvidia = false;
const hasLlmKey = true;
const ocrLangPath = path.dirname(
  require.resolve('@tesseract.js-data/eng/4.0.0/eng.traineddata.gz')
);

async function getTesseractWorker() {
  return await createWorker('eng', 1, { langPath: ocrLangPath, gzip: true });
}

class TesseractWorkerPool {
  constructor() {
    this.pool = [];
    this.busy = new Set();
    this.waiting = [];
    this.maxWorkers = 4;
  }

  async acquire() {
    // 1. Look for an idle worker
    for (const worker of this.pool) {
      if (!this.busy.has(worker)) {
        this.busy.add(worker);
        return worker;
      }
    }

    // 2. Create new worker if under limit
    if (this.pool.length < this.maxWorkers) {
      console.log(`[TesseractPool] Spawning new worker (current pool size: ${this.pool.length})...`);
      const worker = await getTesseractWorker();
      this.pool.push(worker);
      this.busy.add(worker);
      return worker;
    }

    // 3. Queue the request
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(worker) {
    this.busy.delete(worker);
    if (this.waiting.length > 0) {
      const nextResolve = this.waiting.shift();
      this.busy.add(worker);
      nextResolve(worker);
    }
  }

  async terminateAll() {
    console.log('[TesseractPool] Terminating all workers...');
    const workers = [...this.pool];
    this.pool = [];
    this.busy.clear();
    this.waiting = [];
    for (const w of workers) {
      try {
        await w.terminate();
      } catch (err) {
        console.warn('[TesseractPool] Failed to terminate worker:', err.message);
      }
    }
  }
}

const tesseractPool = new TesseractWorkerPool();

// Fetch with timeout + 1 automatic retry for transient NVIDIA API failures
async function fetchWithTimeout(url, options, timeoutMs = 90000, retries = (process.env.NODE_ENV === 'test' ? 0 : 1)) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt < retries) {
        const isTimeout = err.name === 'AbortError';
        console.warn(`[API] ${isTimeout ? 'Timeout' : 'Error'} on attempt ${attempt + 1}, retrying in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }
}

function isPdfMimeType(mimetype) {
  return [
    'application/pdf',
    'application/x-pdf',
    'application/acrobat',
    'applications/vnd.pdf',
    'text/pdf'
  ].includes(String(mimetype).toLowerCase());
}

function isPdfBuffer(fileBuffer) {
  if (!fileBuffer || !fileBuffer.length) return false;
  const header = fileBuffer.slice(0, 5).toString('utf8');
  return header === '%PDF-';
}

function determineDocumentPurpose(text) {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, ' ').trim();
  
  // CMAA and CarMax are ALWAYS acquisition documents (we buy from them)
  if (/\b(?:CMAA|Central Mass(?:achusetts)? Auto Auction|CarMax|America'?s\s+(?:AA|Auto Auction))\b/i.test(normalized)) {
    return 'acquisition';
  }

  let score = 0;

  const scoreMatch = (regex, points) => {
    if (regex.test(normalized)) score += points;
  };

  scoreMatch(/\b(?:Sale Price|Vehicle Sales Price|Vehicle Sales Amount|Sold Price|Sold To|Purchaser\(s\)?|Purchaser|Buyer Name|Buyer:|Purchaser:|Transferred To|Disposition of Motor Vehicle|Vehicle Sales Price)\b/i, 2);
  scoreMatch(/\b(?:Purchase Price|Total Due|Amount Due|Balance Due|Buyer Fee|Obtained From|Purchased From|Seller:|Consignor|Auction Location|Facility|Remit Payment To|Acquisition of Motor Vehicle)\b/i, -2);
  scoreMatch(/\b(?:Bill of Sale|Motor Vehicle Purchase Contract|Wholesale Bill of Sale|Buyers Receipt|Purchaser\(s\) Name\(s\))\b/i, 1);
  scoreMatch(/\b(?:Auction Bill of Sale|Invoice to Buyer from|Buyer Fee)\b/i, -1);

  if (score > 0) return 'sale';
  if (score < 0) return 'acquisition';
  return null;
}

function inferDocumentDirection(text, purpose = '') {
  const normalizedPurpose = normalizeExtractionPurpose(purpose);
  if (!text) return normalizedPurpose;
  if (normalizedPurpose === 'sale' || normalizedPurpose === 'acquisition') return normalizedPurpose;

  const saleSignal = /\b(?:Buyer|Purchaser(?:\(s\))?|Sold To|Transferred To|Purchaser\(s\)? Name\(s\)?|Buyer Name|Vehicle Sales Price|Selling Price|Sale Price)\b/i;
  const acquisitionSignal = /\b(?:Obtained From|Seller|Consignor|Auction|Bill of Sale|Invoice to Buyer|Facility|Remit Payment To|Auction Location|Purchase Price|Total Due)\b/i;
  const hasSale = saleSignal.test(text);
  const hasAcquisition = acquisitionSignal.test(text);

  if (hasAcquisition && !hasSale) return 'acquisition';
  if (hasSale && !hasAcquisition) return 'sale';
  if (/\b(?:ADESA|CMAA|Central Mass(?:achusetts)? Auto Auction|CarMax|America'?s\s+(?:AA|Auto Auction)|Manheim|Auction|Buyer Fee|Total Due|Balance Due|Purchase Price)\b/i.test(text)) {
    return 'acquisition';
  }
  if (hasAcquisition && hasSale) return 'acquisition';
  return normalizedPurpose;
}

function normalizeExtractionPurpose(purpose = '') {
  const value = String(purpose || '').trim().toLowerCase();
  if (value === 'disposition' || value === 'bill_of_sale' || value === 'bill-of-sale') return 'sale';
  if (value === 'acquisition' || value === 'purchase' || value === 'buy') return 'acquisition';
  if (value === 'sale' || value === 'sell') return 'sale';
  return '';
}

// ═══════════════════════════════════════════════════════════════
// POST-PROCESSING: Deterministic price & title extraction from raw text
// These run AFTER AI extraction and OVERRIDE the AI if they find better data
// ═══════════════════════════════════════════════════════════════

/**
 * Scans raw OCR/PDF text for a "TOTAL" line and extracts the dollar amount.
 * Returns the total price if found, or null if not found.
 * Prioritizes TOTAL lines over SALE PRICE lines.
 */
function extractTotalFromText(text, purpose = '') {
  if (!text) return null;
  purpose = normalizeExtractionPurpose(purpose);

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const amountRegex = /(\$|USD)?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
  const repairTotalMarkers = /\b(?:NET\s+TOTAL|NET\s+AMOUNT|NET\s+DUE|GRAND\s+TOTAL)\b/i;
  const totalMarkers = /\b(?:TOTAL(?:[^A-Z0-9]{0,3}S)?(?:\s*(?:AMOUNT|DUE|PAYABLE|PRICE|OWING|BALANCE|FEE|CONTRACT|CONTRACT\s+PRICE)?)|BALANCE\s+DUE|AMOUNT\s+DUE|AMOUNT\s+PAYABLE|NET\s+AMOUNT|NET\s+DUE|INVOICE\s+TOTAL|BILL\s+TOTAL|TOTAL\s+PAYABLE|AMOUNT\s+OWED|TOTAL\s+BALANCE|TOTAL\s+BALANCE\s+DUE|TOTAL\s+CONTRACT\s+PRICE)\b(?!\s*FORWARD)/i;
  const purchaseMarkers = /\b(?:PURCHASE\s*PRICE|AMOUNT\s*DUE|BALANCE\s*DUE|TOTAL\s*DUE|TOTAL\s*AMOUNT|AMOUNT\s*PAYABLE|NET\s*AMOUNT|INVOICE\s*TOTAL|BILL\s*TOTAL|BUYER\s*FEE|TOTAL\s*PRICE|TOTAL\s*CONTRACT\s*PRICE|TOTAL\s*BALANCE\s*DUE)\b/i;
  const saleMarkers = /\b(?:SALE\s*PRICE|SELLING\s*PRICE|VEHICLE\s*SALES?\s*PRICE|SOLD\s*PRICE|SALE\s*AMOUNT|SELLING\s*AMOUNT|CONTRACT\s*PRICE)\b/i;
  const paymentSummaryMarkers = /\bTOTAL\s+PAYMENTS?\b/i;
  const skipMarkers = /\bSUBTOTAL\b/i;
  const excludeSaleMarkers = /\bTOTAL\s+(?:SALE|SELLING)\s+PRICE\b/i;
  const minValue = purpose === 'acquisition' ? 500 : purpose === 'sale' ? 50 : 10;
  const candidates = [];

  const extractAmounts = (source) => {
    const normalized = String(source || '').replace(/[Oo](?=\d)/g, '0');
    const values = [];
    const addValue = (raw) => {
      const rawText = String(raw);
      let value = parseFloat(rawText.replace(/[\s,]/g, ''));
      const compactDigits = rawText.replace(/\D/g, '');
      if (!/[,.]/.test(rawText) && compactDigits.length === 5 && compactDigits.startsWith('0')) {
        return;
      }
      if (
        Number.isFinite(value) &&
        value > 100000 &&
        !/[,.]/.test(rawText) &&
        compactDigits.length >= 6 &&
        compactDigits.endsWith('00')
      ) {
        value = value / 100;
      }
      if (Number.isFinite(value)) values.push(value);
    };

    for (const match of normalized.matchAll(/(?:\$|USD|US\$|>\$|>S|S)\s*([0-9]{1,3}(?:[\s,][0-9]{3})+(?:\.\d{1,2})?|\d{4,6}(?:\.\d{1,2})?)/gi)) {
      addValue(match[1]);
    }
    if (values.length) return values.filter(value => Number.isFinite(value));

    const matches = [...normalized.matchAll(amountRegex)];
    for (const match of matches) addValue(match[2]);

    return values.filter(value => Number.isFinite(value));
  };

  const pickBestAmount = (values) => {
    const valid = values.filter((value) => Number.isFinite(value) && value >= minValue);
    if (!valid.length) return null;
    return valid.sort((a, b) => b - a)[0];
  };

  const isLikelyContaminatedAddressRow = (line, amount) => {
    if (!isAddressLikeLine(line)) return false;
    if (/[$]|USD|US\$|>\$|>S/i.test(line)) return false;
    return Number.isFinite(amount) && amount < 500;
  };

  const addCandidate = (value, score, kind = 'generic') => {
    if (Number.isFinite(value) && value >= minValue) {
      candidates.push({ value, score, kind });
    }
  };

  // FIRST PASS: Repair-specific preferred totals first (Net Total / Grand Total)
  if (purpose === 'repair') {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (skipMarkers.test(line)) continue;
      if (paymentSummaryMarkers.test(line)) continue;
      if (!repairTotalMarkers.test(line) && !/\b(?:NET\s+TOTAL|GRAND\s+TOTAL|NET\s+AMOUNT|TOTAL\s*\$)\b/i.test(line)) continue;

      const directValues = extractAmounts(line);
      const bestDirect = pickBestAmount(directValues);
      if (bestDirect !== null) {
        if (!isLikelyContaminatedAddressRow(line, bestDirect)) {
          // Highest priority candidate for repair bills
          addCandidate(bestDirect, 100, 'repair_total');
        }
      }

      // Also check neighbor concatenation (some OCR spreads label and amount)
      const peer = [line, lines[i + 1] || '', lines[i - 1] || ''].join(' ');
      const bestPeer = pickBestAmount(extractAmounts(peer));
      if (bestPeer !== null && !isLikelyContaminatedAddressRow(peer, bestPeer)) {
        addCandidate(bestPeer, 95, 'repair_total');
      }
    }
  }

  // SECOND PASS: Bottom-up explicit TOTAL lines (prefer the last/bottom-most total.)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (skipMarkers.test(line)) continue;
    if (paymentSummaryMarkers.test(line)) continue;
    if (excludeSaleMarkers.test(line)) continue;  // Skip "TOTAL SALE PRICE"
    if (!totalMarkers.test(line)) continue;

    const directValues = extractAmounts(line);
    const bestDirect = pickBestAmount(directValues);
    if (bestDirect !== null) {
      if (isLikelyContaminatedAddressRow(line, bestDirect)) {
        // Address-like total rows are often OCR-contaminated with a street number.
      } else {
        addCandidate(bestDirect, 10, 'total');
      }
    }

    const peer = [line, lines[i + 1] || '', lines[i - 1] || ''].join(' ');
    const bestPeer = pickBestAmount(extractAmounts(peer));
    if (bestPeer !== null) {
      addCandidate(bestPeer, 9, 'total');
    }
  }

  if (purpose === 'sale') {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (skipMarkers.test(line)) continue;
      if (paymentSummaryMarkers.test(line)) continue;

      if (saleMarkers.test(line)) {
        const bestDirect = pickBestAmount(extractAmounts(line));
        if (bestDirect !== null) addCandidate(bestDirect, 6, 'sale');
      }

      if (/\bDate\s+of\s+Sale\b/i.test(lines[i - 1] || '') && /\bSelling\s+Price\b/i.test(lines[i - 1] || '')) {
        const dateLineValues = extractAmounts(line).filter((value) => value >= 1000 && value <= 100000);
        if (dateLineValues.length) {
          addCandidate(dateLineValues.sort((a, b) => b - a)[0], 7, 'sale');
        }
      }

      const unlabeledDatePrice = line.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\s+(\d{4,6})(?:\b|$)/);
      if (unlabeledDatePrice && /\b(?:MOTOR VEHICLE|VESSEL DESCRIPTION|ODOMETER DISCLOSURE|COSTS AND DISCOUNTS|Selling Price)\b/i.test(lines.slice(Math.max(0, i - 12), Math.min(lines.length, i + 12)).join(' '))) {
        const value = Number(unlabeledDatePrice[1]);
        if (Number.isFinite(value)) addCandidate(value, 7, 'sale');
      }
    }
  }

  // SECOND PASS: Bottom-up purchase/balance markers (medium priority)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (skipMarkers.test(line)) continue;
    if (paymentSummaryMarkers.test(line)) continue;
    if (purpose === 'acquisition' && saleMarkers.test(line)) continue;  // Skip sale prices for acquisitions
    if (!purchaseMarkers.test(line)) continue;
    if (excludeSaleMarkers.test(line)) continue;

    const directValues = extractAmounts(line);
    const bestDirect = pickBestAmount(directValues);
    if (bestDirect !== null) {
      if (isLikelyContaminatedAddressRow(line, bestDirect)) {
        // Same contamination protection as the TOTAL pass.
      } else {
        addCandidate(bestDirect, 8, 'purchase');
      }
    }

    const peer = [line, lines[i + 1] || '', lines[i - 1] || ''].join(' ');
    const bestPeer = pickBestAmount(extractAmounts(peer));
    if (bestPeer !== null) {
      addCandidate(bestPeer, 7, 'purchase');
    }
  }

  // FALLBACK: Use the last valid amount in the footer region, but only from
  // rows that look like actual money/price rows. This avoids VIN fragments,
  // odometers, dates, and boilerplate numbers becoming fake prices.
  const footerLines = lines
    .slice(-16)
    .filter((line) => /(?:\$|USD|US\$|>\$|>S|\b(?:PRICE|FEE|TOTAL|AMOUNT|DUE|BALANCE|PAYMENTS?|NET)\b)/i.test(line) && !paymentSummaryMarkers.test(line))
    .join(' ');
  const footerValues = extractAmounts(footerLines);
  if (footerValues.length > 0) {
    const validValues = footerValues.filter(v => v >= minValue);
    if (validValues.length > 0) {
      const footerValue = validValues.sort((a, b) => b - a)[0];
      addCandidate(footerValue, 1, 'footer');
    }
  }

  if (!candidates.length) return null;

  // Filter out raw sale/selling price candidates if a reasonable authoritative total/purchase price exists (>= 1000)
  const hasAuthoritativeTotal = candidates.some((c) => (c.kind === 'total' || c.kind === 'purchase') && c.value >= 1000);
  let finalCandidates = candidates;
  if (hasAuthoritativeTotal) {
    finalCandidates = candidates.filter((c) => c.kind !== 'sale');
    if (finalCandidates.length === 0) {
      finalCandidates = candidates;
    }
  }

  finalCandidates.sort((a, b) => b.score - a.score || b.value - a.value);
  let bestCandidate = finalCandidates[0] || null;
  if (purpose === 'sale' && bestCandidate?.kind === 'total' && bestCandidate.value < 1000) {
    const saleCandidate = finalCandidates
      .filter((candidate) => candidate.kind === 'sale' && candidate.value > bestCandidate.value * 2)
      .sort((a, b) => b.score - a.score || a.value - b.value)[0];
    if (saleCandidate) bestCandidate = saleCandidate;
  }
  const best = bestCandidate?.value || null;
  if (best) console.log(`[Parser:PostProcess] Found ${purpose === 'sale' ? 'sale' : 'TOTAL'} price from text: $${best}`);
  return best;
}

function extractSpacedVin(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    // Only treat it as a spaced VIN if it has high density of single characters or pipes
    const pipeCount = (line.match(/\|/g) || []).length;
    const spaceCharMatches = line.match(/\b[A-Z0-9]\b/gi) || [];
    if (pipeCount < 4 && spaceCharMatches.length < 6) {
      continue; // Skip lines that are just regular words
    }

    // 1. Straightforward replacement of spaces/pipes/brackets
    let cleaned = line.replace(/[|/\\[\]\s_-]/g, '').toUpperCase();
    for (let i = 0; i + 17 <= cleaned.length; i++) {
      const candidate = cleaned.slice(i, i + 17);
      if (/^[A-HJ-NPR-Z0-9]{17}$/.test(candidate) && isValidVin(candidate)) {
        return candidate;
      }
    }

    // 2. OCR pipe-to-1/l/I fallback
    const parts = line.toUpperCase().split(/[\s|/\\\[\]1lI_]+/);
    const singleChars = parts.filter(p => p.length === 1 && /^[A-Z0-9]$/.test(p));
    if (singleChars.length >= 17) {
      const candidate = singleChars.slice(0, 17).join('');
      if (/^[A-HJ-NPR-Z0-9]{17}$/.test(candidate) && isValidVin(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function extractVinFromText(text) {
  if (!text) return null;

  const spaced = extractSpacedVin(text);
  if (spaced) return spaced;

  const normalizeVin = (vin) => vin.replace(/[IOQ]/g, (char) => (char === 'I' ? '1' : '0'));
  const candidates = new Set();
  const priorityCandidates = [];

  const addCandidate = (candidate, priority = false) => {
    if (!candidate) return;
    const value = String(candidate).replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (!/^[A-Z0-9]{17}$/.test(value)) return;
    if (priority && !priorityCandidates.includes(value)) priorityCandidates.push(value);
    candidates.add(value);
  };

  const addCandidateVariations = (source, priority = false) => {
    const condensed = String(source || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (!condensed) return;

    if (condensed.length === 17) {
      addCandidate(condensed, priority);
      return;
    }

    for (let i = 0; i + 17 <= condensed.length; i++) {
      addCandidate(condensed.slice(i, i + 17), priority);
    }

    if (condensed.length > 17 && condensed.length <= 20) {
      for (let i = 0; i < condensed.length; i++) {
        addCandidate(condensed.slice(0, i) + condensed.slice(i + 1), priority);
      }
    }

    if (condensed.length === 16) {
      for (const prefix of ['1', '2', '3', '4', '5']) {
        addCandidate(prefix + condensed, priority);
      }
    }
  };

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/\bVehicle\/Vessel\s+Identification\s+Number\b|\bVehicle\s+Identification\s+Number\b|\bV\.?I\.?N\.?\b/i.test(lines[i])) continue;
    const nearby = lines.slice(i + 1, i + 4);
    for (const line of nearby) {
      const tokens = String(line || '').match(/[A-Z0-9]{5,20}/gi) || [];
      for (const token of tokens) {
        if (/^[A-Z]{1,4}\d{4,9}$/i.test(token)) continue;
        addCandidateVariations(token, true);
      }
    }
  }

  const normalizedText = text.replace(/[^A-Z0-9\n]/gi, ' ').toUpperCase();
  for (const match of normalizedText.match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) || []) {
    addCandidate(match);
  }

  const flatten = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (let i = 0; i + 17 <= flatten.length; i++) {
    const candidate = flatten.slice(i, i + 17);
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(candidate)) {
      addCandidate(candidate);
    }
  }

  const vinLabelPattern = /\bVIN\b[:\s]*([A-Z0-9\s-]{17,40})/i;
  for (const line of lines) {
    const match = line.match(vinLabelPattern);
    if (!match) continue;
    const condensed = match[1].replace(/[^A-Z0-9]/gi, '').toUpperCase();
    for (let i = 0; i + 17 <= condensed.length; i++) {
      const candidate = condensed.slice(i, i + 17);
      if (/^[A-HJ-NPR-Z0-9]{17}$/.test(candidate)) {
        addCandidate(candidate, true);
      }
    }
  }

  const sortedPriorityCandidates = [...priorityCandidates].sort((a, b) => {
    const aNorthAmerica = /^[1-5]/.test(a) ? 1 : 0;
    const bNorthAmerica = /^[1-5]/.test(b) ? 1 : 0;
    return bNorthAmerica - aNorthAmerica;
  });

  for (const candidate of sortedPriorityCandidates) {
    if (isValidVin(candidate)) return candidate;
  }
  for (const candidate of sortedPriorityCandidates) {
    const fixed = normalizeVin(candidate);
    if (fixed !== candidate && isValidVin(fixed)) return fixed;
  }

  if (sortedPriorityCandidates[0]) return sortedPriorityCandidates[0];

  for (const candidate of candidates) {
    if (isValidVin(candidate)) return candidate;
  }

  for (const candidate of candidates) {
    const fixed = normalizeVin(candidate);
    if (fixed !== candidate && isValidVin(fixed)) return fixed;
  }

  return null;
}

/**
 * Scans raw OCR/PDF text for title number patterns.
 * Returns the title number if found, or null.
 */
function extractTitleFromText(text) {
  if (!text) return null;

  const lines = text.split(/\r?\n/);
  const joined = lines.join('\n');

  const layoutPatterns = [
    /\bTitle\s+State\s*\/\s*Number\s*[:#-]?\s*([A-Z]{2})\s*\/?\s*([A-Z]{1,4}\d{4,9})\b/i,
    /\bTitle\s+State\s*\/\s*Number\s*[:#-]?\s*([A-Z]{2}[A-Z]{1,4}\d{4,9})\b/i,
    /\bState\s+Title\s*#\s+V\.?I\.?N\.?\s*No\.?\s*\n?\s*([A-Z]{2})\s+([A-Z]{1,4}\d{4,9})\b/i,
    /\b([A-Z]{2})\s*\|\s*([A-Z]{1,4}\d{4,9})\s+(?=[A-HJ-NPR-Z0-9]{17}\b)/i,
    /\b(?:MA|CT|RI|NH|NY|NJ)\s+([A-Z]{1,4}\d{4,9})\s+(?=[A-HJ-NPR-Z0-9]{17}\b)/i,
    /\bTitle\s*#\s*[:#-]?\s*([A-Z]{1,4}\d{4,9})\b/i,
    /\bCertificate\s+of\s+Title\s+Number\s*[:#-]?\s*([A-Z]{1,4}\d{4,9})\b/i,
  ];

  for (const pattern of layoutPatterns) {
    const match = joined.match(pattern);
    if (!match) continue;
    const candidate = normalizeTitleNumber(match[2] || match[1]);
    if (candidate) {
      console.log(`[Parser:PostProcess] Found Title Number: ${candidate}`);
      return candidate;
    }
  }

  const titleMarkers = /\b(?:TITLE\s*(?:NUMBER|NO\.?|#|STATE\s*NUMBER|STATE\s*\/\s*NUMBER)|CERTIFICATE\s*(?:OF\s*TITLE)?\s*(?:NUMBER|NO\.?|#)?|TITLE\s*ID)\b/i;

  const candidateFromLine = (line) => {
    const valueMatch = line.match(/(?:TITLE\s*(?:NUMBER|NO\.?|#|STATE\s*NUMBER|STATE\s*\/\s*NUMBER)|CERTIFICATE\s*(?:OF\s*TITLE)?\s*(?:NUMBER|NO\.?|#)?|TITLE\s*ID)\s*[:#\-\s]*((?:[A-Z]{2}\s*\/?\s*)?[A-Z]{1,4}\d{4,9})\b/i);
    return valueMatch ? normalizeTitleNumber(valueMatch[1]) : null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (!titleMarkers.test(line)) continue;

    const candidate = candidateFromLine(line) || candidateFromLine(lines[i + 1] || '');
    if (candidate) {
      console.log(`[Parser:PostProcess] Found Title Number: ${candidate} from line: ${line}`);
      return candidate;
    }
  }

  const globalMatch = text.match(/\b(?:TITLE\s*(?:NUMBER|NO\.?|#|STATE\s*NUMBER|STATE\s*\/\s*NUMBER)|CERTIFICATE\s*(?:OF\s*TITLE)?\s*(?:NUMBER|NO\.?|#)?|TITLE\s*ID)\s*[:#\-\s]*((?:[A-Z]{2}\s*\/?\s*)?[A-Z]{1,4}\d{4,9})\b/i);
  if (globalMatch) {
    const candidate = normalizeTitleNumber(globalMatch[1]);
    if (candidate) {
      console.log(`[Parser:PostProcess] Found Title Number (global): ${candidate}`);
      return candidate;
    }
  }

  return null;
}

function normalizeTitleNumber(candidate) {
  if (!candidate) return null;
  let cleaned = String(candidate).toUpperCase().replace(/[^A-Z0-9/]/g, '');
  if (!cleaned) return null;
  cleaned = cleaned.replace(/^[A-Z]{2}\//, '');

  const statePrefixMatch = cleaned.match(/^(MA|CT|RI|NH|NY|NJ|VT|ME)([A-Z]{1,4}\d{4,9})$/);
  if (statePrefixMatch) cleaned = statePrefixMatch[2];

  cleaned = cleaned.replace(/[^A-Z0-9]/g, '');
  if (!cleaned || cleaned.length < 5 || cleaned.length > 12) return null;
  if (/^0+$/.test(cleaned)) return null;
  if (/^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned)) return null;
  if ((cleaned.match(/\d/g) || []).length < 2) return null;
  if (/^(TITLE|TITL|INFORMATION|INFO|WARRANTY|WARR|ATTACHED|ABSENT|PENDING|NONE|NO|CERTIFICATE|ORIGIN|VEHICLE|STATE|NUMBER|DOCUMENT|SALVAGE|REBUILT|PARTS|REPAIRABLE)$/i.test(cleaned)) return null;
  if (/^(TITLE|CERT|DOC|INFO|WARR)/i.test(cleaned) && (cleaned.match(/\d/g) || []).length < 4) return null;
  return cleaned;
}

/**
 * Apply post-processing fixes to AI result using raw document text.
 */
function mergeFallbackResult(result, fallback) {
  if (!fallback) return result;
  const merged = { ...result };
  const isSuspiciousValue = (val) => {
    if (!val || typeof val !== 'string') return false;
    const v = val.toLowerCase();
    if (/\b(http:|https:|www\.|\.com|\.net|inventory|stock#|stock:|sku|\/inventory)\b/.test(v)) return true;
    if (/\b(invoice|click here|learn more)\b/.test(v)) return true;
    return false;
  };
  for (const [key, value] of Object.entries(fallback)) {
    if (value === undefined || value === null || value === '') continue;
    const target = merged[key];

    // --- SMART VIN OVERRIDE ---
    if (key === 'vin' && typeof value === 'string') {
      const fallbackVin = value.toUpperCase();
      const aiVin = typeof target === 'string' ? target.toUpperCase() : '';
      
      // If AI failed completely or hallucinated a length, trust the fallback
      if (aiVin.length !== 17 && fallbackVin.length === 17) {
        console.log(`[Parser:PostProcess] Overriding AI VIN (${aiVin}) with Fallback (${fallbackVin}) due to invalid length.`);
        merged[key] = fallbackVin;
        continue;
      }
      
      // If both are 17 chars but AI has illegal characters (I, O, Q) and fallback doesn't
      if (aiVin.length === 17 && fallbackVin.length === 17 && aiVin !== fallbackVin) {
        const aiIllegal = /[IOQ]/i.test(aiVin);
        const fallbackIllegal = /[IOQ]/i.test(fallbackVin);
        if (aiIllegal && !fallbackIllegal) {
           console.log(`[Parser:PostProcess] Overriding AI VIN (${aiVin}) with Fallback (${fallbackVin}) due to illegal chars (I, O, Q).`);
           merged[key] = fallbackVin;
           continue;
        }
        
        // Let's also check if the AI VIN has adjacent repeated digits that look like an OCR dropped letter (e.g. '8' instead of 'B')
        // We know Tesseract is often better at exact string sequences on plain paper than Vision LLMs.
        // If Tesseract found a perfect 17 char VIN, it's highly likely to be correct.
        // We will prefer the fallback if it's 17 characters and the AI is different.
        console.log(`[Parser:PostProcess] Overriding AI VIN (${aiVin}) with Fallback (${fallbackVin}) because Tesseract is generally more accurate for exact sequences.`);
        merged[key] = fallbackVin;
        continue;
      }
    }
    
    // --- SMART TITLE NUMBER OVERRIDE ---
    if (key === 'titleNumber' && typeof value === 'string' && typeof target === 'string') {
      // AI often hallucinates state prefixes (e.g., MAB5835623 instead of B5835623)
      if (target.length > value.length && target.endsWith(value)) {
        console.log(`[Parser:PostProcess] Overriding AI Title (${target}) with Fallback (${value}) to strip hallucinated prefix.`);
        merged[key] = value;
        continue;
      }
    }

    if (target === undefined || target === null || target === '' || target === 0) {
      // Do not accept unreasonable numeric totals from fallback
      if ((key === 'purchasePrice' || key === 'disposedPrice') && !isReasonableTotal(value)) {
        continue;
      }
      merged[key] = value;
      continue;
    }
    // Prefer fallback if existing value looks like a hallucinated link/inventory token
    if (isSuspiciousValue(target) && !isSuspiciousValue(value)) {
      merged[key] = value;
    }
    // If existing numeric price looks unreasonable, prefer a reasonable fallback
    if ((key === 'purchasePrice' || key === 'disposedPrice')) {
      const parseNum = (v) => {
        if (v === undefined || v === null) return NaN;
        const n = Number(String(v).replace(/[^0-9.-]+/g, ''));
        return Number.isFinite(n) ? n : NaN;
      };
      const targetNum = parseNum(target);
      const valueNum = parseNum(value);
      const targetBad = !isReasonableTotal(targetNum);
      const valueGood = isReasonableTotal(valueNum);
      if (targetBad && valueGood) {
        merged[key] = valueNum;
      } else if (targetBad && !valueGood) {
        // remove obviously bad numeric value if no good fallback
        delete merged[key];
      }
    }
  }
  return merged;
}

// Basic sanity checks for numeric totals/prices
function isReasonableTotal(value) {
  if (value === undefined || value === null) return false;
  const num = Number(value);
  if (!Number.isFinite(num)) return false;
  // Reject obviously OCR-misread huge values
  if (num > 100000) return false;
  // Reject negative, zero, or tiny values that are unlikely to be vehicle totals
  if (num < 50) return false;
  return true;
}

function isVehicleBoilerplateText(value) {
  return /\b(any\s+legally\s+required|repairs?\s+prior\s+to\s+sale|terms?\s+and\s+conditions|warrant(?:y|ies)|purchaser\s+acknowledges|buyer\s+agree|seller\s+agree|disclosures?|arbitration|remit|payment|invoice|line\s+total|outstanding\s+balance|co\s+inc\s+buyer)\b/i.test(String(value || ''));
}

function postProcessResult(result, rawText, purpose) {
  if (!result) return result;
  purpose = normalizeExtractionPurpose(purpose);

  // ── PROGRAMMATIC CORRECTION & FIELD DUPLICATION GUARDS ──
  // 1. Odometer vs Price duplicate guard: Prevent AI copying the price into the odometer/mileage field.
  if (result.disposedOdometer && result.disposedPrice && Number(result.disposedOdometer) === Number(result.disposedPrice) && Number(result.disposedPrice) >= 500) {
    console.log(`[Parser:PostProcess] Duplicate field value detected (disposedOdometer === disposedPrice = ${result.disposedPrice}) — resetting odometer to avoid contamination.`);
    result.disposedOdometer = null;
  }
  if (result.mileage && result.purchasePrice && Number(result.mileage) === Number(result.purchasePrice) && Number(result.purchasePrice) >= 500) {
    console.log(`[Parser:PostProcess] Duplicate field value detected (mileage === purchasePrice = ${result.purchasePrice}) — resetting mileage to avoid contamination.`);
    result.mileage = null;
  }

  // 2. Authoritative Price Correction from allVisiblePrices array
  if (result.allVisiblePrices && Array.isArray(result.allVisiblePrices)) {
    const currentAcqPrice = Number(result.purchasePrice || 0);
    const currentSalePrice = Number(result.disposedPrice || 0);
    const currentPrice = currentAcqPrice || currentSalePrice || 0;

    const validPrices = result.allVisiblePrices
      .map(v => Number(String(v).replace(/[^0-9.]/g, '')))
      .filter(v => Number.isFinite(v) && v >= 500 && v <= 150000);

    if (validPrices.length > 0 && currentPrice >= 500) {
      const maxVisiblePrice = Math.max(...validPrices);
      // If the largest visible price is greater than our parsed price, and within a reasonable range (up to 45% higher, representing fees/taxes added)
      if (maxVisiblePrice > currentPrice && maxVisiblePrice <= currentPrice * 1.45) {
        console.log(`[Parser:PostProcess] Programmatic Price Override: ${currentPrice} → ${maxVisiblePrice} (Authoritative Max Total from allVisiblePrices)`);
        if (result.purchasePrice || purpose === 'acquisition') {
          result.purchasePrice = maxVisiblePrice;
        } else {
          result.disposedPrice = maxVisiblePrice;
        }
      }
    }
  }

  // 3. Odometer correction from allVisibleOdometers/allVisibleMileages
  const odomSource = result.allVisibleOdometers || result.allVisibleMileages || result.allVisibleMileagesList;
  if (odomSource && Array.isArray(odomSource)) {
    const currentOdom = Number(result.disposedOdometer || result.mileage || 0);
    const currentPrice = Number(result.purchasePrice || result.disposedPrice || 0);
    const validOdoms = odomSource
      .map(v => Number(String(v).replace(/[^0-9.]/g, '')))
      .filter(v => Number.isFinite(v) && v > 0 && v !== currentPrice);

    if (validOdoms.length > 0 && (!currentOdom || currentOdom === currentPrice)) {
      // Pick the highest valid odometer reading (usually represent mileage)
      const bestOdom = Math.max(...validOdoms);
      console.log(`[Parser:PostProcess] Programmatic Odometer Override: ${currentOdom} → ${bestOdom}`);
      if (result.disposedOdometer !== undefined) {
        result.disposedOdometer = bestOdom;
      }
      if (result.mileage !== undefined) {
        result.mileage = bestOdom;
      }
    }
  }

  // Clean up internal helper fields so they don't leak to DB
  delete result.allVisiblePrices;
  delete result.allVisibleOdometers;
  delete result.allVisibleMileages;
  delete result.allVisibleMileagesList;

  // ── ALWAYS apply known-auction overrides from LLM result fields ──
  // This runs even when rawText is empty (fast Vision LLM bypass path).
  // If the LLM extracted a purchasedFrom that matches a known auction,
  // we overlay the canonical address details from our lookup table.
  if (purpose === 'acquisition' || purpose === '') {
    const knownAuctionOverrides = [
      { pattern: /\bADESA\s+Concord\b/i, name: 'ADESA Concord', address: '77 Hosmer Street', city: 'Acton', state: 'MA', zip: '01720' },
      { pattern: /\bADESA\s+Boston\b/i, name: 'ADESA Boston', address: '63 Western Avenue', city: 'Framingham', state: 'MA', zip: '01702' },
      { pattern: /\bManheim\b/i, name: 'Manheim New England', address: '123 Williams St', city: 'North Dighton', state: 'MA', zip: '02764' },
      { pattern: /\bAmerica'?s\s+(?:AA|Auto Auction)\b/i, name: "America's AA Boston", address: '400 Charter Way', city: 'North Billerica', state: 'MA', zip: '01862' },
      { pattern: /\bCMAA\b|Central\s+Mass/i, name: 'Central Mass Auto Auction', address: '', city: '', state: 'MA', zip: '' },
      { pattern: /\bCarMax\b/i, name: 'CarMax', address: '', city: '', state: '', zip: '' },
    ];

    // Check the LLM's purchasedFrom field against known auction names
    const purchasedFrom = String(result.purchasedFrom || '');
    const matchedAuction = knownAuctionOverrides.find(a => a.pattern.test(purchasedFrom));
    if (matchedAuction) {
      console.log(`[Parser:PostProcess] Known auction detected in LLM result: "${purchasedFrom}" → overlaying canonical "${matchedAuction.name}" details`);
      result.purchasedFrom = matchedAuction.name;
      if (matchedAuction.address) {
        result.usedVehicleSourceAddress = matchedAuction.address;
        result.usedVehicleSourceCity = matchedAuction.city;
        result.usedVehicleSourceState = matchedAuction.state;
        result.usedVehicleSourceZipCode = matchedAuction.zip;
      }
    }

    // Also check if Broadway's own details leaked into the source fields and clear them
    const broadwayPattern = /\b(?:BROADWAY\s+USED\s+AUTO|AUTO\s+SALES\s+ON\s+BROADWAY|100\s+BROADWAY|2125\s+REVERE\s+BEACH)\b/i;
    if (broadwayPattern.test(purchasedFrom)) {
      console.log(`[Parser:PostProcess] Broadway's name detected as purchasedFrom — clearing to prevent self-referencing.`);
      result.purchasedFrom = null;
    }
    if (broadwayPattern.test(String(result.usedVehicleSourceAddress || ''))) {
      console.log(`[Parser:PostProcess] Broadway's address detected as source address — clearing.`);
      result.usedVehicleSourceAddress = null;
      result.usedVehicleSourceCity = null;
      result.usedVehicleSourceState = null;
      result.usedVehicleSourceZipCode = null;
    }
  }

  // If rawText is empty (fast Vision LLM path), skip text-dependent heuristics
  if (!rawText) return result;

  // Fill missing VIN/title/price from raw text if AI returned partial output
  const fallback = extractFallbackInfo(rawText, purpose);
  result = mergeFallbackResult(result, fallback);

  // Also parse the raw text deterministically and prefer those values for
  // acquisition/disposition contact fields when the AI output looks suspicious
  try {
    const parsed = extractVehicleInfoFromText(rawText || '');
    const preferFields = [
      'purchasedFrom',
      'usedVehicleSourceAddress',
      'usedVehicleSourceCity',
      'usedVehicleSourceState',
      'usedVehicleSourceZipCode',
      'disposedTo',
      'disposedAddress',
      'disposedCity',
      'disposedState',
      'disposedZip'
    ];
    const isSuspicious = (v) => !v ? false : /\b(http:|https:|www\.|\\.com|inventory|stock#|stock:|sku)\b/i.test(String(v));
    for (const f of preferFields) {
      if ((!result[f] || isSuspicious(result[f])) && parsed[f]) {
        result[f] = parsed[f];
      }
    }

    const mergeParsedPrice = (field) => {
      const parsedValue = parsed[field];
      if (Number.isFinite(parsedValue) && isReasonableTotal(parsedValue)) {
        const existing = Number(result[field] || 0);
        if (!isReasonableTotal(existing) || existing === 0) {
          result[field] = parsedValue;
        }
      }
    };
    mergeParsedPrice('purchasePrice');
    mergeParsedPrice('disposedPrice');

    // If document contains explicit 'auction' markers, prefer that as purchasedFrom
    const auction = inferAuctionFromText(rawText || '');
    if ((purpose === 'acquisition' || /\bauction\b/i.test(rawText)) && auction) {
      result.purchasedFrom = auction;
    }
    if (purpose === 'acquisition' || purpose === '') {
      result = mergePreferredFields(result, extractAcquisitionDetailsFromText(rawText || ''), [
        'purchasedFrom',
        'usedVehicleSourceAddress',
        'usedVehicleSourceCity',
        'usedVehicleSourceState',
        'usedVehicleSourceZipCode'
      ]);
    }
    if (purpose === 'sale') {
      result = mergePreferredFields(result, extractDispositionDetailsFromText(rawText || ''), [
        'disposedTo',
        'disposedAddress',
        'disposedCity',
        'disposedState',
        'disposedZip'
      ]);
    }
  } catch (err) {
    // parsing fallback failed — ignore
  }

  // If AI got confused and put acquisition data into sale fields, flip it
  if (purpose === 'acquisition' || purpose === '') {
    if (!result.purchasedFrom && result.disposedTo) {
      console.log(`[Parser:PostProcess] AI flipped roles. Moving disposedTo -> purchasedFrom`);
      result.purchasedFrom = result.disposedTo;
    }
    if (!result.usedVehicleSourceAddress && result.disposedAddress) {
      result.usedVehicleSourceAddress = result.disposedAddress;
      result.usedVehicleSourceCity = result.disposedCity;
      result.usedVehicleSourceState = result.disposedState;
      result.usedVehicleSourceZipCode = result.disposedZip;
    }
    if (!result.purchasePrice && result.disposedPrice) {
      result.purchasePrice = result.disposedPrice;
    }
  }

  // Fix price: prefer explicit TOTAL values from the document whenever they
  // pass basic sanity checks. TOTAL lines are authoritative — overwrite any
  // existing sale/purchase price so long as the found TOTAL looks reasonable.
  const totalFromText = extractTotalFromText(rawText, purpose || determineDocumentPurpose(rawText) || '');
  if (totalFromText) {
    const total = Number(totalFromText);
    if (!isReasonableTotal(total)) {
      console.log(`[Parser:PostProcess] Skipping TOTAL override: ${total} flagged as unreasonable`);
    } else {
      const inferredPurpose = determineDocumentPurpose(rawText) || inferDocumentDirection(rawText, purpose);
      const hasAcquisitionFacility = /\b(?:ADESA|MANHEIM|CMAA|CENTRAL MASS(?:ACHUSETTS)? AUTO AUCTION|CARMAX|AMERICA'?S\s+(?:AA|AUTO AUCTION))\b/i.test(rawText || '');
      const hasDispositionLanguage = /\b(?:DISPOSITION OF MOTOR VEHICLE|TRANSFERRED TO|PURCHASER(?:'S)?\s+NAME|PURCHASER\(S\)|BUYER\s+NAME|SOLD\s+TO|SELLING\s+PRICE)\b/i.test(rawText || '');
      const isAcquisitionDocument =
        hasAcquisitionFacility ||
        inferredPurpose === 'acquisition' ||
        (result.purchasedFrom && !hasDispositionLanguage);
      const isSaleDocument =
        !isAcquisitionDocument &&
        (inferredPurpose === 'sale' || inferredPurpose === 'disposition' || result.disposedTo || result.disposedAddress);

      if (isSaleDocument) {
        const priceField = 'disposedPrice';
        const currentPrice = Number(result[priceField] || 0);
        if (currentPrice !== total) {
          console.log(`[Parser:PostProcess] Overriding ${priceField}: ${currentPrice} → ${total} (TOTAL from document text)`);
        }
        result[priceField] = total;
      } else if (isAcquisitionDocument) {
        const priceField = 'purchasePrice';
        const currentPrice = Number(result[priceField] || 0);
        if (currentPrice !== total) {
          console.log(`[Parser:PostProcess] Overriding ${priceField}: ${currentPrice} → ${total} (TOTAL from document text)`);
        }
        result[priceField] = total;
      } else {
        if (result.disposedPrice) {
          const priceField = 'disposedPrice';
          const currentPrice = Number(result[priceField] || 0);
          if (currentPrice !== total) {
            console.log(`[Parser:PostProcess] Overriding ${priceField}: ${currentPrice} → ${total} (TOTAL from document text)`);
          }
          result[priceField] = total;
        } else {
          const priceField = 'purchasePrice';
          const currentPrice = Number(result[priceField] || 0);
          if (currentPrice !== total) {
            console.log(`[Parser:PostProcess] Overriding ${priceField}: ${currentPrice} → ${total} (TOTAL from document text)`);
          }
          result[priceField] = total;
        }
      }
    }
  }

  // Sale/disposition documents should not backfill acquisition totals unless
  // the document explicitly contains acquisition-style total labels.
  if (purpose === 'sale' && result.purchasePrice) {
    const hasExplicitAcquisitionTotalLabel = /\b(?:Purchase Price|Total Due|Amount Due|Balance Due|Amount Payable|Net Amount|Invoice Total|Bill Total|Total Amount)\b/i.test(rawText || '');
    if (!hasExplicitAcquisitionTotalLabel && result.disposedPrice) {
      result.purchasePrice = null;
    }
  }

  if (!result.titleNumber) {
    const titleFromText = extractTitleFromText(rawText);
    if (titleFromText) {
      console.log(`[Parser:PostProcess] Filling titleNumber from text: ${titleFromText}`);
      result.titleNumber = titleFromText;
    }
  }

  if (!result.vin) {
    const vinFromText = extractVinFromText(rawText);
    if (vinFromText) {
      console.log(`[Parser:PostProcess] Filling VIN from text: ${vinFromText}`);
      result.vin = vinFromText;
    }
  }

  return result;
}

// Heuristic to infer auction name from raw document text
function inferAuctionFromText(text) {
  if (!text) return null;
  const m = text.match(/([A-Z0-9 &'"-]{3,}?)\s+(?:AUCTION|AUTO AUCTION|VEHICLE AUCTION|AUCTIONS)\b/i);
  if (m) return m[1].trim();
  const m2 = text.match(/Auction[:\s-]+(.+?)(?:\r?\n|$)/i);
  if (m2) return m2[1].trim();

  const m3 = text.match(/\bAmerica'?s\s+(?:AA|Auto Auction)(?:\s+Boston)?\b/i);
  if (m3) return m3[0].trim();

  return null;
}

const BROADWAY_PATTERN = /\b(BROADWAY USED AUTO SALES|AUTO SALES ON BROADWAY|100 BROADWAY|2125 REVERE BEACH|NORWOOD,?\s+MA\s+02062|EVERETT,?\s+MA\s+02149)\b/i;
const AUCTION_NAME_PATTERN = /\b(ADESA|MANHEIM|CARMAX|CMAA|CENTRAL MASS(?:ACHUSETTS)? AUTO AUCTION|AMERICA'?S (?:AA|AUTO AUCTION)|ACV|COPART|IAAI|AUTO AUCTION|AUCTION)\b/i;
const STREET_PATTERN = /^\d{1,6}\s+.+\b(?:ST|STREET|RD|ROAD|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|LN|LANE|PKWY|PARKWAY|HWY|HIGHWAY|WAY|CT|COURT|PL|PLACE|PIKE|TURNPIKE)\b\.?/i;
const CITY_STATE_ZIP_PATTERN = /([A-Za-z .'-]+),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i;

function mergePreferredFields(base, preferred, fields) {
  if (!preferred) return base;
  const merged = { ...base };
  for (const field of fields) {
    const value = preferred[field];
    if (value !== undefined && value !== null && value !== '') merged[field] = value;
  }
  return merged;
}

function normalizeDocumentLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function isBroadwayValue(value) {
  return BROADWAY_PATTERN.test(String(value || ''));
}

function isHeaderishAddress(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (/^(address|city|state|zip|zip code|city state|city state zip|city state zp code)$/i.test(text)) return true;
  if (!/\d/.test(text) && /\b(city|state|zip|address)\b/i.test(text)) return true;
  return false;
}

function isAddressLikeLine(line) {
  const text = String(line || '');
  return /\b(?:street|st\b|road|rd\b|avenue|ave\b|boulevard|blvd\b|drive|dr\b|lane|ln\b|turnpike|tpke\b|parkway|pkwy\b|way|city|state|zip|zp\b|address)\b/i.test(text);
}

function cleanRoleName(value) {
  if (!value) return null;
  const str = String(value).toLowerCase();
  if (/\b(hereby|certif|best\s+of|knowledge|source\s+of\s+the\s+motor|person\s+who|dealer\s+reassignment|drt-1|authorized\s+rep|federal\s+law|state\s+law|odometer|alter|amended|transfer\s+a\s+motor|control\s+number)\b/i.test(str)) {
    return null;
  }
  const cleaned = String(value)
    .replace(/^\s*(?:BUYER|PURCHASER|SOLD TO|CUSTOMER|SELLER|DEALER|CONSIGNOR|FACILITY|AUCTION|REMIT PAYMENT TO|TRANSACTION LOCATION|BILL TO|SHIP TO)\b\s*[:#-]*/i, '')
    .replace(/\b(?:PURCHASER'?S?\s+NAME|BUYER'?S?\s+NAME)\b.*$/i, '')
    .replace(/\b(?:ADDRESS|ADDR|CITY|STATE|ZIP|DATE|VIN|STOCK|LOT|INVOICE|TOTAL)\b.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[.,;:\s]+$/g, '')
    .trim();
  if (!cleaned || cleaned.length < 3 || /^'?s$/i.test(cleaned) || isBroadwayValue(cleaned)) return null;
  return cleaned;
}

export function cleanDispositionName(value) {
  if (!value) return null;
  const str = String(value).toLowerCase();
  if (/\b(hereby|certif|best\s+of|knowledge|source\s+of\s+the\s+motor|person\s+who|dealer\s+reassignment|drt-1|authorized\s+rep|federal\s+law|state\s+law|odometer|alter|amended|transfer\s+a\s+motor|control\s+number)\b/i.test(str)) {
    return null;
  }
  let cleaned = String(value).trim();
  
  // Strip address patterns (e.g. " 30 Press Ave..." or " 74 Orchardhill...")
  cleaned = cleaned.replace(/\s+\d+\s+[a-zA-Z]{3,}.*$/i, '');

  // Strip layout keywords and anything after them (e.g. "Address City State...")
  cleaned = cleaned.replace(/\b(?:Address|City|State|Zip|Z(?:ip|p)\s*Code|Date\s+of\s+Sale|Date|Sale)\b.*$/i, '');

  // Remove known labels from the start
  cleaned = cleaned.replace(/^\s*(?:BUYER(?:\s*NAME)?|PURCHASER(?:\(S\))?(?:\s*NAME(?:\(S\))?)?|SOLD TO|CUSTOMER|TRANSFERRED TO|NAME)\s*[:#-]?\s*/i, '');
  
  // Remove state codes (like MA) if they are alone at the very beginning or end
  cleaned = cleaned.replace(/\b(?:MA|RI|NH|CT|NY|ME|VT|USA|US)\b\.?\s*$/i, '');
  cleaned = cleaned.replace(/^\s*\b(?:MA|RI|NH|CT|NY|ME|VT|USA|US)\b\.?\s+/i, '');

  // Remove trailing State Code + License/ID number (e.g. " MA SA2260770" or " MA 12345")
  const stateCodes = '(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)';
  cleaned = cleaned.replace(new RegExp(`\\s+${stateCodes}\\s+[A-Z$]?\\d[a-zA-Z0-9$-]*\\s*$`, 'i'), '');
  cleaned = cleaned.replace(new RegExp(`\\s+${stateCodes}\\s+[A-Z]{1,3}\\d[a-zA-Z0-9$-]*\\s*$`, 'i'), '');

  // Remove common OCR junk at the edges
  cleaned = cleaned.replace(/^\s*(?:i\s*AAT|AAT|S)\b\s*/i, '');
  cleaned = cleaned.replace(/\b(?:Press|Sate|State|Order|Massachusetts)\s*$/i, '');

  // Remove dates and phone/social numbers
  cleaned = cleaned.replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, ' ');
  cleaned = cleaned.replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, ' ');
  cleaned = cleaned.replace(/\$?\d[\d,]*(?:\.\d{2})?/g, ' ');
  
  // Remove everything after a Driver's License or Price label
  cleaned = cleaned.replace(/\b(?:DL|D\/L|DRIVER'?S?\s*LICENSE|LICENSE|LIC|AHTL|PHONE|TEL|DOB|SSN|SALESPERSON|SELLING PRICE|PRICE)\b.*$/i, '');

  // Replace special characters with space, keeping only letters, spaces, hyphens, and commas
  cleaned = cleaned.replace(/[^a-zA-Z\s,-]/g, ' ');
  
  // Remove stray single characters that are clearly junk at the ends
  cleaned = cleaned.replace(/(?:^|\s)[sS](?=\s|$)/g, ' ');

  // Condense spaces and trim edges
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  cleaned = cleaned.replace(/^[,-]+|[,-]+$/g, '').trim();

  // If the result is a known junk fragment or too short, reject it
  const lower = cleaned.toLowerCase();
  if (lower === 'es' || lower === 'ies' || lower === 'state' || lower === 'massachusetts' || cleaned.length < 3) {
    return null;
  }

  return cleaned || null;
}

function splitAddressParts(street, cityStateZip) {
  const streetValue = String(street || '').replace(/\s+US$/i, '').trim();
  const geoValue = String(cityStateZip || '').replace(/\s+US$/i, '').trim();
  const match = geoValue.match(CITY_STATE_ZIP_PATTERN) || streetValue.match(CITY_STATE_ZIP_PATTERN);
  const addressOnly = match && streetValue.includes(match[0])
    ? streetValue.replace(match[0], '').replace(/,\s*$/, '').trim()
    : streetValue;
  return {
    address: addressOnly || null,
    city: match ? match[1].replace(/,$/, '').trim() : null,
    state: match ? match[2].toUpperCase() : null,
    zip: match ? match[3] : null
  };
}

function findAddressNear(lines, startIndex, direction = 1, window = 8) {
  const end = direction > 0
    ? Math.min(lines.length, startIndex + window + 1)
    : Math.max(-1, startIndex - window - 1);

  for (let i = startIndex; direction > 0 ? i < end : i > end; i += direction) {
    const line = lines[i] || '';
    const inline = line.match(/(?:^|\s)Address(?!\()(?: \(number and street\))?\s*[:#-]?\s*(.+?)(?=\s+City\b|\s+State\b|\s+Zip\b|$)/i);
    const street = inline?.[1]?.trim() || (STREET_PATTERN.test(line) ? line : null);
    if (!street || isHeaderishAddress(street)) continue;

    const sameLineGeo = line.match(CITY_STATE_ZIP_PATTERN)?.[0] || '';
    const nextGeoLine = [lines[i + 1] || '', lines[i + 2] || ''].find((candidate) => CITY_STATE_ZIP_PATTERN.test(candidate)) || '';
    const parts = splitAddressParts(street, sameLineGeo || nextGeoLine);

    if (!parts.city) {
      const parseGeo = (sourceLine) => {
        if (!sourceLine) return {};
        return {
          city: sourceLine.match(/\bCity(?: or Town)?\s*[:#-]?\s*([A-Za-z .'-]+?)(?=\s+State\b|\s+Zip\b|$)/i)?.[1]?.trim(),
          state: sourceLine.match(/\bState\s*[:#-]?\s*([A-Z]{2})\b/i)?.[1]?.toUpperCase(),
          zip: sourceLine.match(/\bZip(?: Code)?\s*[:#-]?\s*(\d{5}(?:-\d{4})?)/i)?.[1]
        };
      };

      const geoFromLine = parseGeo(line);
      let geoFromNext = {};
      if (!geoFromLine.city || !geoFromLine.state || !geoFromLine.zip) {
        geoFromNext = parseGeo(lines[i + 1] || lines[i + 2] || '');
      }

      const city = geoFromLine.city || geoFromNext.city;
      const state = geoFromLine.state || geoFromNext.state;
      const zip = geoFromLine.zip || geoFromNext.zip;
      if (city || state || zip) {
        parts.city = city || parts.city;
        parts.state = state || parts.state;
        parts.zip = zip || parts.zip;
      }
    }

    return parts;
  }

  return null;
}

function findNameNear(lines, startIndex, labelRegex, window = 5) {
  for (let i = startIndex; i < Math.min(lines.length, startIndex + window); i++) {
    const line = lines[i] || '';
    const inline = line.match(labelRegex);
    if (inline?.[1]) {
      const name = cleanDispositionName(inline[1]) || cleanRoleName(inline[1]);
      if (name) return name;
    }
    if (i > startIndex && !STREET_PATTERN.test(line) && !CITY_STATE_ZIP_PATTERN.test(line) && !/\b(Address|City|State|Zip|VIN|Total|Price|Date)\b/i.test(line)) {
      const name = cleanDispositionName(line) || cleanRoleName(line);
      if (name) return name;
    }
  }
  return null;
}

function isBoilerplateDispositionLine(line) {
  if (!line) return false;
  return /\b(?:agrees?|hereby|acknowledges?|acknowledge|terms?|contains|acknowledged|shall|will|hereby)\b/i.test(line)
    && !/\b(?:Buyer|Purchaser|Customer|Transferred To|Print Name\(s\)|Purchaser\(s\)? Name\(s\))\b/i.test(line);
}

export function extractAcquisitionDetailsFromText(text) {
  const lines = normalizeDocumentLines(text);
  if (!lines.length) return {};

  const carMax = extractCarMaxAcquisitionDetails(lines);
  if (Object.keys(carMax).length) return carMax;

  const cmaa = extractCmaaAcquisitionDetails(lines);
  if (Object.keys(cmaa).length) return cmaa;

  const knownAuction = extractKnownAuctionAcquisitionDetails(lines);
  if (Object.keys(knownAuction).length) return knownAuction;

  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isBroadwayValue(line)) continue;

    const isAuctionLine = AUCTION_NAME_PATTERN.test(line);
    const isFacilityLine = /\b(FACILITY|TRANSACTION LOCATION|REMIT PAYMENT TO|AUCTION LOCATION)\b/i.test(line);
    const isSellerLine = /\b(SELLER|CONSIGNOR|SOLD BY|FROM)\b/i.test(line);
    if (!isAuctionLine && !isFacilityLine && !isSellerLine) continue;

    const name = cleanRoleName(
      line.match(/(?:Facility|Transaction Location|Remit Payment To|Auction Location|Seller|Consignor|Sold By|From)\s*[:#-]?\s*(.+)$/i)?.[1]
      || (isAuctionLine ? line : '')
    );
    const address = findAddressNear(lines, i, 1, 10) || findAddressNear(lines, i, -1, 3);
    const score = (isAuctionLine ? 10 : 0) + (isFacilityLine ? 8 : 0) + (address?.address ? 4 : 0) + (name ? 2 : 0);
    candidates.push({ score, name, address });
  }

  const best = candidates
    .filter((candidate) => candidate.name || candidate.address?.address)
    .sort((a, b) => b.score - a.score)[0];

  if (!best) return {};
  return clean({
    purchasedFrom: best.name,
    usedVehicleSourceAddress: best.address?.address,
    usedVehicleSourceCity: best.address?.city,
    usedVehicleSourceState: best.address?.state,
    usedVehicleSourceZipCode: best.address?.zip,
  });
}

function extractCarMaxAcquisitionDetails(lines) {
  const fullText = lines.join(' ');
  if (!/\bCarMax\b/i.test(fullText)) return {};

  let name = fullText.match(/\bSeller\s*:\s*(CarMax\s*[-–]\s*[A-Za-z .'-]+)/i)?.[1]
    || fullText.match(/\b(CarMax\s*[-–]\s*[A-Za-z .'-]+)\s*,?\s*\(transferor'?s name\)/i)?.[1]
    || fullText.match(/\b(CarMax\s*[-–]\s*[A-Za-z .'-]+)/i)?.[1]
    || 'CarMax';
  name = name
    .replace(/\bPurchaser'?s?\s+Name\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:\s]+$/g, '')
    .trim();

  let address = null;
  const sellerIndex = lines.findIndex((line) => /\bSeller\s*:\s*CarMax\b/i.test(line));
  if (sellerIndex >= 0) {
    address = findAddressNear(lines, sellerIndex, 1, 5);
  }

  if (!address?.address) {
    if (/Westborough/i.test(name)) {
      address = {
        address: '170 Turnpike Rd',
        city: 'Westborough',
        state: 'MA',
        zip: '01581-2806'
      };
    }
  }

  if (address?.address && /Westborough/i.test(name) && (!address.zip || /^\d{5}$/.test(address.zip))) {
    address.zip = '01581-2806';
  }

  if (!address?.address) {
    const addressMatch = fullText.match(/\b(\d{1,6}\s+[^,]{3,80}?\b(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Drive|Dr|Tpke|Turnpike|Pkwy|Parkway|Way|Ln|Lane))\s+([A-Za-z .'-]+),?\s+(MA|CT|RI|NH|NY|NJ)\s+(\d{5}(?:-\d{4})?)/i);
    if (addressMatch) {
      address = {
        address: addressMatch[1].trim(),
        city: addressMatch[2].trim(),
        state: addressMatch[3].toUpperCase(),
        zip: addressMatch[4]
      };
    }
  }

  return clean({
    purchasedFrom: name,
    usedVehicleSourceAddress: address?.address,
    usedVehicleSourceCity: address?.city,
    usedVehicleSourceState: address?.state,
    usedVehicleSourceZipCode: address?.zip,
  });
}

function extractCmaaAcquisitionDetails(lines) {
  const fullText = lines.join(' ');
  if (!/\b(CMAA|Central Mass\.? Auto Auction)\b/i.test(fullText)) return {};

  const addressMatch = fullText.match(/\b(12\s+Industrial\s+Park\s+East)\s*[-»]?\s*(Oxford),?\s*(MA)\s+(\d{5})/i);
  return clean({
    purchasedFrom: 'Central Mass. Auto Auction',
    usedVehicleSourceAddress: addressMatch?.[1] || '12 Industrial Park East',
    usedVehicleSourceCity: addressMatch?.[2] || 'Oxford',
    usedVehicleSourceState: addressMatch?.[3] || 'MA',
    usedVehicleSourceZipCode: addressMatch?.[4] || '01540',
  });
}

function extractKnownAuctionAcquisitionDetails(lines) {
  const fullText = lines.join(' ');
  if (/\bManheim\b/i.test(fullText) && (/\bMANHEIM\s+NEW\b/i.test(fullText) || /\b123\s+WILLIAMS\s+ST\b/i.test(fullText))) {
    return clean({
      purchasedFrom: 'Manheim New England',
      usedVehicleSourceAddress: '123 Williams St',
      usedVehicleSourceCity: 'North Dighton',
      usedVehicleSourceState: 'MA',
      usedVehicleSourceZipCode: '02764',
    });
  }

  const knownAuctions = [
    {
      pattern: /\bADESA\s+Boston\b/i,
      name: 'ADESA Boston',
      address: '63 Western Avenue',
      city: 'Framingham',
      state: 'MA',
      zip: '01702'
    },
    {
      pattern: /\bADESA\s+Concord\b/i,
      name: 'ADESA Concord',
      address: '77 Hosmer Street',
      city: 'Acton',
      state: 'MA',
      zip: '01720-0257'
    },
    {
      pattern: /\bAmerica'?s\s+(?:AA|Auto Auction)\b/i,
      name: "America's AA Boston",
      address: '400 Charter Way',
      city: 'North Billerica',
      state: 'MA',
      zip: '01862'
    },
    {
      pattern: /\bManheim\s+New\s+England\b/i,
      name: 'Manheim New England',
      address: '123 Williams St',
      city: 'North Dighton',
      state: 'MA',
      zip: '02764'
    }
  ];

  const known = knownAuctions.find((auction) => auction.pattern.test(fullText));
  if (known) {
    return clean({
      purchasedFrom: known.name,
      usedVehicleSourceAddress: known.address,
      usedVehicleSourceCity: known.city,
      usedVehicleSourceState: known.state,
      usedVehicleSourceZipCode: known.zip,
    });
  }

  const transactionLocation = fullText.match(/\b(?:Transaction Location|Auction Location|Facility|Remit Payment To)\s*[:#-]?\s*([A-Za-z0-9 .&'/-]*\b(?:ADESA|Manheim|Auction)\b[A-Za-z0-9 .&'/-]*)/i)?.[1];
  const name = cleanRoleName(transactionLocation);
  if (!name || !AUCTION_NAME_PATTERN.test(name)) return {};

  const labelIndex = lines.findIndex((line) => /\b(Transaction Location|Auction Location|Facility|Remit Payment To)\b/i.test(line));
  const address = labelIndex >= 0 ? findAddressNear(lines, labelIndex, 1, 5) : null;
  return clean({
    purchasedFrom: name,
    usedVehicleSourceAddress: address?.address,
    usedVehicleSourceCity: address?.city,
    usedVehicleSourceState: address?.state,
    usedVehicleSourceZipCode: address?.zip,
  });
}

export function extractDispositionDetailsFromText(text) {
  const lines = normalizeDocumentLines(text);
  if (!lines.length) return {};

  const maTitleDisposition = extractMaTitleDispositionDetails(lines);
  if (Object.keys(maTitleDisposition).length) return maTitleDisposition;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!hasDispositionLabel(line)) continue;

    const isBuyerLine = /\b(?:Buyer|Purchaser|Customer|Transferred To|Print Name\(s\)|Purchaser\(s\)? Name\(s\))\b/i.test(line);
    if (isBoilerplateDispositionLine(line)) continue;
    if (isBroadwayValue(line) && !isBuyerLine) continue;

    const name = findNameNear(
      lines,
      i,
      /(?:Print Name\(s\) of Purchaser\(s\)|Purchaser\(s\)? Name\(s\) and Address(?:\(es\)|es)?|Purchaser\(s\)? Name\(s\)|Buyer Name|Buyer|Sold To|Customer|Transferred To)\s*[:#-]?\s*(.+?)(?=\s+Address\b|\s+City\b|\s+State\b|\s+Zip\b|\s+Date\b|$)/i
    );
    const address = findAddressNear(lines, i, 1, 8);

    if (name || address?.address) {
      return clean({
        disposedTo: name,
        disposedAddress: address?.address,
        disposedCity: address?.city,
        disposedState: address?.state,
        disposedZip: address?.zip,
      });
    }
  }

  return {};
}

function hasDispositionLabel(line) {
  return /(?:^|\s)(Print Name\(s\) of Purchaser\(s\)|Purchaser\(s\)? Name\(s\)(?:\s+and\s+Address(?:\(es\)|es)?)?|Buyer Name|Buyer|Sold To|Customer|Transferred To)\s*[:#-]?/i.test(line);
}

function extractMaTitleDispositionDetails(lines) {
  const fullText = lines.join(' ');
  if (!/\bPrint Name\(s\) of Purchaser\(s\)/i.test(fullText)) return {};

  const labelIndex = lines.findIndex((line) => /\bPrint Name\(s\) of Purchaser\(s\)/i.test(line));
    let name = cleanDispositionName(
      fullText.match(/\bPrint Name\(s\) of Purchaser\(s\)\s+(?:[A-Z]{2}\s+)?(?:State\s+)?(?:DL\s+Number\s+)?(.+?)\s+Address\s+City\s+State\s+Z(?:ip|p)\s+Code/i)?.[1]
    );
  if (!name && labelIndex >= 0) {
    name = cleanDispositionName(lines[labelIndex + 1]);
  }

  const streetSuffix = '(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Turnpike|Tpke|Parkway|Pkwy|Way|Lane|Ln|Terrace|Ter|Court|Ct|Circle|Cir|Place|Pl)';
  const addressPattern = new RegExp(`\\bAddress\\s+City\\s+State\\s+Z(?:ip|p)\\s+Code\\s+(\\d{1,6}\\s+.+?\\b${streetSuffix}\\b)\\s+([A-Za-z .'-]+?)\\s+([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)`, 'i');
  const nearbyAddressPattern = new RegExp(`\\b(\\d{1,6}\\s+.+?\\b${streetSuffix}\\b)\\s+([A-Za-z .'-]+?)\\s+([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)`, 'i');
  const addressMatch = fullText.match(addressPattern)
    || (labelIndex >= 0 ? lines.slice(labelIndex + 1, labelIndex + 6).join(' ').match(nearbyAddressPattern) : null);
  let address = addressMatch?.[1]?.trim() || null;
  let city = addressMatch?.[2]?.trim() || null;
  let state = addressMatch?.[3]?.toUpperCase() || null;
  let zip = addressMatch?.[4] || null;

  if ((!address || !city || /\d/.test(city)) && labelIndex >= 0) {
    const addressLine = lines.slice(labelIndex + 1, labelIndex + 8)
      .find((line) => /^\d{1,6}\s+/.test(line) && /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/i.test(line));
    const flexible = addressLine?.match(new RegExp(`^(\\d{1,6}\\s+.+?\\b${streetSuffix}\\b(?:\\s+(?:Apt|Apartment|Unit|#|No\\.?|Suite|Ste)\\s*[A-Za-z0-9-]+)?)\\s+([A-Za-z .'-]+?)\\s+([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)\\b`, 'i'));
    if (flexible) {
      address = flexible[1].trim();
      city = flexible[2].trim();
      state = flexible[3].toUpperCase();
      zip = flexible[4];
    }
  }

  if (!name && !address) return {};
  return {
    disposedTo: cleanDispositionName(name),
    disposedAddress: address,
    disposedCity: city,
    disposedState: state,
    disposedZip: zip,
  };
}

function extractFallbackInfo(text, purpose) {
  if (!text) return null;
  const fallback = {};
  const vin = extractVinFromText(text);
  if (vin) fallback.vin = vin;
  const titleNumber = extractTitleFromText(text);
  if (titleNumber) fallback.titleNumber = titleNumber;

  // Try parsing make, model, and year from text using regex heuristics
  const heuristic = parseMakeModelYearFromText(text);
  if (heuristic) {
    if (heuristic.make) fallback.make = heuristic.make;
    if (heuristic.model) fallback.model = heuristic.model;
    if (heuristic.year) fallback.year = heuristic.year;
  }

  const inferredPurpose = normalizeExtractionPurpose(purpose) || inferDocumentDirection(text, purpose);
  const totalValue = extractTotalFromText(text, inferredPurpose);
  if (totalValue) {
    // Only include totals discovered by fallback if they pass basic sanity checks
    if (isReasonableTotal(totalValue)) {
      if (inferredPurpose === 'sale') {
        fallback.disposedPrice = totalValue;
      } else {
        fallback.purchasePrice = totalValue;
      }
    } else {
      console.log(`[Parser:PostProcess] extractFallbackInfo skipped unreasonable total: ${totalValue}`);
    }
  }
  if (inferredPurpose === 'acquisition') {
    const acquisitionDetails = extractAcquisitionDetailsFromText(text);
    for (const [key, value] of Object.entries(acquisitionDetails)) {
      if (value !== undefined && value !== null && value !== '') {
        fallback[key] = value;
      }
    }
  } else if (inferredPurpose === 'sale') {
    const dispositionDetails = extractDispositionDetailsFromText(text);
    for (const [key, value] of Object.entries(dispositionDetails)) {
      if (value !== undefined && value !== null && value !== '') {
        fallback[key] = value;
      }
    }
  }
  return Object.keys(fallback).length ? fallback : null;
}

export function extractVehicleInfoFromText(text) {
  if (!text) return {};

  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const data = {
    vin: null,
    year: null,
    make: null,
    model: null,
    color: null,
    titleNumber: null,
    mileage: null,
    purchasePrice: null,
    disposedPrice: null,
    purchasedFrom: null,
    usedVehicleSourceAddress: null,
    usedVehicleSourceCity: null,
    usedVehicleSourceState: null,
    usedVehicleSourceZipCode: null,
    disposedTo: null,
    disposedAddress: null,
    disposedCity: null,
    disposedState: null,
    disposedZip: null,
    disposedOdometer: null,
  };
  let currentSection = 'source';

  const readValue = (line, regex) => {
    const match = line.match(regex);
    return match ? match[1].trim() : '';
  };

  const parseFieldPairs = (line) => {
    const pairs = {};
    const labelRegex = /\b(Mfrs\.?\s*Model\s*Year|Year|Make|Model|Color|Vehicle\s+Identification\s+Number|Vehicle\s+Ident(?:ification)?(?:\.|\s)*No\.?)\b\s*[:\-]?\s*([^\r\n]+?)(?=(?:\s+\b(?:Mfrs\.?\s*Model\s*Year|Year|Make|Model|Color|Vehicle\s+Identification\s+Number|Vehicle\s+Ident(?:ification)?(?:\.|\s)*No\.?)\b\s*[:\-]?)|$)/gi;
    let match;
    while ((match = labelRegex.exec(line)) !== null) {
      const label = match[1].replace(/\s+/g, ' ').toLowerCase();
      const val = match[2].trim().replace(/\s+/g, ' ');
      if (/^(year|make|model|color|vin|mfrs\.?\s*model\s*year|vehicle\s+identification\s+number|vehicle\s+ident(?:ification)?(?:\.|\s)*No\.?)$/i.test(val)) {
        continue;
      }
      pairs[label] = val;
    }
    return pairs;
  };

  const parseCurrencyValue = (value) => {
    if (!value) return null;
    const sanitized = String(value).replace(/[^0-9.]/g, '');
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const addAddress = (line) => {
    const value = readValue(line, /Address(?: \(number and street\))?[:\s]+(.+?)(?=\s+City\b|$)/i);
    if (!value) return;
    if (currentSection === 'disposed') {
      data.disposedAddress = value;
    } else {
      data.usedVehicleSourceAddress = value;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\b(Obtained From|Seller Name|Seller)\b/i.test(line)) {
      currentSection = 'source';
      let sourceVal = readValue(line, /(?:Obtained From|Seller Name|Seller)(?: \(Source\))?[:\s]+(.+?)(?=\s+Transaction Date:|\s+Address:|$)/i);
      if (!sourceVal && i + 1 < lines.length) {
        const candidate = lines[i + 1].trim();
        if (candidate && !/\b(Address|City|State|Zip|VIN|Year|Make|Model|Odometer|Date|Price|Phone|Tel|Buyer|Seller|Dealer)\b/i.test(candidate)) {
          sourceVal = candidate;
        }
      }
      if (sourceVal) {
        data.purchasedFrom = sourceVal;
      }
    }

    if (/\b(Transferred To|Buyer Name|Purchaser\(s\)? Name\(s\)|Sold To|Purchaser|Customer Name|Buyer)\b/i.test(line)) {
      currentSection = 'disposed';
      let nameVal = readValue(line, /(?:Transferred To|Buyer Name|Purchaser\(s\)? Name\(s\)|Sold To|Purchaser|Customer Name|Buyer)[:\s]+(.+?)(?=\s+Transaction Date:|\s+Address:|$)/i);
      if (!nameVal && i + 1 < lines.length) {
        const candidate = lines[i + 1].trim();
        if (candidate && !/\b(Address|City|State|Zip|VIN|Year|Make|Model|Odometer|Date|Price|Phone|Tel|Buyer|Seller|Dealer)\b/i.test(candidate)) {
          nameVal = candidate;
        }
      }
      if (nameVal) {
        data.disposedTo = nameVal;
      }
    }

    if (/\bAddress\b/i.test(line)) {
      addAddress(line);
    }

    if (/\bCity(?: or Town)?[:\s]/i.test(line)) {
      const value = readValue(line, /^City(?: or Town)?[:\s]+(.+?)(?:\s+State:|\s+Zip|$)/i);
      if (currentSection === 'disposed') {
        data.disposedCity = value || data.disposedCity;
      } else {
        data.usedVehicleSourceCity = value || data.usedVehicleSourceCity;
      }
    }

    if (/\bState[:\s]/i.test(line)) {
      const value = readValue(line, /State[:\s]+([A-Z]{2})/i);
      if (currentSection === 'disposed') {
        data.disposedState = value || data.disposedState;
      } else {
        data.usedVehicleSourceState = value || data.usedVehicleSourceState;
      }
    }

    if (/\bZip\b/i.test(line)) {
      const value = readValue(line, /Zip(?: Code)?:[:\s]+(\d{5}(?:-\d{4})?)/i);
      if (currentSection === 'disposed') {
        data.disposedZip = value || data.disposedZip;
      } else {
        data.usedVehicleSourceZipCode = value || data.usedVehicleSourceZipCode;
      }
    }

    if (/\bOdometer(?: In| Out| Reading)?\b/i.test(line)) {
      const value = readValue(line, /Odometer(?: In| Out| Reading)?[:\s]+([\d,]+)/i);
      const num = value ? Number(value.replace(/,/g, '')) : null;
      if (Number.isFinite(num)) {
        if (/\bOdometer\s+Out\b/i.test(line)) {
          data.disposedOdometer = num;
        } else {
          data.mileage = num;
        }
      }
      continue;
    }

    const fieldPairs = parseFieldPairs(line);
    if (fieldPairs['mfrs. model year'] && !data.year) {
      const value = fieldPairs['mfrs. model year'].match(/(19|20)\d{2}/);
      if (value) data.year = Number(value[0]);
    }

    if (/\bYear\b/i.test(line) && !data.year) {
      const value = readValue(line, /Year[:\s]+((?:19|20)\d{2})/i);
      if (value) data.year = Number(value);
    }

    if (fieldPairs['make'] && !data.make) {
      data.make = fieldPairs['make'];
    } else if (/\bMake\b/i.test(line) && !data.make) {
      data.make = readValue(line, /Make[:\s]+([A-Za-z0-9 &\-/]+?)(?=\s+Model|\s+Color|\s+Year|$)/i) || data.make;
    }

    if (fieldPairs['model'] && !data.model) {
      data.model = fieldPairs['model'];
    } else if (/\bModel(?!\s+Year)\b/i.test(line) && !data.model) {
      data.model = readValue(line, /Model(?!\s+Year)[:\s]+([A-Za-z0-9 &\-/]+?)(?=\s+Color|\s+Year|\s+Title|\s+Vehicle|\s+Stock|\s+Address|\s+City|\s+State|\s+Zip|\s+Odometer|\s+Transaction Date|$)/i) || data.model;
    }

    if (fieldPairs['color'] && !data.color) {
      data.color = fieldPairs['color'];
    } else if (/\bColor\b/i.test(line) && !data.color) {
      data.color = readValue(line, /Color[:\s]+([A-Za-z0-9 &\-/]+)/i) || data.color;
    }

    if (/\bTitle\b/i.test(line) && !data.titleNumber) {
      data.titleNumber = normalizeTitleNumber(
        readValue(line, /Title\s*(?:No\.?|Number|#|State\/Number)?[:\s]*([A-Z0-9\-/]+)/i)
      ) || data.titleNumber;
    }

    if (!data.disposedPrice) {
      const priceMatch = line.match(/(?:Sale Price|Vehicle Sales Price|Sale Amount|Sold Price|Vehicle Sales Amount)\s*[:\-\s]*\$?([\d,]+(?:\.\d{1,2})?)/i);
      if (priceMatch) {
        data.disposedPrice = parseCurrencyValue(priceMatch[1]);
      }
    }
    if (!data.purchasePrice) {
      const purchaseMatch = line.match(/(?:Purchase Price|Total Due|Amount Due|Balance Due|Amount Payable|Net Amount|Invoice Total|Bill Total|Total Amount)\s*[:\-\s]*\$?([\d,]+(?:\.\d{1,2})?)/i);
      if (purchaseMatch) {
        data.purchasePrice = parseCurrencyValue(purchaseMatch[1]);
      }
    }

    const vinLabelMatch = line.match(/\b(?:Vehicle\s+Ident(?:ification)?(?:\.|\s)*No\.?|Vehicle\s+Identification\s+Number|VIN)\b/i);
    if (!data.vin && vinLabelMatch) {
      const afterLabel = line.slice(vinLabelMatch.index + vinLabelMatch[0].length);
      const condensed = afterLabel.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const candidates = condensed.match(/[A-Z0-9]{17}/g) || [];
      let fallbackVin = null;
      for (const candidate of candidates) {
        const normalized = candidate.replace(/[IOQ]/g, (char) => (char === 'I' ? '1' : '0'));
        if (isValidVin(normalized)) {
          data.vin = normalized;
          break;
        }
        fallbackVin = fallbackVin || normalized;
      }
      if (!data.vin && fallbackVin) {
        data.vin = fallbackVin;
      }
    }
  }

  const junkRegex = /^(year|make|model|color|vin|mfrs\.?\s*model\s*year|vehicle\s+identification\s+number|vehicle\s+ident(?:ification)?(?:\.|\s)*No\.?)$/i;
  if (data.make && junkRegex.test(data.make)) data.make = null;
  if (data.model && junkRegex.test(data.model)) data.model = null;
  if (data.color && junkRegex.test(data.color)) data.color = null;

  const findVinCandidate = (source) => {
    const normalized = String(source).toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (let i = 0; i + 17 <= normalized.length; i++) {
      let candidate = normalized.slice(i, i + 17);
      if (!/^[A-Z0-9]{17}$/.test(candidate)) continue;
      const transformed = candidate.replace(/[IOQ]/g, (char) => (char === 'I' ? '1' : '0'));
      if (isValidVin(transformed)) return transformed;
    }
    return null;
  };

  if (!data.vin) {
    const fallbackVin = findVinCandidate(text);
    if (fallbackVin) data.vin = fallbackVin;
  }

  if ((!data.year || !data.make || !data.model) && text) {
    const heuristic = parseMakeModelYearFromText(text);
    if (heuristic) {
      data.year = data.year || heuristic.year;
      data.make = data.make || heuristic.make;
      data.model = data.model || heuristic.model;
    }
  }

  const inferredDirection = inferDocumentDirection(text, '');
  const totalValue = extractTotalFromText(text, inferredDirection);
  const hasDispositionSignal = data.disposedTo || data.disposedAddress || /\b(?:Buyer|Purchaser(?:\(s\))?|Sold To|Transferred To|Purchaser\(s\)? Name\(s\)?|Buyer Name)\b/i.test(text);
  const hasAcquisitionSignal = /\b(?:Obtained From|Auction|Facility|Remit Payment To|Purchase Price|Buyer Fee|Total Due|Balance Due|Invoice to Buyer|Consignor)\b/i.test(text);
  if (isReasonableTotal(totalValue)) {
    if (inferredDirection === 'sale' && !data.disposedPrice) {
      data.disposedPrice = totalValue;
    } else if ((inferredDirection === 'acquisition' || hasAcquisitionSignal || !hasDispositionSignal) && !data.purchasePrice) {
      data.purchasePrice = totalValue;
    } else if (hasDispositionSignal && !data.disposedPrice) {
      data.disposedPrice = totalValue;
    }
  }

  const result = clean({
    vin: data.vin,
    year: data.year,
    make: data.make,
    model: data.model,
    color: data.color,
    titleNumber: data.titleNumber,
    mileage: data.mileage,
    purchasePrice: data.purchasePrice,
    disposedPrice: data.disposedPrice,
    purchasedFrom: data.purchasedFrom,
    usedVehicleSourceAddress: data.usedVehicleSourceAddress,
    usedVehicleSourceCity: data.usedVehicleSourceCity,
    usedVehicleSourceState: data.usedVehicleSourceState,
    usedVehicleSourceZipCode: data.usedVehicleSourceZipCode,
    disposedTo: data.disposedTo,
    disposedAddress: data.disposedAddress,
    disposedCity: data.disposedCity,
    disposedState: data.disposedState,
    disposedZip: data.disposedZip,
    disposedOdometer: data.disposedOdometer,
  });

  if (!result.usedVehicleSourceAddress && data.usedVehicleSourceAddress) {
    result.usedVehicleSourceAddress = data.usedVehicleSourceAddress.trim();
  }
  if (!result.usedVehicleSourceCity && data.usedVehicleSourceCity) {
    result.usedVehicleSourceCity = data.usedVehicleSourceCity.trim();
  }
  if (!result.usedVehicleSourceState && data.usedVehicleSourceState) {
    result.usedVehicleSourceState = data.usedVehicleSourceState.trim();
  }
  if (!result.usedVehicleSourceZipCode && data.usedVehicleSourceZipCode) {
    result.usedVehicleSourceZipCode = data.usedVehicleSourceZipCode.trim();
  }
  if (!result.disposedAddress && data.disposedAddress) {
    result.disposedAddress = data.disposedAddress.trim();
  }
  if (!result.disposedCity && data.disposedCity) {
    result.disposedCity = data.disposedCity.trim();
  }
  if (!result.disposedState && data.disposedState) {
    result.disposedState = data.disposedState.trim();
  }
  if (!result.disposedZip && data.disposedZip) {
    result.disposedZip = data.disposedZip.trim();
  }

  return result;
}

function isExtractionComplete(result) {
  if (!result) return false;
  // If we have a standard 17-character VIN that passes standard check digit validation, it's 100% complete!
  if (result.vin && isValidVin(result.vin)) return true;
  // If we have a VIN of at least 8 characters AND we have make, model, year, we have all key inventory details!
  if (result.vin && result.vin.length >= 8 && result.make && result.model && result.year) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════════
// SINGLE ENTRY POINT — Extract everything from any document
// purpose: "acquisition" | "sale" | "" (unknown)
// ═══════════════════════════════════════════════════════════════
export async function extractVehicleInfo(fileBuffer, mimetype, purpose = "") {
  purpose = normalizeExtractionPurpose(purpose);
  console.log(`[Parser] START | mime=${mimetype} | purpose=${purpose || 'auto'} | llm=${hasLlmKey} | mode=${useOpenAI ? 'openai' : 'nvidia'}`);

  const effectivePurpose = purpose || '';

  // 1. For images
  if (mimetype.startsWith('image/')) {
    try {
      console.log('[Parser] Image uploaded. Directly querying OpenAI Vision AI for ultra-fast and precise extraction...');
      const visionResult = await visionExtract(fileBuffer, mimetype, effectivePurpose);
      if (visionResult && (visionResult.vin || visionResult.make || visionResult.disposedTo)) {
        return postProcessResult(visionResult, '', effectivePurpose);
      }
    } catch (err) {
      console.error(`[Parser:Vision] OpenAI Vision extraction failed: ${err.message}`);
    }

    // Fallback: run local OCR, then regex heuristics.
    console.log('[Parser] Vision LLM failed. Running OCR fallback for image extraction...');
    try {
      const fallbackText = await ocrImage(fileBuffer);
      const fallback = extractFallbackInfo(fallbackText, effectivePurpose);
      if (fallback) return fallback;
    } catch (ocrErr) {
      console.warn(`[Parser] Image OCR fallback failed: ${ocrErr?.message || ocrErr}`);
    }

    return extractFallbackInfo('', effectivePurpose);
  }

  // 2. For PDFs
  if (isPdfMimeType(mimetype) || isPdfBuffer(fileBuffer)) {
    let pages = [];
    let combinedText = '';
    try {
      const extracted = await extractPdfTextPages(fileBuffer);
      pages = extracted.pages;
      combinedText = extracted.combinedText;
    } catch (err) {
      console.warn(`[Parser] PDF text extraction failed: ${err.message}`);
    }

    console.log(`[Parser] PDF native text: ${combinedText.length} chars`);
    const hasNativeText = combinedText.replace(/\s/g, '').length > 30;

    if (hasNativeText) {
      try {
        console.log('[Parser] Native PDF text found. Directly querying OpenAI Text LLM (gpt-4o-mini)...');
        const textResult = await textExtract(combinedText, effectivePurpose);
        if (textResult && (textResult.vin || textResult.make || textResult.disposedTo)) {
          if (!textResult.make || !textResult.model || !textResult.year) {
            const heuristic = parseMakeModelYearFromText(combinedText);
            if (heuristic) {
              textResult.make = textResult.make || heuristic.make;
              textResult.model = textResult.model || heuristic.model;
              textResult.year = textResult.year || heuristic.year;
            }
          }
          return postProcessResult(textResult, combinedText, effectivePurpose);
        }
      } catch (err) {
        console.error(`[Parser:Text] OpenAI Text extraction failed: ${err.message}`);
      }
    } else {
      // Scanned PDF — directly call OpenAI Vision LLM which can read scanned PDFs perfectly in 2 seconds!
      try {
        console.log('[Parser] Scanned PDF detected. Directly querying OpenAI Vision LLM (gpt-4o) on rendered page...');
        const visionResult = await visionExtract(fileBuffer, mimetype, effectivePurpose);
        if (visionResult && (visionResult.vin || visionResult.make || visionResult.disposedTo)) {
          return postProcessResult(visionResult, '', effectivePurpose);
        }
      } catch (err) {
        console.error(`[Parser:Vision] OpenAI Vision extraction on scanned PDF failed: ${err.message}`);
      }
    }

    // Fallback: fast regex heuristics
    return extractFallbackInfo(combinedText, effectivePurpose);
  }

  // Word docs and other text
  const text = await extractText(fileBuffer, mimetype);
  const wordPurpose = purpose || determineDocumentPurpose(text) || '';
  if (hasLlmKey && text.length > 30) {
    try {
      const textResult = await textExtract(text, wordPurpose);
      if (textResult) return postProcessResult(textResult, text, wordPurpose);
    } catch (err) {
      console.warn(`[Parser] Text LLM failed on Word/Other: ${err.message}`);
    }
  }

  const fallbackResult = extractFallbackInfo(text, wordPurpose);
  if (fallbackResult) {
    if ((!fallbackResult.make || !fallbackResult.model || !fallbackResult.year) && text) {
      const heuristic = parseMakeModelYearFromText(text);
      if (heuristic) {
        fallbackResult.make = fallbackResult.make || heuristic.make;
        fallbackResult.model = fallbackResult.model || heuristic.model;
        fallbackResult.year = fallbackResult.year || heuristic.year;
      }
    }
    return fallbackResult;
  }

  return {};
}

// ═══════════════════════════════════════════════════════════════
// PROMPT BUILDERS — Separate focused prompts for acquisition vs sale
// ═══════════════════════════════════════════════════════════════
// ─── Shared system prompt for ALL AI calls (text + vision) ───
const SYSTEM_PROMPT = `You are a UNIVERSAL vehicle document data extractor. You process ANY automotive document, including but not limited to:
- Auction Bills of Sale (ADESA, CMAA/Central Mass, Manheim, CarMax, America's AA)
- MA Title Transfer Forms ("FOR A MOTOR VEHICLE, MOBILE HOME...")
- Motor Vehicle Purchase Contracts (Carsforsale.com format)
- Dealer invoices and wholesale receipts
- Private party bills of sale
- Insurance documents, registration forms, and any other vehicle paperwork

Even if the document format is UNFAMILIAR, you MUST still extract every vehicle detail you can find. NEVER return an empty result if any vehicle data is visible.

Our dealership is "Broadway Used Auto Sales" (also "Broadway Used Auto Sales Inc", "Auto Sales On Broadway").
Dealership addresses: 2125 REVERE BEACH PKWY, EVERETT, MA 02149 or 100 BROADWAY, NORWOOD, MA 02062.

CRITICAL RULES:
1. ROLE DETECTION: If Broadway appears as BUYER → this is an ACQUISITION. If Broadway appears as SELLER/DEALER → this is a SALE.
2. ADDRESS FILTERING: NEVER return Broadway's own address as the source or disposed address. Return null instead.
3. BODY TYPE vs MODEL: "Body Type" (Sedan, SUV, Hatchback, Coupe) is NOT the model. "Model" is the vehicle name (Corolla, Camry, C250, E350, 328i, Wrangler). For luxury cars (Mercedes-Benz, BMW, Audi), the model is ALWAYS the alphanumeric code (e.g. C250). NEVER put "Sedan" or "SUV" in the model field.
4. TITLE NUMBER: This is CRITICAL. Extract if labeled "Certificate of Title", "Title No", "Title #", "Certificate No", or "Cert of Origin". It is usually an 8-10 digit alphanumeric code (e.g. BK182936).
5. PRICE (TOTAL ONLY): ALWAYS extract the ABSOLUTE TOTAL/BALANCE DUE (e.g. 7645.00). NEVER extract the "Sale Price" or "Selling Price" (e.g. 7200.00) if a larger TOTAL exists below it. Fees MUST be included.
6. You MUST return ONLY a valid JSON object wrapped in JSON_START and JSON_END markers. Do NOT write explanations, reasoning, or markdown.
Example:
JSON_START
{ "vin": "...", ... }
JSON_END
No markdown, no explanation outside markers.`;

function buildAcquisitionPrompt(textOrEmpty) {
  const docText = textOrEmpty ? `\n\nDocument text:\n${textOrEmpty}` : '';
  return `Extract data from this VEHICLE ACQUISITION document. Broadway is the BUYER.
  
CRITICAL ROLE AND SOURCE RULE:
- ALWAYS prioritize the AUCTION HOUSE/FACILITY name and address (e.g. "ADESA Concord", "ADESA Boston", "Manheim New England", "America's Auto Auction", "CarMax") as the "purchasedFrom" and source address details.
- DO NOT USE the consignor or individual seller listed in the "SELLER" or "CONSIGNOR" box (e.g. "RON BOUCHARD'S AUTO SALES INC") as the "purchasedFrom" or source address. 
- The auction house itself (usually shown at the top-left or in a big logo like "ADESA Concord", "Manheim") is the authoritative transaction partner. Set "purchasedFrom" to the auction name and use the auction's address (e.g. "77 Hosmer Street, Acton, MA 01720" for ADESA Concord).
- HEADER / TITLE CONFUSION WARNING: Even if the document has a giant bold header saying "Bill of Sale" at the top center (such as wholesale auction bills of sale from ADESA Concord or Manheim), if this is an Acquisition/Purchase document (Broadway is the BUYER), you MUST strictly parse the Auction details (purchasedFrom, purchasePrice, purchaseDate) and ignore any retail sales/disposition fields!

JSON_START
{
  "vin": "VIN (17 chars) or null",
  "make": "Manufacturer or null",
  "model": "Model name or null",
  "year": 2014,
  "color": "Color or null",
  "mileage": 131575,
  "titleNumber": "Number or null",
  "stockNumber": "Number or null",
  "purchasedFrom": "Seller or null",
  "purchasePrice": 7645,
  "purchaseDate": "YYYY-MM-DD or null",
  "usedVehicleSourceAddress": "Address or null",
  "usedVehicleSourceCity": "City or null",
  "usedVehicleSourceState": "XX or null",
  "usedVehicleSourceZipCode": "Zip or null",
  "allVisiblePrices": [7200.00, 7645.00, 445.00],
  "allVisibleOdometers": [131575]
}
JSON_END
IMPORTANT: If a value is missing or unclear, return null. NEVER return placeholder text like "exact 17-char VIN".

LABEL MAPPING:
- VIN: "VIN", "V.I.N. No.", "Vehicle Identification Number", "Serial #"
- Make/Model: "Make/Manufacturer" → make. "Model" → model. "Body Type" is NOT model.
- Mileage: "Odometer", "Miles", "Reading", "OVER 100,000", "EXEMPT" (means check title)
- ODOMETER VS PRICE RULE: The Odometer is a mileage reading (usually a large number, e.g. 131575). NEVER extract or copy the vehicle's selling/total price as the odometer reading, or vice versa!
- Price: "TOTAL", "Balance Due", "Total Amount", "Amount Paid". YOU MUST SCROLL TO THE BOTTOM. The price MUST be the final balance due (selling price + fees). Ignore subtotals.
- SELLING PRICE vs TOTAL PRICE: "Selling Price" or "Hammer Price" is the base car cost before fees. "Total Price" or "Balance Due" includes buyer fees and all transaction costs. ALWAYS set "purchasePrice" to the final total.
- Source (Obtained From): ALWAYS prioritize the AUCTION/FACILITY name and address (e.g. ADESA, Manheim, CarMax, Central Mass Auto Auction) as the "purchasedFrom" and source address. Even if a separate "SELLER" or "CONSIGNOR" is listed, we want the FACILITY details.
- Stock: "Stock #", "Lot #", "Unit ID", "Stock Number", "Inventory #"
- Title: "Title #", "Title State/Number", "Certificate #", "Cert of Origin" — return just the number

HELPER ARRAYS:
- "allVisiblePrices": You MUST list all numeric dollar values related to pricing, fees, sales, or totals visible on the page.
- "allVisibleOdometers": You MUST list all numeric odometer/mileage values visible on the page.

DOCUMENT-SPECIFIC:
- Used Vehicle Record (UVR) Double-Sided Forms: If the document is a "Used Vehicle Record" containing both "Acquisition" and "Disposition" sections, since this is an ACQUISITION purpose, you MUST extract the details from the "Acquisition of Motor Vehicle/Part" section (Obtained From / Source name, street address, city, state, zip, date, and odometer) and ignore the "Disposition" section.
- AMERICA'S AA (America's Auto Auction): Use "AMERICA'S AA BOSTON" and the North Billerica, MA address as the source. The TOTAL is at the absolute bottom of the price table on the right ($4,765.00 in the example). Title # is in the small box on the right (e.g. BJ713930).
- ADESA: Use the AUCTION FACILITY name and address (usually at the top or labeled "FACILITY") as the source, not the individual seller (e.g. "ADESA Concord", "77 Hosmer Street, Acton, MA 01720").
- CMAA: The price MUST be the one beside "TOTAL" or "TOTAL DUE", not "SALE PRICE". The Total is usually at the bottom-right of the table and includes buyer fees. Ignore the "Selling Price" column.
- CarMax: SELLER address is at the ABSOLUTE BOTTOM-RIGHT (e.g. "170 Turnpike Rd"). Broadway's address is in the middle table — IGNORE the middle table for address extraction. The price MUST be the "TOTAL" at the bottom of the table, not "Selling Price".
- Manheim: Use the "TRANSACTION LOCATION" or "REMIT PAYMENT TO" as the auction name and source address. Strip " US" from addresses.

NEVER use Broadway's address (100 BROADWAY / 2125 REVERE BEACH PKWY / NORWOOD, MA 02062) as the source address. If you see "BROADWAY USED AUTO SALES" in a table, the address beside it is the BUYER, not the seller.${docText}`;
}

function buildSalePrompt(textOrEmpty) {
  const docText = textOrEmpty ? `\n\nDocument text:\n${textOrEmpty}` : '';
  return `Extract data from this VEHICLE SALE document. Broadway is the SELLER.

CRITICAL ROLE AND CUSTOMER RULE:
- STRICTLY extract details of the retail customer (disposedTo, disposedAddress, etc.) purchasing the car from Broadway.
- IF Broadway is the BUYER or if the document represents a purchase from an auction house (like ADESA, Manheim, Copart), you MUST return null or 0 for all sales/disposition fields (disposedTo, disposedAddress, disposedPrice, disposedDate). Do NOT extract the auction name or purchase price as sales fields. This is an acquisition document, NOT a sale document!
- STRICTLY return null or 0 if a field is not explicitly visible in the document. NEVER guess, speculate, or extract dealer names as retail customers.

JSON_START
{
  "vin": "exact 17-char VIN",
  "make": "manufacturer (Toyota, Ford, Honda, etc.)",
  "model": "model name ONLY (Corolla, Camry, Pilot) — NOT body type",
  "year": 2014,
  "color": "color",
  "titleNumber": null,
  "stockNumber": "stock number",
  "disposedTo": "PURCHASER/BUYER name",
  "disposedAddress": "PURCHASER street address",
  "disposedCity": "PURCHASER city",
  "disposedState": "XX (2-letter code)",
  "disposedZip": "PURCHASER zip code",
  "disposedDate": "YYYY-MM-DD",
  "disposedPrice": 7751,
  "disposedOdometer": 119629,
  "disposedDlNumber": "driver license number",
  "disposedDlState": "XX",
  "allVisiblePrices": [7200.00, 7751.00, 551.00],
  "allVisibleOdometers": [119629]
}
JSON_END

LABEL MAPPING:
- VIN: "VIN", "Vehicle/Vessel Identification Number", "Vessel ID"
- Make/Model: "Make/Manufacturer" → make. "Model" → model. "Body Type" (Sedan/SUV/Hatchback) is NOT model.
- Purchaser: Extract ONLY the pure first and last name of the buyer (e.g. "John Doe"). Do NOT include state abbreviations (e.g. "MA"), titles, extra labels (e.g. "Press", "State"), or numbers.
- Address: "Address" row under purchaser. City/State/Zip in labeled columns.
- Price: Extract ONLY the final total price (such as "Total Price", "Total Due", "Total Amount", "Balance Due"). Do NOT extract the raw sale price, selling price, or subtotal if a larger final total is present in the document.
- SELLING PRICE vs TOTAL PRICE: "Selling Price" is the base car price. "Total Due" or "Balance" includes taxes/fees. ALWAYS extract the final larger total!
- Date: "Date of Sale", "Transaction Date", "Date"
- Odometer: "Odometer", "Miles", "Mileage", "Reading"
- ODOMETER VS PRICE RULE: Odometer is a vehicle mileage reading. NEVER extract the vehicle's selling price or total price as the odometer reading, or vice versa!
- DL: "DL Number", "DL State", "Driver License"
- Title: "Certificate of Title Number", "Title #" — return just the alphanumeric code

HELPER ARRAYS:
- "allVisiblePrices": You MUST list all numeric dollar values related to pricing, fees, sales, or totals visible on the page.
- "allVisibleOdometers": You MUST list all numeric odometer/mileage values visible on the page.

MA TITLE TRANSFER FORM SPECIFIC:
- Layout: Year | Make/Manufacturer | Body Type | Model | Color
- "Body Type" column contains Sedan/SUV/Hatchback — do NOT put this in model field.
- "Selling Price" is often next to a "Salesperson" ID number (e.g. "6/17/2025 9121" where 9121 is the price). Ensure you don't confuse the Salesperson ID with the Price.
- Address may lack state code — infer MA if zip starts with 01xxx or 02xxx.
- "Selling Price" is a bare number without $ sign.

DOCUMENT-SPECIFIC guidelines:
- Used Vehicle Record (UVR) Double-Sided Forms: If the document is a "Used Vehicle Record" containing both "Acquisition" and "Disposition" sections, since this is a SALE purpose, you MUST extract the details from the "Disposition of Motor Vehicle/Part" section (Transferred To purchaser name, street address, city, state, zip, date, and odometer) and ignore the "Acquisition" section.
- PURCHASE CONTRACT SPECIFIC: "Dealer/Seller Name and Address" is Broadway (ignore this address). "Purchaser(s) Name(s) and Address(es)" is the BUYER (e.g. Joshua Hernandez). Stock No. is the stockNumber.
- Price: "Total Contract Price" or "Total Balance Due" is the disposedPrice. Ensure you extract the final total price (including all fees), not just the raw "Vehicle Sales Price" subtotal!
- NEVER use Broadway's address as the purchaser's address.${docText}`;
}

function buildAutoPrompt(textOrEmpty) {
  const docText = textOrEmpty ? `\n\nDocument text:\n${textOrEmpty}` : '';
  return `Extract ALL vehicle information from this document. This could be ANY type of vehicle document.
Determine direction: If Broadway is BUYER → ACQUISITION. If Broadway is SELLER → SALE. If unclear, treat as ACQUISITION.

You MUST return a JSON object. Do NOT explain. Do NOT write markdown.

JSON_START
{
  "vin": "VIN (17 chars) or null",
  "make": "Manufacturer or null",
  "model": "Model name (NOT body type) or null",
  "year": 2014,
  "color": "Color or null",
  "mileage": 131575,
  "titleNumber": "Title number or null",
  "stockNumber": "Stock number or null",
  "purchasedFrom": "Seller/Auction name or null",
  "purchasePrice": 6340,
  "purchaseDate": "YYYY-MM-DD or null",
  "usedVehicleSourceAddress": "Seller/Auction street address or null",
  "usedVehicleSourceCity": "City or null",
  "usedVehicleSourceState": "XX or null",
  "usedVehicleSourceZipCode": "Zip or null",
  "disposedTo": "Buyer name if sale or null",
  "disposedAddress": "Buyer street if sale or null",
  "disposedCity": "City or null",
  "disposedState": "XX or null",
  "disposedZip": "Zip or null",
  "disposedDate": "YYYY-MM-DD or null",
  "disposedPrice": 0,
  "disposedOdometer": 0,
  "disposedDlNumber": "Driver license or null",
  "disposedDlState": "XX or null",
  "allVisiblePrices": [6340.00, 7100.00],
  "allVisibleOdometers": [131575]
}
JSON_END
IMPORTANT: If a value is missing or unclear, return null. NEVER return placeholder text.

LABEL MAPPING:
- VIN: "VIN", "V.I.N.", "Vehicle Identification Number", "Serial #"
- Make/Model: "Make" → make. "Model" → model. "Body Type" (Sedan/SUV) is NOT model.
- Mileage: "Odometer", "Miles", "Reading", "OVER 100,000"
- Price: Extract ONLY the final total price (such as "TOTAL", "Total Due", "Total Amount", "Balance Due", "Total Contract Price"). Do NOT extract the raw sale price, selling price, or subtotal if a larger final total is present in the document.
- SELLING PRICE vs TOTAL PRICE: "Selling Price" or "Hammer Price" is the base car cost before fees. "Total Price" or "Balance Due" includes buyer fees and all transaction costs. ALWAYS extract the final larger total!
- Odomoter/Mileage: "Odometer", "Miles", "Mileage", "Reading"
- ODOMETER VS PRICE RULE: Odometer is a vehicle mileage reading. NEVER extract the vehicle's selling price or total price as the odometer reading, or vice versa!
- Source: Prioritize AUCTION/FACILITY name and address. Look for any company name or address that is NOT Broadway.
- Title: "Title #", "Certificate #", "Cert of Origin"
- Stock: "Stock #", "Lot #", "Unit ID"
- Infer state from zip if missing (01xxx/02xxx = MA, 06xxx = CT, etc.).

HELPER ARRAYS:
- "allVisiblePrices": You MUST list all numeric dollar values related to pricing, fees, sales, or totals visible on the page.
- "allVisibleOdometers": You MUST list all numeric odometer/mileage values visible on the page.

- Used Vehicle Record (UVR) Double-Sided Forms: If the document contains both "Acquisition" and "Disposition" sections: If processed as a sale, prioritize "Disposition of Motor Vehicle/Part" section for buyer/sale fields. If processed as an acquisition, prioritize "Acquisition of Motor Vehicle/Part" section for source/purchase fields.
- PURCHASE CONTRACT: "Dealer/Seller" is Broadway (ignore address). "Purchaser" is buyer ( Joshua Hernandez etc. ). Stock No is stockNumber.
- NEVER use Broadway's address for source or disposed fields.${docText}`;
}

// ═══════════════════════════════════════════════════════════════
// TEXT LLM — Purpose-aware extraction
// ═══════════════════════════════════════════════════════════════
async function textExtract(text, purpose = "") {
  try {
    let prompt;
    if (purpose === 'acquisition') {
      prompt = buildAcquisitionPrompt(text);
    } else if (purpose === 'sale') {
      prompt = buildSalePrompt(text);
    } else {
      prompt = buildAutoPrompt(text);
    }

    const isOpenAI = useOpenAI;
    const apiUrl = isOpenAI 
      ? "https://api.openai.com/v1/chat/completions" 
      : "https://integrate.api.nvidia.com/v1/chat/completions";
    const apiKey = isOpenAI ? openaiApiKey : nvidiaApiKey;
    const modelName = isOpenAI ? "gpt-4o-mini" : "meta/llama-3.1-70b-instruct";

    console.log(`[Parser:Text] Sending ${text.length} chars to ${isOpenAI ? 'OpenAI' : 'NVIDIA'} LLM (model=${modelName}, purpose=${purpose || 'auto'})...`);
    const llmTimeoutMs = process.env.NODE_ENV === 'test' ? 3500 : 90000;
    const response = await fetchWithTimeout(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        temperature: 0,
        max_tokens: 1500,
        stream: false
      })
    }, llmTimeoutMs);

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    const raw = data.choices[0].message.content;
    console.log(`[Parser:Text] Raw AI response: ${raw.substring(0, 800)}`);
    const jsonMatch = raw.match(/JSON_START\s*(\{[\s\S]*\})\s*JSON_END/) || raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    const result = clean(parsed);
    console.log(`[Parser:Text] Cleaned result:`, JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    console.error('[Parser:Text] FAILED:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// VISION LLM — For images and scanned PDFs
// ═══════════════════════════════════════════════════════════════
async function visionExtract(fileBuffer, mimetype, purpose = "") {
  if (!hasLlmKey) return null;

  let base64Image = '';
  let imgMime = mimetype;

  if (mimetype === 'application/pdf') {
    try {
      const loadingTask = getDocument({ data: new Uint8Array(fileBuffer), useSystemFonts: true, disableFontFace: true });
      const doc = await loadingTask.promise;
      const page = await doc.getPage(1);
      const tc = await page.getTextContent();
      const txt = tc.items.map(i => ('str' in i ? i.str : '')).join(' ').trim();
      if (txt.length > 40) return null; // has native text, skip vision

      const vp = page.getViewport({ scale: 1.5 });
      const cf = createCanvasFactory();
      const { canvas, context } = cf.create(Math.ceil(vp.width), Math.ceil(vp.height));
      await page.render({ canvasContext: context, viewport: vp, canvasFactory: cf }).promise;
      base64Image = canvas.toBuffer('image/jpeg', { quality: 0.6 }).toString('base64');
      imgMime = 'image/jpeg';
      cf.destroy({ canvas, context });
    } catch (e) {
      console.warn('[Parser:Vision] PDF render fail:', e.message);
      return null;
    }
  } else if (mimetype.startsWith('image/')) {
    try {
      const resizedBuffer = await resizeImageIfNeeded(fileBuffer);
      base64Image = resizedBuffer.toString('base64');
      imgMime = 'image/jpeg';
    } catch (e) {
      console.warn('[Parser:Vision] Image resize fail:', e.message);
      base64Image = fileBuffer.toString('base64');
    }
  } else {
    return null;
  }

  if (!base64Image) return null;

  try {
    let prompt;
    if (purpose === 'acquisition') {
      prompt = buildAcquisitionPrompt('');
    } else if (purpose === 'sale') {
      prompt = buildSalePrompt('');
    } else {
      prompt = buildAutoPrompt('');
    }

    const isOpenAI = useOpenAI;
    const apiUrl = isOpenAI 
      ? "https://api.openai.com/v1/chat/completions" 
      : "https://integrate.api.nvidia.com/v1/chat/completions";
    const apiKey = isOpenAI ? openaiApiKey : nvidiaApiKey;
    const modelName = isOpenAI ? "gpt-4o" : "meta/llama-3.2-90b-vision-instruct";

    console.log(`[Parser:Vision] Sending image to ${isOpenAI ? 'OpenAI' : 'NVIDIA'} Vision AI (model=${modelName}, purpose=${purpose || 'auto'})...`);
    const llmTimeoutMs = process.env.NODE_ENV === 'test' ? 3500 : 90000;
    const response = await fetchWithTimeout(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${imgMime};base64,${base64Image}` } }
            ]
          }
        ],
        max_tokens: 1500,
        temperature: 0,
        stream: false
      })
    }, llmTimeoutMs);

    const data = await response.json();
    if (data.error) {
      console.error('[Parser:Vision] API Error:', data.error);
      throw new Error(data.error.message);
    }

    const raw = data.choices[0].message.content;
    console.log(`[Parser:Vision] Raw response: ${raw.substring(0, 800)}`);
    const jsonMatch = raw.match(/JSON_START\s*(\{[\s\S]*\})\s*JSON_END/) || raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in vision response');

    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    const result = clean(parsed);
    console.log(`[Parser:Vision] Cleaned result:`, JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    console.error('[Parser:Vision] FAILED:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// CLEAN — Normalize all extracted data
// ═══════════════════════════════════════════════════════════════
const STATE_MAP = {
  'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR', 'CALIFORNIA': 'CA',
  'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE', 'FLORIDA': 'FL', 'GEORGIA': 'GA',
  'HAWAII': 'HI', 'IDAHO': 'ID', 'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA',
  'KANSAS': 'KS', 'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
  'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS', 'MISSOURI': 'MO',
  'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH',
  'OKLAHOMA': 'OK', 'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT', 'VERMONT': 'VT',
  'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV', 'WISCONSIN': 'WI', 'WYOMING': 'WY'
};

// ZIP prefix -> state code mapping for inferring missing states
const ZIP_TO_STATE = {
  '01': 'MA', '02': 'MA', '03': 'NH', '04': 'ME', '05': 'VT', '06': 'CT',
  '07': 'NJ', '08': 'NJ', '10': 'NY', '11': 'NY', '12': 'NY', '13': 'NY', '14': 'NY',
  '15': 'PA', '16': 'PA', '17': 'PA', '18': 'PA', '19': 'PA',
  '20': 'DC', '21': 'MD', '22': 'VA', '23': 'VA', '24': 'VA',
  '02861': 'RI', '02840': 'RI', '02860': 'RI', '02898': 'RI', '028': 'RI', '029': 'RI',
  '30': 'GA', '33': 'FL', '02119': 'MA', '02170': 'MA',
};

function inferStateFromZip(zip) {
  if (!zip) return null;
  const z = String(zip).trim();
  // Check 5-digit first, then 3-digit prefix, then 2-digit prefix
  if (ZIP_TO_STATE[z]) return ZIP_TO_STATE[z];
  if (ZIP_TO_STATE[z.substring(0, 3)]) return ZIP_TO_STATE[z.substring(0, 3)];
  if (ZIP_TO_STATE[z.substring(0, 2)]) return ZIP_TO_STATE[z.substring(0, 2)];
  return null;
}

function clean(d) {
  if (!d) return {};
  // s() returns empty string for junk values, NEVER null — safe for chaining
  const s = v => {
    const str = String(v || '').trim()
      .replace(/\s+US$/i, '')   // Strip " US" suffix from Manheim addresses
      .trim();
    if (!str) return '';
    if (/^(null|undefined|none|n\/a|unknown|unknow|pending|unknown unknown|unknow unknow|0|-|exact 17-char VIN|manufacturer|model name ONLY|model name|color|SELLER|YYYY-MM-DD|information|not available|see title|see document)$/i.test(str)) return '';
    return str;
  };
  const n = v => {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'number') return v;
    const cleanStr = String(v).trim();
    if (!cleanStr) return null;
    const matches = cleanStr.replace(/[$,]/g, '').match(/-?\d+(\.\d+)?/g);
    if (!matches) return null;
    
    const numericMatches = matches.map(m => parseFloat(m)).filter(num => Number.isFinite(num));
    if (numericMatches.length === 0) return null;
    
    // User wants the "belowest" (last) one. 
    // We'll filter out years (1900-2026) to avoid model years.
    const candidates = numericMatches.filter(num => num > 2026 || num < 1900);
    if (candidates.length > 0) return candidates[candidates.length - 1];

    return numericMatches[numericMatches.length - 1];
  };
  const i = (v, isYear = false) => {
    if (typeof v === 'number') return v;
    const cleanStr = String(v || '0').replace(/[,]/g, '').trim();
    const matches = cleanStr.match(/\d+/g);
    if (!matches) return 0;
    
    if (isYear) {
      // Find a 4-digit number between 1900 and 2030
      const yearMatch = matches.find(m => m.length === 4 && parseInt(m, 10) > 1900 && parseInt(m, 10) < 2030);
      if (yearMatch) return parseInt(yearMatch, 10);
    }

    const x = parseInt(matches[matches.length - 1], 10);
    return Number.isFinite(x) ? x : 0;
  };
  const st = (v, zip) => {
    const raw = String(v || '').trim().toUpperCase().replace(/\s+US$/i, '');
    if (!raw && zip) return inferStateFromZip(zip);
    if (!raw) return null;
    if (STATE_MAP[raw]) return STATE_MAP[raw];
    if (raw.length === 2 && /^[A-Z]{2}$/.test(raw)) return raw;
    const match = raw.match(/\b([A-Z]{2})\b/);
    if (match) return match[1];
    // Last resort: try ZIP inference
    if (zip) return inferStateFromZip(zip);
    return raw.slice(0, 2) || null;
  };

  const vin = (s(d.vin) || '').toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^(VIN|SERIAL|NUMBER|ID|VEHICLEID|IDENTIFICATION|STOCK|LOT|NO)+/, '')
    .replace(/I/g, '1')
    .replace(/[OQ]/g, '0')
    .slice(0, 17);
  const dt = v => {
    if (!v) return null;
    const t = String(v).trim();
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(Date.UTC(+m[3], +m[1]-1, +m[2])).toISOString();
    const dd = new Date(t);
    return isNaN(dd.getTime()) ? null : dd.toISOString();
  };

  // Helper to split address if AI combined them
  const splitAddr = (addr, city, state, zip) => {
    const rawAddr = String(addr || '').trim();
    if (rawAddr && (!city || !state)) {
      // 1. Try splitting by comma
      const parts = rawAddr.split(',');
      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1].trim();
        const cityPart = parts[parts.length - 2].trim();
        // Support 5-digit or 9-digit (ZIP+4) codes
        const stateZipMatch = lastPart.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i);
        if (stateZipMatch || /^[A-Z]{2}$/i.test(lastPart)) {
          return {
            a: parts.slice(0, -2).join(',').trim() || rawAddr,
            c: city || cityPart,
            s: state || (stateZipMatch ? stateZipMatch[1] : lastPart),
            z: zip || (stateZipMatch ? stateZipMatch[2] : null)
          };
        }
      }
      
      // 2. Try regex fallback for "City ST 12345" or "City, ST 12345-6789"
      const geoMatch = rawAddr.match(/([^,]+)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)?$/i);
      if (geoMatch) {
        const fullPrefix = rawAddr.substring(0, geoMatch.index).trim();
        const streetParts = fullPrefix.split(/\s+/);
        // Usually the last word before the City is the street name, but City might be 2 words.
        // This is tricky, but let's try to assume the match captured City ST Zip.
        return {
          a: city ? rawAddr : (fullPrefix || rawAddr),
          c: city || geoMatch[1].trim(),
          s: state || geoMatch[2],
          z: zip || geoMatch[3] || null
        };
      }
    }
    return { a: addr, c: city, s: state, z: zip };
  };

  const acq = splitAddr(
    s(d.usedVehicleSourceAddress),
    s(d.usedVehicleSourceCity),
    s(d.usedVehicleSourceState),
    s(d.usedVehicleSourceZipCode)
  );

  const disp = splitAddr(
    s(d.disposedAddress),
    s(d.disposedCity),
    s(d.disposedState),
    s(d.disposedZip)
  );

  // Filter out Broadway addresses that may have leaked into source/disposed fields
  const isBroadwayAddr = (addr) => {
    if (!addr) return false;
    const u = String(addr).toUpperCase();
    return u.includes('REVERE BEACH') || u.includes('100 BROADWAY') || u.includes('BROADWAY USED');
  };

  // ── Universal Vehicle Make Database ──
  const KNOWN_MAKES = new Set([
    'ACURA','ALFA ROMEO','ASTON MARTIN','AUDI','BENTLEY','BMW','BUICK','CADILLAC',
    'CHEVROLET','CHEVY','CHRYSLER','CITROEN','DAEWOO','DAIHATSU','DODGE','EAGLE',
    'FERRARI','FIAT','FISKER','FORD','GENESIS','GEO','GMC','HONDA','HUMMER',
    'HYUNDAI','INFINITI','ISUZU','JAGUAR','JEEP','KIA','LAMBORGHINI','LAND ROVER',
    'LEXUS','LINCOLN','LOTUS','LUCID','MASERATI','MAZDA','MCLAREN','MERCEDES-BENZ',
    'MERCEDES','BENZ','MERCURY','MINI','MITSUBISHI','NISSAN','OLDSMOBILE','OPEL',
    'PAGANI','PEUGEOT','PLYMOUTH','POLESTAR','PONTIAC','PORSCHE','RAM','RENAULT',
    'RIVIAN','ROLLS-ROYCE','ROLLS ROYCE','SAAB','SATURN','SCION','SEAT','SKODA',
    'SMART','SUBARU','SUZUKI','TESLA','TOYOTA','VOLKSWAGEN','VW','VOLVO',
  ]);

  // ── Universal Validators ──
  const isKnownMake = (val) => {
    if (!val) return false;
    return KNOWN_MAKES.has(val.toUpperCase().trim());
  };

  const isValidModel = (val) => {
    if (!val || val.length < 2) return false;
    const u = val.toUpperCase();
    if (isVehicleBoilerplateText(u)) return false;
    // A valid model should be short (1-4 words max) and NOT look like:
    // - An address (contains road/street/avenue/pkwy/blvd/drive etc.)
    // - A business entity (contains inc/llc/corp/sales/buyer/seller/dealer etc.)
    // - A sentence or label (more than 5 words)
    // - Pure noise (contains "payment", "remit", "announcement", "clerk", etc.)
    const words = u.split(/\s+/);
    if (words.length > 5) return false;
    if (/\b(road|rd|street|st|avenue|ave|blvd|boulevard|drive|dr|lane|ln|pkwy|parkway|highway|hwy|way|circle|court|ct|place|pl)\b/i.test(u)) return false;
    if (/\b(inc|llc|corp|ltd|co\b|sales|buyer|seller|dealer|auction|broadway|remit|payment|purchaser|transferee|clerk|unit|block|announcement|mats|fear|warehouse)\b/i.test(u)) return false;
    if (/\bof\b/i.test(u)) return false;
    if (/\b(of\s+[a-z]+town|of\s+[a-z]+ford|of\s+[a-z]+bury|of\s+[a-z]+ham)\b/i.test(u)) return false;
    // Should not be a state name or zip code
    if (/^\d{5}(-\d{4})?$/.test(u)) return false;
    if (STATE_MAP[u]) return false;
    return true;
  };

  const isValidTitleNumber = (val) => {
    if (!val || val.length < 4) return false;
    // A valid title number is an alphanumeric CODE, not a word
    // Must contain at least 2 digits
    if ((val.match(/\d/g) || []).length < 2) return false;
    // Should not be a plain English word
    if (/^[a-z]+$/i.test(val) && val.length < 10) return false;
    return true;
  };

  const cleanSourceName = (val) => {
    if (!val) return null;
    let cleaned = val;
    // Strip trailing dates in any format (MM/DD/YYYY, DD-MON-YYYY, etc.)
    cleaned = cleaned.replace(/\s+\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}.*$/i, '');
    cleaned = cleaned.replace(/\s+\d{1,2}-[A-Z]{3}-\d{2,4}.*$/i, '');
    // Strip trailing price fragments ($, dollar amounts)
    cleaned = cleaned.replace(/\s*\$\s*[\d,.]+.*$/g, '');
    // Strip trailing noise words (announcements, sale price, block clerk, etc.)
    cleaned = cleaned.replace(/\s+(announcements?|sale\s*price|block\s*clerk|dealer\s*unit|office\s*copy|conditions?|terms?)(\b.*)?$/gi, '');
    // Strip trailing sequences of 4+ digit numbers
    cleaned = cleaned.replace(/\s+\d{4,}(\s+\d+)*\s*$/g, '');
    // Strip trailing time patterns (HH:MM or HH:MM:SS)
    cleaned = cleaned.replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*$/g, '');
    return cleaned.trim() || null;
  };

  const cleanAddress = (val) => {
    if (!val) return null;
    let cleaned = val;
    // Strip trailing non-address noise (block clerk, announcements, dealer unit, etc.)
    cleaned = cleaned.replace(/\s+(block\s*clerk|dealer\s*unit|announcements?|sale\s*price|office\s*copy|conditions?|lot\s*#?\s*\d*)(\b.*)?$/gi, '');
    // Strip trailing date patterns
    cleaned = cleaned.replace(/\s+\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}.*$/i, '');
    // Strip trailing long numeric sequences (not zip codes — those are 5 digits)
    cleaned = cleaned.replace(/\s+\d{6,}.*$/g, '');
    return cleaned.trim() || null;
  };

  return {
    vin,
    make: (() => {
      const raw = s(d.make);
      if (!raw) return null;
      if (isVehicleBoilerplateText(raw)) return null;
      // Strip label prefixes
      let cleaned = raw.replace(/^(make|manufacturer|mfr)[\s.:##-]*/i, '')
        .replace(/\b(sedan|suv|coupe|truck|van|wagon|hatchback|convertible|sport\s*utility)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleaned) return null;
      // Universal validation: must be a known manufacturer
      if (!isKnownMake(cleaned)) {
        // Try to find a known make within the string
        for (const make of KNOWN_MAKES) {
          if (cleaned.toUpperCase().includes(make)) {
            return make.charAt(0) + make.slice(1).toLowerCase();
          }
        }
        return null;
      }
      return cleaned;
    })(),
    model: (() => {
      const raw = s(d.model);
      if (!raw) return null;
      if (isVehicleBoilerplateText(raw)) return null;
      // Strip body types
      const bodyTypes = /\b(sedan|suv|coupe|truck|van|wagon|hatchback|convertible|sport\s*utility\s*v?)\b/gi;
      let cleaned = raw.replace(bodyTypes, '')
        // Strip stock/trim/package noise generically
        .replace(/\b(stock|base|trim|package|edition|standard|premium)\b.*/gi, '')
        .replace(/^\d{4}\s+/,'')
        .replace(/\b(?:of|inc|llc|corp|dealer|seller|buyer)\b.*$/i, '')
        .replace(/\s+[=~_+\-–—|]+\s*.*$/g, '')
        .replace(/\s+\d{1,4}\s*$/g, '')
        .replace(/\s+/g, ' ').trim();
      if (!cleaned) return null;
      // Universal validation
      if (!isValidModel(cleaned)) return null;
      return cleaned;
    })(),
    year: i(d.year, true) || null,
    color: s(d.color) || null,
    mileage: i(d.mileage || d.odometer || d.odometerReading),
    titleNumber: (() => {
      const raw = s(d.titleNumber);
      if (!raw) return null;
      
      // Strip label prefixes
      const normalizedTitle = normalizeTitleNumber(raw);
      if (normalizedTitle) return normalizedTitle;

      let cleaned = raw.trim()
        .replace(/^(title|cert(ificate)?|doc(ument)?|warranty|this|that|the|repairable|parts|prior|reconstructed|information|pending|salvage|see|check|none|not)[\s.:##-]*(no|number|num|id|#)?[\s.:##-]*/i, '')
        .replace(/^(no|number|num|#)[\s.:##-]*/i, '')
        .replace(/^[A-Z]{2}\//, '')
        .replace(/\s/g, '')
        .trim();
      
      if (!cleaned || cleaned.length < 4) return null;
      // Universal validation: must be an alphanumeric code with digits
      if (!isValidTitleNumber(cleaned)) return null;
      
      // Reject if the "title number" is actually the VIN
      const vinCandidate = cleaned.replace(/[^A-Z0-9]/gi, '');
      if (vinCandidate.length === 17 && vin && vinCandidate === vin) return null;
      
      return normalizeTitleNumber(cleaned);
    })(),
    stockNumber: s(d.stockNumber) || null,
    purchasedFrom: cleanSourceName(s(d.purchasedFrom)),
    purchasePrice: n(d.purchasePrice),
    purchaseDate: dt(d.purchaseDate),
    usedVehicleSourceAddress: cleanAddress(isBroadwayAddr(acq.a) ? null : (acq.a || null)),
    usedVehicleSourceCity: isBroadwayAddr(acq.a) ? null : (acq.c || null),
    usedVehicleSourceState: isBroadwayAddr(acq.a) ? null : st(acq.s, acq.z),
    usedVehicleSourceZipCode: isBroadwayAddr(acq.a) ? null : (s(acq.z) || null),
    disposedTo: cleanDispositionName(d.disposedTo) || null,
    disposedAddress: (disp.a || null),
    disposedCity: (disp.c || null),
    disposedState: st(disp.s, disp.z),
    disposedZip: (s(disp.z) || null),
    disposedDate: dt(d.disposedDate),
    disposedPrice: n(d.disposedPrice),
    disposedOdometer: i(d.disposedOdometer),
    disposedDlNumber: s(d.disposedDlNumber) || null,
    disposedDlState: st(d.disposedDlState),
    transportCost: n(d.transportCost),
    repairCost: n(d.repairCost),
    inspectionCost: n(d.inspectionCost),
    registrationCost: n(d.registrationCost),
    paymentMethod: s(d.paymentMethod) || null,
  };
}

// ═══════════════════════════════════════════════════════════════
// TEXT EXTRACTION HELPERS
// ═══════════════════════════════════════════════════════════════
export async function extractText(fileBuffer, mimetype) {
  if (isPdfMimeType(mimetype) || isPdfBuffer(fileBuffer)) {
    const { combinedText } = await extractPdfTextPages(fileBuffer);
    if (combinedText.replace(/\s/g, '').length > 30) {
      return combinedText;
    }
    const ocrText = await ocrPdf(fileBuffer, 2);
    return ocrText || combinedText;
  } else if (mimetype?.includes('word')) {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } else if (mimetype?.startsWith('image/')) {
    return ocrImage(fileBuffer);
  } else {
    return fileBuffer.toString('utf-8');
  }
}

async function ocrPdf(fileBuffer, maxPages = 2) {
  try {
    const loadingTask = getDocument({ data: new Uint8Array(fileBuffer), useSystemFonts: true, disableFontFace: true });
    const doc = await loadingTask.promise;
    
    const pageNumbers = [];
    for (let i = 1; i <= Math.min(maxPages, doc.numPages); i++) {
      pageNumbers.push(i);
    }

    console.log(`[OCR-PDF] Performing parallel OCR on ${pageNumbers.length} pages...`);
    const ocrPromises = pageNumbers.map(async (pageNum) => {
      try {
        const page = await doc.getPage(pageNum);
        const vp = page.getViewport({ scale: 2.0 });
        const cf = createCanvasFactory();
        const { canvas, context } = cf.create(Math.ceil(vp.width), Math.ceil(vp.height));
        await page.render({ canvasContext: context, viewport: vp, canvasFactory: cf }).promise;
        const pageImage = canvas.toBuffer('image/jpeg', { quality: 0.85 });
        cf.destroy({ canvas, context });
        
        return await ocrImage(pageImage);
      } catch (pageErr) {
        console.error(`[OCR-PDF] Failed page ${pageNum}:`, pageErr.message);
        return '';
      }
    });

    const pageTexts = await Promise.all(ocrPromises);
    return pageTexts.filter(Boolean).join('\n').trim();
  } catch (err) {
    console.error('[OCR-PDF] Failed:', err.message);
    return '';
  }
}

async function ocrImage(fileBuffer) {
  const worker = await tesseractPool.acquire();
  try {
    const { data: { text } } = await worker.recognize(fileBuffer);
    return text;
  } catch (err) {
    console.error('[OCR] Failed:', err?.message || err);
    return '';
  } finally {
    tesseractPool.release(worker);
  }
}

// Heuristic: parse Make, Model, Year from raw text when AI misses them
function parseMakeModelYearFromText(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  let year = null;
  let make = null;
  let model = null;

  const makes = [
    'toyota','honda','ford','chevrolet','nissan','bmw','mercedes','audi','hyundai','kia','subaru','mazda','dodge','jeep','volkswagen','lexus','cadillac','infiniti','acura','chrysler','ram','gmc','buick','mitsubishi','porsche','jaguar','land rover','tesla'
  ];
  const bodyTypes = [
    'sedan','suv','hatchback','wagon','van','coupe','convertible','truck','pickup','minivan','crossover',
    'sport utility v','sport utility','sport utility vehicle','utility vehicle'
  ];
  const colorWords = [
    'black','white','gray','grey','silver','red','blue','green','gold','golden','brown','tan','beige',
    'charcoal','purple','orange','yellow','maroon','burgundy','teal','navy'
  ];
  const makeRegex = new RegExp('\\b(' + makes.join('|') + ')\\b', 'i');
  const bodyTypeRegex = new RegExp('\\b(?:' + bodyTypes.map((value) => value.replace(/\s+/g, '\\s+')).join('|') + ')\\b', 'i');
  const colorRegex = new RegExp('\\b(?:' + colorWords.join('|') + ')\\b', 'i');
  const isDateishLine = (line) => /\b(date|reprinted|printed on|print date|sale date|date of sale|stock|lot|invoice|payment|odometer|title|certification|seller|buyer|purchaser|remit)\b/i.test(line);
  const isVehicleHintLine = (line) => /\b(year|make|model|body type|vehicle|vin|color)\b/i.test(line);

  const cleanToken = (value) => String(value || '')
    .replace(/\b(make|model)\b/gi, '')
    .replace(/[:\/\\\\]+/g, ' ')
    .replace(/[|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normalizeMake = (value) => {
    if (!value) return value;
    const clean = cleanToken(value);
    if (!clean) return clean;
    const tokens = clean.split(' ').filter(Boolean);
    if (!tokens.length) return '';
    if (tokens.length > 1 && makes.includes(tokens[0].toLowerCase())) {
      return tokens[0][0].toUpperCase() + tokens[0].slice(1).toLowerCase();
    }
    const known = tokens.find((token) => makes.includes(token.toLowerCase()));
    if (known) return known[0].toUpperCase() + known.slice(1).toLowerCase();
    return tokens.map((word) => word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : '').join(' ').trim();
  };

  const normalizeModel = (value, currentMake) => {
    if (!value) return value;
    if (isVehicleBoilerplateText(value)) return '';
    let clean = cleanToken(value);
    if (isVehicleBoilerplateText(clean)) return '';
    if (currentMake) {
      const makeToken = currentMake.split(' ')[0];
      const prefix = new RegExp('^' + makeToken + '\\s+', 'i');
      clean = clean.replace(prefix, '').trim();
    }
    clean = clean.replace(/^\d{4}\s+/, '').trim();
    clean = clean.replace(/\b(?:of|inc|llc|corp|dealer|seller|buyer)\b.*$/i, '').trim();
    clean = clean.replace(/\s+[=~_+\-–—]+\s*.*$/g, '').trim();
    clean = clean.replace(/\s+\d{1,4}\s*$/g, '').trim();
    clean = clean.replace(/\s+/g, ' ').trim();
    const tokens = clean
      .split(' ')
      .filter(Boolean)
      .filter((token) => !/^\d+$/.test(token))
      .filter((token) => !bodyTypeRegex.test(token))
      .filter((token) => !colorRegex.test(token))
      .filter((token) => !/^ree$/i.test(token))
      .filter((token) => !/^manufacturer$/i.test(token));
    if (!tokens.length) return '';
    const TRIM_CODES = new Set(['LE', 'SE', 'XLE', 'XSE', 'GT', 'LX', 'EX', 'DX', 'RT', 'ST', 'SL', 'LT', 'LS', 'LTZ', 'SS', 'RS', 'SV', 'SR5', 'AWD', 'FWD', '4WD']);
    return tokens
      .map((word) => {
        const upper = word.toUpperCase();
        if (TRIM_CODES.has(upper)) return upper;
        if (/^[IVXLCDM]+$/i.test(word)) return word.toUpperCase();
        if (/^[A-Z]{2,}$/.test(word)) return word[0] + word.slice(1).toLowerCase();
        return word[0].toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ')
      .trim();
  };

  const parseModelTail = (line, foundMake) => {
    const match = line.match(makeRegex);
    if (!match) return null;
    const after = line.slice(match.index + match[0].length).trim();
    if (!after) return null;
    const tokens = after.split(/[,\/\\\-\s]+/).filter(Boolean);
    while (tokens.length && /^(model|make|manufacturer|body|type|color)$/i.test(tokens[0])) tokens.shift();
    while (tokens.length && /^(sedan|suv|hatchback|wagon|van|coupe|convertible|truck|pickup|minivan|crossover)$/i.test(tokens[0])) tokens.shift();
    while (tokens.length && colorWords.includes(tokens[tokens.length - 1].toLowerCase())) tokens.pop();
    const candidate = tokens.filter((token) => !/^\d{4}$/.test(token)).slice(0, 4).join(' ');
    return candidate ? normalizeModel(candidate, foundMake) : null;
  };

  const vehicleInfoIndex = lines.findIndex((line) => /\bVehicle Information\b/i.test(line));
  if (vehicleInfoIndex >= 0) {
    for (const rawLine of lines.slice(vehicleInfoIndex + 1, vehicleInfoIndex + 7)) {
      const line = rawLine.replace(/[|]+/g, ' ').replace(/\s+/g, ' ').trim();
      const match = line.match(/^\s*((?:19|20)\d{2})\s+(.+)$/);
      if (!match || !makeRegex.test(match[2])) continue;
      const makeMatch = match[2].match(makeRegex);
      if (!makeMatch) continue;
      year = year || match[1];
      make = make || normalizeMake(makeMatch[1]);
      model = model || parseModelTail(line, make);
      if (year && make && model) break;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/[|]+/g, ' ').replace(/\s+/g, ' ').trim();
    const isBoilerplate = /\b(?:Any\s+Legally\s+Required|Repairs?|Prior\s+To\s+Sale|Warranty|Disclosure|Bill\s+of\s+Sale|Title|Transfer|Certificate|Notice|Lien|Odometer|Exempt|Salvage|Rebuilt|Flood|Branded)\b/i.test(line);
    if (isBoilerplate || isVehicleBoilerplateText(line)) continue;

    const labeledYear = line.match(/(?:Mfrs?\.?\s*Model\s*Year|Year)\s*[:\-]?\s*((?:19|20)\d{2})/i);
    if (labeledYear && !year) year = labeledYear[1];

    const ocrLeadingYear = line.match(/^\s*(20[0-2])\s*[iIl1][!.,;:]?\s+([A-Za-z0-9&']+)\s+(.+)$/);
    if (ocrLeadingYear) {
      if (!year) year = `${ocrLeadingYear[1]}1`;
      if (!make) make = normalizeMake(ocrLeadingYear[2]);
      if (!model) model = normalizeModel(ocrLeadingYear[3], make);
    }

    if (!year && !isDateishLine(line)) {
      const leadingYear = line.match(/^\s*((?:19|20)\d{2})\b/);
      if (leadingYear && (isVehicleHintLine(line) || makeRegex.test(line))) {
        year = leadingYear[1];
      }
    }

    const makeModelLine = line.match(/(?:make\s*\/\s*model|model\s*\/\s*make)\s*[:\-]?\s*(.+)/i);
    if (makeModelLine) {
      const parts = makeModelLine[1].split(/[,\/]+/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        if (!make) make = normalizeMake(parts[0]);
        if (!model) model = normalizeModel(parts.slice(1).join(' '), make);
      } else if (parts.length === 1) {
        const valueTokens = parts[0].split(/\s+/).filter(Boolean);
        if (valueTokens.length >= 2 && makeRegex.test(parts[0])) {
          if (!make) make = normalizeMake(valueTokens[0]);
          if (!model) model = normalizeModel(valueTokens.slice(1).join(' '), make);
        }
      }
    }

    const makeLabel = line.match(new RegExp('\\bmake(?:\\/manufacturer)?\\b\\s*[:\\-]\\s*([A-Za-z0-9 &\\-\\.\\/]+)', 'i'));
    if (makeLabel && !make) make = normalizeMake(makeLabel[1]);
    const modelLabel = line.match(new RegExp('\\bmodel\\b\\s*[:\\-]\\s*([A-Za-z0-9 &\\-\\.\\/]+)', 'i'));
    if (modelLabel && !model) model = normalizeModel(modelLabel[1], make);

    if (!isDateishLine(line)) {
      const makeMatch = line.match(makeRegex);
      if (makeMatch) {
        if (!make) make = normalizeMake(makeMatch[1]);
        if (!model) {
          const tail = parseModelTail(line, make);
          if (tail) model = tail;
        }
        if (!year) {
          const yearMatch = line.match(/\b((?:19|20)\d{2})\b/);
          if (yearMatch) year = yearMatch[1];
        }
      }
    }

    const leading = line.match(/^\s*((?:19|20)\d{2})\s+([A-Za-z0-9&']+)\s+(.+)$/);
    if (leading) {
      if (!year) year = leading[1];
      if (!make) make = normalizeMake(leading[2]);
      if (!model) model = normalizeModel(leading[3], make);
    }

    if (make && model && year) break;
  }

  if ((!make || !model || !year) && lines.length) {
    for (const rawLine of lines) {
      const line = rawLine.replace(/[|]+/g, ' ').replace(/\s+/g, ' ').trim();
      const isBoilerplate = /\b(?:Any\s+Legally\s+Required|Repairs?|Prior\s+To\s+Sale|Warranty|Disclosure|Bill\s+of\s+Sale|Title|Transfer|Certificate|Notice|Lien|Odometer|Exempt|Salvage|Rebuilt|Flood|Branded)\b/i.test(line);
      if (isBoilerplate || isVehicleBoilerplateText(line)) continue;

      const yearMatch = line.match(/\b((?:19|20)\d{2})\b/);
      if (yearMatch && !year && !isDateishLine(line) && (isVehicleHintLine(line) || makeRegex.test(line))) {
        year = yearMatch[1];
      }

      const makeMatch = !isDateishLine(line) ? line.match(makeRegex) : null;
      if (makeMatch) {
        if (!make) make = normalizeMake(makeMatch[1]);
        if (!model) {
          const tail = parseModelTail(line, make);
          if (tail) model = tail;
        }
      }

      const makeModelLine = line.match(/(?:make\s*\/\s*model|model\s*\/\s*make)\s*[:\-]?\s*(.+)/i);
      if (makeModelLine) {
        const parts = makeModelLine[1].split(/[,\/]+/).map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          if (!make) make = normalizeMake(parts[0]);
          if (!model) model = normalizeModel(parts.slice(1).join(' '), make);
        }
      }

      const modelOnlyMatch = line.match(/\bmodel\b\s*[:\-]\s*([A-Za-z0-9 &\-\.\/]+)/i);
      if (modelOnlyMatch && !model) {
        model = normalizeModel(modelOnlyMatch[1], make);
      }

      const leading = line.match(/^\s*((?:19|20)\d{2})\s+([A-Za-z0-9&']+)\s+(.+)$/);
      if (leading) {
        if (!year) year = leading[1];
        if (!make) make = normalizeMake(leading[2]);
        if (!model) model = normalizeModel(leading[3], make);
      }

      if (make && model && year) break;
    }
  }

  if (year) year = Number(String(year).replace(/[^0-9]/g, ''));
  if (make) make = normalizeMake(make);
  if (model) model = normalizeModel(model, make);

  if (make || model || year) return { make, model, year };
  return null;
}
async function resizeImageIfNeeded(fileBuffer) {
  try {
    const img = await loadImage(fileBuffer);
    const maxDim = 2048; // Reverting to high resolution for absolute accuracy on price/fees
    if (img.width <= maxDim && img.height <= maxDim) return fileBuffer;

    let w = img.width;
    let h = img.height;
    if (w > h) {
      h = Math.floor((h * maxDim) / w);
      w = maxDim;
    } else {
      w = Math.floor((w * maxDim) / h);
      h = maxDim;
    }

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toBuffer('image/jpeg', { quality: 0.85 });
  } catch (err) {
    console.error('[Resize] Failed:', err.message);
    return fileBuffer;
  }
}

function createCanvasFactory() {
  return {
    create: (w, h) => { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; },
    destroy: (t) => { t.canvas.width = 0; t.canvas.height = 0; },
  };
}

async function extractPdfTextPages(fileBuffer) {
  const loadingTask = getDocument({ data: new Uint8Array(fileBuffer), useSystemFonts: true, disableFontFace: true });
  const doc = await loadingTask.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.map(item => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ').trim());
  }
  return { pages, combinedText: pages.join('\n').trim() };
}

/**
 * Validates a 17-character VIN using the standard check digit rule (position 9).
 * Useful for catching OCR errors.
 */
export function isValidVin(vin) {
  if (!vin || vin.length !== 17) return false;
  
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  const transliteration = {
    'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8,
    'J': 1, 'K': 2, 'L': 3, 'M': 4, 'N': 5, 'P': 7, 'R': 9,
    'S': 2, 'T': 3, 'U': 4, 'V': 5, 'W': 6, 'X': 7, 'Y': 8, 'Z': 9,
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9
  };

  try {
    let sum = 0;
    for (let i = 0; i < 17; i++) {
      const char = vin[i].toUpperCase();
      const val = transliteration[char];
      if (val === undefined && i !== 8) return false; // Invalid char in non-check-digit position
      sum += (val || 0) * weights[i];
    }

    const remainder = sum % 11;
    const checkDigit = remainder === 10 ? 'X' : String(remainder);
    
    return vin[8].toUpperCase() === checkDigit;
  } catch (err) {
    return false;
  }
}

export { extractTotalFromText, extractVinFromText, extractTitleFromText };
