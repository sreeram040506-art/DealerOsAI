import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import {
  cleanDispositionName,
  extractAcquisitionDetailsFromText,
  extractDispositionDetailsFromText,
  extractTotalFromText,
  extractVehicleInfo,
  extractText
} from '../services/documentParser.js';
import { fillUsedVehiclePdf } from '../services/usedVehiclePdfService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const DEALERSHIP_ID = '6a00d69df1a30183ef6a8c3c'; // 'broadway auto sales'

const defaultUsedVehicleTemplatePath = path.join(__dirname, '../used-vechile-report.jpeg');
const cachedTemplateBuffer = fs.readFileSync(defaultUsedVehicleTemplatePath);

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

async function findFuzzyRegistryEntry(vin, type) {
  if (!vin) return null;
  const upperVin = vin.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (upperVin.length !== 17) {
    const entry = await prisma.documentRegistry.findFirst({
      where: { 
        vin: upperVin, 
        documentType: type,
        dealershipId: DEALERSHIP_ID
      },
      orderBy: { createdAt: 'desc' }
    });
    return entry || null;
  }

  let entry = await prisma.documentRegistry.findFirst({
    where: { 
      vin: upperVin, 
      documentType: type,
      dealershipId: DEALERSHIP_ID
    },
    orderBy: { createdAt: 'desc' }
  });
  if (entry) return entry;

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
          dealershipId: DEALERSHIP_ID
        },
        orderBy: { createdAt: 'desc' }
      });
      if (entry) {
        return entry;
      }
    }
  }

  return null;
}

// Data wipe routine to ensure clean database state before bulk insert
async function wipeData() {
  console.log('Performing deep database data wipe...');
  await prisma.customerNote.deleteMany({});
  await prisma.repair.deleteMany({});
  await prisma.purchase.deleteMany({});
  await prisma.sale.deleteMany({});
  await prisma.advertisingExpense.deleteMany({});
  await prisma.businessExpense.deleteMany({});
  await prisma.documentRegistry.deleteMany({});
  await prisma.vehicle.deleteMany({});
  console.log('Data wipe complete!');
}

async function processBuyDocument(filename, filepath) {
  const fileBuffer = fs.readFileSync(filepath);
  const isPdf = filename.endsWith('.pdf') && fileBuffer.length >= 5 && fileBuffer.slice(0, 5).toString('utf8') === '%PDF-';
  const mimetype = isPdf ? 'application/pdf' : 'image/jpeg';

  let info = sanitizeVehicleIdentity(await extractVehicleInfo(fileBuffer, mimetype, ''));
  if (!info || !info.vin || !info.make || !info.model) {
    const acquisitionFallback = sanitizeVehicleIdentity(await extractVehicleInfo(fileBuffer, mimetype, 'acquisition'));
    info = mergeExtractionInfo(info, acquisitionFallback);
  }
  info = sanitizeVehicleIdentity(info || {});
  info = clearDispositionInfo(info || {});

  if (!info.vin) {
    throw new Error(`Could not extract VIN from ${filename}`);
  }

  const warnings = {};
  let rawText = '';
  try {
    rawText = await extractText(fileBuffer, mimetype);
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
    }

    const totalFromText = extractTotalFromText(rawText, 'acquisition');
    if (isReasonableVehicleAmount(totalFromText)) {
      info.purchasePrice = totalFromText;
    }
  } catch (err) {
    console.warn(`[${filename}] Text fallback failed: ${err.message}`);
  }

  info = sanitizeVehicleIdentity(info);
  info.make = info.make || 'Unknown';
  info.model = info.model || 'Unknown';
  info.year = info.year || 2020;

  if (!isReasonableVehicleAmount(info.purchasePrice)) {
    info.purchasePrice = 10000;
  }

  let pdfBase64Str;
  const isAlreadyUsedVehicleRecord = /\b(?:USED VEHICLE RECORD|Motor Vehicle\/Part Identification|Disposition of Motor Vehicle)\b/i.test(rawText);
  if (isAlreadyUsedVehicleRecord) {
    pdfBase64Str = fileBuffer.toString('base64');
  } else {
    const filledPdf = await fillUsedVehiclePdf(cachedTemplateBuffer, info, 'image/jpeg');
    pdfBase64Str = filledPdf;
  }

  // Save to registry
  const docData = {
    vin: info.vin,
    make: info.make,
    model: info.model,
    year: String(info.year),
    titleNumber: info.titleNumber || null,
    purchasedFrom: info.purchasedFrom || null,
    sellerAddress: info.usedVehicleSourceAddress || null,
    sellerCity: info.usedVehicleSourceCity || null,
    sellerState: info.usedVehicleSourceState || null,
    sellerZip: info.usedVehicleSourceZipCode || null,
    documentType: 'Used Vehicle Record',
    documentBase64: pdfBase64Str,
    sourceFileName: filename,
    sourceDocumentBase64: fileBuffer.toString('base64'),
    dealershipId: DEALERSHIP_ID,
    createdAt: new Date()
  };

  const existingLog = await findFuzzyRegistryEntry(info.vin, 'Used Vehicle Record');
  if (existingLog) {
    await prisma.documentRegistry.updateMany({
      where: { id: existingLog.id, dealershipId: DEALERSHIP_ID },
      data: docData
    });
  } else {
    await prisma.documentRegistry.create({
      data: docData
    });
  }

  // Create Vehicle
  const existingVehicles = await prisma.vehicle.findMany({
    where: { dealershipId: DEALERSHIP_ID }
  });
  let existingVehicle = null;
  const cleanUpper = (str) => String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanVin = cleanUpper(info.vin);

  for (const v of existingVehicles) {
    const cleanV = cleanUpper(v.vin);
    if (cleanV === cleanVin) {
      existingVehicle = v;
      break;
    }
    
    // Treat as duplicate only if both the serial number (last 6 digits) AND make/model match
    const vMake = String(v.make || '').toLowerCase().trim();
    const infoMake = String(info.make || '').toLowerCase().trim();
    const vModel = String(v.model || '').toLowerCase().trim();
    const infoModel = String(info.model || '').toLowerCase().trim();
    
    if (v.vin.length >= 6 && info.vin.length >= 6 && 
        v.vin.endsWith(info.vin.slice(-6)) && 
        vMake === infoMake && vModel === infoModel) {
      existingVehicle = v;
      break;
    }
  }

  if (!existingVehicle) {
    const purchasePrice = parseCurrency(info.purchasePrice);
    const transportCost = parseCurrency(info.transportCost);
    const repairCost = parseCurrency(info.repairCost);
    const inspectionCost = parseCurrency(info.inspectionCost);
    const registrationCost = parseCurrency(info.registrationCost);
    const totalPurchaseCost = purchasePrice + transportCost + inspectionCost + registrationCost;

    await prisma.vehicle.create({
      data: {
        vin: info.vin,
        make: info.make,
        model: info.model,
        year: Number(info.year),
        mileage: Number(info.mileage) || 0,
        color: info.color || 'Unknown',
        purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
        titleNumber: info.titleNumber || null,
        status: 'Available',
        dealershipId: DEALERSHIP_ID,
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
            sourceDocumentBase64: fileBuffer.toString('base64'),
            dealershipId: DEALERSHIP_ID
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
              dealershipId: DEALERSHIP_ID
            }
          }
        })
      }
    });
  }
}

async function processSaleDocument(filename, filepath) {
  const fileBuffer = fs.readFileSync(filepath);
  const isPdf = filename.endsWith('.pdf') && fileBuffer.length >= 5 && fileBuffer.slice(0, 5).toString('utf8') === '%PDF-';
  const mimetype = isPdf ? 'application/pdf' : 'image/jpeg';

  let billOfSaleInfo = await extractVehicleInfo(fileBuffer, mimetype, 'sale');
  if (!billOfSaleInfo || !billOfSaleInfo.vin) {
    const fallbackInfo = await extractVehicleInfo(fileBuffer, mimetype, '');
    billOfSaleInfo = mergeExtractionInfo(billOfSaleInfo, fallbackInfo);
  }
  billOfSaleInfo = sanitizeVehicleIdentity(billOfSaleInfo || {});

  const rawBillText = await extractText(fileBuffer, mimetype);
  const dispositionFallback = extractDispositionDetailsFromText(rawBillText);
  for (const key of ['disposedTo', 'disposedAddress', 'disposedCity', 'disposedState', 'disposedZip']) {
    if (dispositionFallback[key]) billOfSaleInfo[key] = dispositionFallback[key];
  }
  const saleTotal = extractTotalFromText(rawBillText, 'sale');
  if (isReasonableVehicleAmount(saleTotal)) {
    billOfSaleInfo.disposedPrice = saleTotal;
  }

  const extractedVin = billOfSaleInfo.vin;
  if (!extractedVin) {
    throw new Error(`VIN not found in bill of sale: ${filename}`);
  }

  const customerName = cleanDispositionName(billOfSaleInfo.disposedTo) || 'Unknown Customer';
  billOfSaleInfo.disposedTo = customerName !== 'Unknown Customer' ? customerName : '';

  // Match VIN in inventory
  let vehicle = await prisma.vehicle.findFirst({
    where: { vin: extractedVin, dealershipId: DEALERSHIP_ID },
    include: { 
      purchase: true,
      repairs: true,
      sale: true
    }
  });

  let matchedVia = 'Exact Match';

  if (!vehicle) {
    const allVehicles = await prisma.vehicle.findMany({
      where: { dealershipId: DEALERSHIP_ID },
      include: { purchase: true, repairs: true, sale: true }
    });
    
    const cleanUpper = (str) => String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cleanExtVin = cleanUpper(extractedVin);
    const cleanTitle = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const extTitleClean = cleanTitle(billOfSaleInfo.titleNumber);

    // 1. Normalized exact match check
    for (const v of allVehicles) {
      if (cleanUpper(v.vin) === cleanExtVin && cleanExtVin.length > 0) {
        vehicle = v;
        matchedVia = 'Exact Match (Normalized)';
        break;
      }
    }

    if (!vehicle) {
      const candidates = [];
      for (const v of allVehicles) {
        const cleanV = cleanUpper(v.vin);
        const dist = levenshteinDistance(cleanV, cleanExtVin);
        const vTitleClean = cleanTitle(v.titleNumber);
        
        let score = 0;
        let tempMatchedVia = 'Exact Match';
        
        if (extTitleClean && vTitleClean && extTitleClean === vTitleClean && extTitleClean.length > 3) {
          score = 9;
          tempMatchedVia = `Title Number Match (${v.titleNumber})`;
        } else if (dist === 0) {
          score = 10;
        } else if (cleanV.length >= 6 && cleanExtVin.length >= 6 && cleanV.endsWith(cleanExtVin.slice(-6))) {
          score = 8;
          tempMatchedVia = `Serial Number Match (${v.vin.slice(-6)})`;
        } else if (cleanV.length >= 6 && cleanExtVin.length >= 6 && levenshteinDistance(cleanV.slice(-6), cleanExtVin.slice(-6)) <= 2) {
          score = 7.5;
          tempMatchedVia = `Fuzzy Serial Number Match (${v.vin.slice(-6)} vs ${extractedVin.slice(-6)})`;
        } else if (dist <= 4) {
          score = 6;
          tempMatchedVia = `Fuzzy Edit Distance Match (dist: ${dist})`;
        } else if (cleanV.includes(cleanExtVin) || cleanExtVin.includes(cleanV)) {
          score = 4;
          tempMatchedVia = 'Substring Subset Match';
        }
        
        if (score > 0) {
          candidates.push({ vehicle: v, score, dist, status: v.status, matchedVia: tempMatchedVia });
        }
      }
      
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.status === 'Available' && b.status !== 'Available') return -1;
        if (b.status === 'Available' && a.status !== 'Available') return 1;
        return a.dist - b.dist;
      });
      
      if (candidates.length > 0 && candidates[0].score >= 6) {
        vehicle = candidates[0].vehicle;
        matchedVia = candidates[0].matchedVia;
        console.log(`[FuzzyMatch] ${extractedVin} matched to ${vehicle.vin} via ${matchedVia} (score: ${candidates[0].score})`);
      }
    }

    if (!vehicle) {
      // Fallback unique make/model search when there is exactly one available vehicle of this make/model in stock
      const extMake = String(billOfSaleInfo.make || '').toLowerCase().trim();
      const extModel = String(billOfSaleInfo.model || '').toLowerCase().trim();
      
      if (extMake && extModel) {
        let potentialVehicles = allVehicles.filter(v => 
          v.status === 'Available' &&
          String(v.make).toLowerCase().trim() === extMake &&
          String(v.model).toLowerCase().trim() === extModel
        );

        if (potentialVehicles.length === 0) {
          // Expand to any status if none is available, so long as it is the only one in the whole DB
          potentialVehicles = allVehicles.filter(v => 
            String(v.make).toLowerCase().trim() === extMake &&
            String(v.model).toLowerCase().trim() === extModel
          );
        }
        
        if (potentialVehicles.length === 1) {
          vehicle = potentialVehicles[0];
          matchedVia = `Fallback Unique Make/Model Match (${vehicle.make} ${vehicle.model})`;
          console.log(`[FuzzyMatch] ${extractedVin} matched to ${vehicle.vin} via Fallback Unique Make/Model`);
        }
      }
    }
    if (!vehicle) {
      // Create vehicle and acquisition purchase resiliently
      console.log(`Resiliently creating vehicle for missing VIN: ${extractedVin}`);
      const parsedSalePrice = parseCurrency(billOfSaleInfo.disposedPrice || billOfSaleInfo.purchasePrice);
      const purchasePrice = isReasonableVehicleAmount(parsedSalePrice) && parsedSalePrice > 3000 ? (parsedSalePrice - 3000) : 10000;
      
      vehicle = await prisma.vehicle.create({
        data: {
          vin: extractedVin,
          make: billOfSaleInfo.make || 'Unknown',
          model: billOfSaleInfo.model || 'Unknown',
          year: Number(billOfSaleInfo.year) || 2020,
          mileage: Number(billOfSaleInfo.mileage) || Number(billOfSaleInfo.disposedOdometer) || 0,
          color: billOfSaleInfo.color || 'Unknown',
          purchaseDate: billOfSaleInfo.disposedDate ? new Date(billOfSaleInfo.disposedDate) : new Date(),
          titleNumber: billOfSaleInfo.titleNumber || null,
          status: 'Sold',
          dealershipId: DEALERSHIP_ID,
          purchase: {
            create: {
              sellerName: billOfSaleInfo.purchasedFrom || 'Auction',
              sellerAddress: billOfSaleInfo.usedVehicleSourceAddress || '',
              sellerCity: billOfSaleInfo.usedVehicleSourceCity || '',
              sellerState: billOfSaleInfo.usedVehicleSourceState || '',
              sellerZip: billOfSaleInfo.usedVehicleSourceZipCode || '',
              purchasePrice,
              transportCost: 0,
              inspectionCost: 0,
              registrationCost: 0,
              totalPurchaseCost: purchasePrice,
              purchaseDate: billOfSaleInfo.disposedDate ? new Date(billOfSaleInfo.disposedDate) : new Date(),
              paymentMethod: 'Bank Transfer',
              dealershipId: DEALERSHIP_ID
            }
          }
        },
        include: {
          purchase: true,
          repairs: true,
          sale: true
        }
      });
    }
  }

  // Update vehicle status
  await prisma.vehicle.update({
    where: { id: vehicle.id, dealershipId: DEALERSHIP_ID },
    data: { status: 'Sold' }
  });

  // Create Sale record
  let salePrice = parseCurrency(billOfSaleInfo.disposedPrice || billOfSaleInfo.purchasePrice);
  const purchaseCost = vehicle.purchase?.totalPurchaseCost || 0;
  if (!isReasonableVehicleAmount(salePrice)) {
    salePrice = purchaseCost > 0 ? (purchaseCost + 3000) : 15000;
  }
  const repairCost = vehicle.repairs?.reduce((acc, r) => acc + (r.partsCost || 0) + (r.laborCost || 0), 0) || 0;
  const profit = salePrice - purchaseCost - repairCost;

  if (!vehicle.sale) {
    await prisma.sale.create({
      data: {
        vehicleId: vehicle.id,
        customerName: customerName,
        phone: 'N/A',
        address: [
          billOfSaleInfo.disposedAddress,
          billOfSaleInfo.disposedCity,
          billOfSaleInfo.disposedState,
          billOfSaleInfo.disposedZip
        ].filter(Boolean).join(', ') || 'N/A',
        driverLicense: billOfSaleInfo.disposedDlNumber || null,
        saleDate: billOfSaleInfo.disposedDate ? new Date(billOfSaleInfo.disposedDate) : new Date(),
        salePrice,
        paymentMethod: 'Cash',
        profit,
        billOfSaleBase64: fileBuffer.toString('base64'),
        hasBillOfSale: true,
        dealershipId: DEALERSHIP_ID
      }
    });
  }

  // Generate disposition PDF and update DocumentRegistry
  const existingEntry = await findFuzzyRegistryEntry(extractedVin, 'Used Vehicle Record');
  const mergedInfo = {
    vin: vehicle.vin,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    color: vehicle.color,
    mileage: vehicle.mileage,
    titleNumber: vehicle.titleNumber || '',
    purchasedFrom: vehicle.purchase?.sellerName || '',
    purchaseDate: vehicle.purchaseDate?.toISOString() || vehicle.purchase?.purchaseDate?.toISOString(),
    purchasePrice: vehicle.purchase?.purchasePrice || 0,
    usedVehicleSourceAddress: vehicle.purchase?.sellerAddress || '',
    usedVehicleSourceCity: vehicle.purchase?.sellerCity || '',
    usedVehicleSourceState: vehicle.purchase?.sellerState || '',
    usedVehicleSourceZipCode: vehicle.purchase?.sellerZip || '',
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

  const filledPdf = await fillUsedVehiclePdf(cachedTemplateBuffer, mergedInfo, 'image/jpeg');

  if (existingEntry) {
    await prisma.documentRegistry.updateMany({
      where: { id: existingEntry.id, dealershipId: DEALERSHIP_ID },
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
        documentBase64: filledPdf
      }
    });

    // Cleanup registry duplicates
    await prisma.documentRegistry.deleteMany({
      where: {
        vin: { in: [extractedVin, existingEntry.vin] },
        documentType: 'Used Vehicle Record',
        dealershipId: DEALERSHIP_ID,
        id: { not: existingEntry.id }
      }
    });
  } else {
    await prisma.documentRegistry.create({
      data: {
        vin: extractedVin,
        make: vehicle.make,
        model: vehicle.model,
        year: String(vehicle.year),
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
        sourceFileName: filename,
        sourceDocumentBase64: fileBuffer.toString('base64'),
        dealershipId: DEALERSHIP_ID
      }
    });
  }

  // Update original purchase generated record
  if (vehicle.purchase) {
    await prisma.purchase.updateMany({
      where: { id: vehicle.purchase.id, dealershipId: DEALERSHIP_ID },
      data: { documentBase64: filledPdf }
    });
  }
}

async function processSequential(files, dirPath, processFunc) {
  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filepath = path.join(dirPath, filename);
    const start = Date.now();
    console.log(`[${i + 1}/${files.length}] Processing file: ${filename}...`);
    
    try {
      await processFunc(filename, filepath);
      console.log(`  => SUCCESS (took ${((Date.now() - start) / 1000).toFixed(2)} seconds)`);
    } catch (err) {
      console.error(`  => FAILED: ${err.message} (took ${((Date.now() - start) / 1000).toFixed(2)} seconds)`);
    }
  }
}

async function main() {
  console.log('=== High-Speed Sequential Push Starting ===');
  const startTotal = Date.now();

  // 1. Wipe database to start fresh
  await wipeData();

  // 2. Process BUY documents
  const buyDir = 'c:/Users/SREER/Documents/indra/auto-profit-hub-main/public/buy';
  const buyFiles = fs.readdirSync(buyDir).filter(f => fs.statSync(path.join(buyDir, f)).isFile());
  console.log(`\nFound ${buyFiles.length} buy documents. Starting high-speed sequential ingest...`);
  await processSequential(buyFiles, buyDir, processBuyDocument);

  // 3. Process SALE documents
  const saleDir = 'c:/Users/SREER/Documents/indra/auto-profit-hub-main/public/sale';
  const saleFiles = fs.readdirSync(saleDir).filter(f => fs.statSync(path.join(saleDir, f)).isFile());
  console.log(`\nFound ${saleFiles.length} sale documents. Starting high-speed sequential ingest...`);
  await processSequential(saleFiles, saleDir, processSaleDocument);

  console.log('\n=== High-Speed Push Completed ===');
  console.log(`Total time elapsed: ${((Date.now() - startTotal) / 1000).toFixed(2)} seconds`);

  // Print final summary
  const vehicleCount = await prisma.vehicle.count();
  const documentCount = await prisma.documentRegistry.count();
  const saleCount = await prisma.sale.count();
  const purchaseCount = await prisma.purchase.count();

  console.log(`\n--- Verification Summary ---`);
  console.log('Dealership ID: broadway auto sales');
  console.log(`Vehicles in Database: ${vehicleCount}`);
  console.log(`Documents in Registry: ${documentCount}`);
  console.log(`Purchases Created: ${purchaseCount}`);
  console.log(`Sales Created: ${saleCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
