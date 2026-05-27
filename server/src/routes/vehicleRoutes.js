import express from 'express';
import multer from 'multer';
import { readFile } from 'fs/promises';
import prisma from '../db/prisma.js';
import { authorizeAdmin } from '../middlewares/authMiddleware.js';
import { validate, vehicleSchema } from '../utils/validators.js';
import { vehicleCache } from '../utils/cache.js';
import { fillUsedVehiclePdf } from '../../services/usedVehiclePdfService.js';
import { decodeVin, fetchRecalls } from '../services/vinDecoder.js';

const upload = multer({ storage: multer.memoryStorage() });

const defaultUsedVehicleTemplatePath = new URL('../../used-vechile-report.jpeg', import.meta.url);

const router = express.Router();

function getBasePurchaseCost(purchase) {
  if (!purchase) return 0;
  return (Number(purchase.purchasePrice) || 0)
    + (Number(purchase.transportCost) || 0)
    + (Number(purchase.buyerFee) || 0)
    + (Number(purchase.inspectionCost) || 0)
    + (Number(purchase.registrationCost) || 0);
}

// NHTSA VIN Decode — must come before /:id routes to avoid param conflicts
router.get('/vin-decode/:vin', async (req, res, next) => {
  try {
    const vin = req.params.vin?.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!vin || vin.length !== 17) {
      return res.status(400).json({ message: 'VIN must be exactly 17 characters.' });
    }
    const decoded = await decodeVin(vin);
    // Also try to fetch recalls
    let recalls = [];
    if (decoded.make && decoded.model && decoded.year) {
      try { recalls = await fetchRecalls(decoded.make, decoded.model, decoded.year); } catch (e) { /* ignore recall errors */ }
    }
    res.json({ ...decoded, recalls });
  } catch (err) {
    next(err);
  }
});

// Document download - accepts token via query param for direct browser navigation
router.get('/:id/document', async (req, res, next) => {
  try {
    // Request is already authenticated in app.js (header or token query param).
    // Scope by dealership to prevent cross-tenant document access.
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId },
      include: { purchase: true, sale: true }
    });

    if (!vehicle || !vehicle.purchase) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    const docType = req.query.type; // 'source', 'bill_of_sale' (or legacy 'sale'), or default 'report'
    let base64;
    let prefix;
    let extension = 'pdf';

    if (docType === 'source') {
      base64 = vehicle.purchase.sourceDocumentBase64;
      prefix = 'Source_';
      // Basic detect for image vs pdf based on base64 magic number
      extension = base64?.startsWith('JVBER') ? 'pdf' : 'jpg';
    } else if (docType === 'bill_of_sale' || docType === 'sale') {
      if (!vehicle.sale || !vehicle.sale.billOfSaleBase64) {
        return res.status(404).json({ message: 'Bill of Sale not found' });
      }
      base64 = vehicle.sale.billOfSaleBase64;
      prefix = 'BillOfSale_';
      extension = base64?.startsWith('JVBER') ? 'pdf' : 'jpg';
    } else {
      base64 = vehicle.purchase.documentBase64;
      prefix = 'Report_';
      extension = 'pdf';
    }

    if (!base64) {
      return res.status(404).json({ message: 'Requested document data not available' });
    }

    if (base64.includes('base64,')) {
      base64 = base64.split('base64,')[1];
    }

    const buffer = Buffer.from(base64, 'base64');
    
    const safeFileName = `${prefix}${vehicle.make}_${vehicle.model}_${(vehicle.vin || 'unk').slice(-4)}.${extension}`;
    const contentType = extension === 'pdf' ? 'application/pdf' : 'image/jpeg';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'Content-Disposition': `attachment; filename="${safeFileName}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Download-Options': 'noopen',
      'Content-Transfer-Encoding': 'binary'
    });
    
    res.end(buffer);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/data', async (req, res, next) => {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId },
      include: { purchase: true, sale: true }
    });
    
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
    
    let documentBase64 = vehicle.purchase?.documentBase64;
    let sourceDocumentBase64 = vehicle.purchase?.sourceDocumentBase64;
    
    // Fallback: If data missing in purchase record, look in DocumentRegistry by VIN
    // Only fallback if the VIN looks like a real VIN (not a short placeholder or AI template text)
    const isSuspiciousVin = !vehicle.vin || vehicle.vin.length < 11 || /exact 17-char/i.test(vehicle.vin);
    if ((!documentBase64 || !sourceDocumentBase64) && !isSuspiciousVin) {
      const registryEntry = await prisma.documentRegistry.findFirst({
        where: { 
          vin: vehicle.vin, 
          documentType: 'Used Vehicle Record',
          dealershipId: req.dealershipId
        },
        select: { documentBase64: true, sourceDocumentBase64: true },
        orderBy: { createdAt: 'desc' }
      });
      if (registryEntry) {
        if (!documentBase64) documentBase64 = registryEntry.documentBase64;
        if (!sourceDocumentBase64) sourceDocumentBase64 = registryEntry.sourceDocumentBase64;
      }
    }
    
    res.json({
      documentBase64,
      sourceDocumentBase64,
      billOfSaleBase64: vehicle.sale?.billOfSaleBase64
    });
  } catch (err) {
    console.error('[Vehicle Data Error]', err);
    next(err);
  }
});

router.get('/:id/all-documents', async (req, res, next) => {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId },
      include: { purchase: true, sale: true }
    });
    
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    const documents = [];

    // 1. Core Vehicle Documents (Purchase, Source, Sale)
    if (vehicle.purchase?.documentBase64) {
      documents.push({
        id: 'purchase-doc',
        type: 'Used Vehicle Record',
        name: `Used Vehicle Report - ${vehicle.make} ${vehicle.model}`,
        base64: vehicle.purchase.documentBase64,
        date: vehicle.purchase.purchaseDate,
        source: 'System'
      });
    }
    
    if (vehicle.purchase?.sourceDocumentBase64) {
      documents.push({
        id: 'purchase-source',
        type: 'Source Document',
        name: `Original Source Document`,
        base64: vehicle.purchase.sourceDocumentBase64,
        date: vehicle.purchase.purchaseDate,
        source: 'Purchase'
      });
    }

    if (vehicle.sale?.billOfSaleBase64) {
      documents.push({
        id: 'bill-of-sale',
        type: 'Bill of Sale',
        name: `Bill of Sale - ${vehicle.sale.customerName}`,
        base64: vehicle.sale.billOfSaleBase64,
        date: vehicle.sale.saleDate,
        source: 'Sale'
      });
    }

    if (vehicle.vin) {
      // 2. Document Registry
      const registryDocs = await prisma.documentRegistry.findMany({
        where: { vin: vehicle.vin, dealershipId: req.dealershipId },
        orderBy: { createdAt: 'desc' }
      });
      registryDocs.forEach(doc => {
        if (doc.documentBase64 && !documents.some(d => d.base64 === doc.documentBase64)) {
          documents.push({
            id: doc.id,
            type: doc.documentType || 'Registry Document',
            name: doc.sourceFileName || `${doc.documentType} - ${doc.createdAt.toISOString().split('T')[0]}`,
            base64: doc.documentBase64,
            date: doc.createdAt,
            source: 'Registry'
          });
        }
      });

      // 3. Insurance Policies
      const insurancePolicies = await prisma.insurancePolicy.findMany({
        where: { vin: vehicle.vin, dealershipId: req.dealershipId, documentBase64: { not: null } }
      });
      insurancePolicies.forEach(policy => {
        documents.push({
          id: policy.id,
          type: 'Insurance Policy',
          name: policy.sourceFileName || `Policy - ${policy.provider}`,
          base64: policy.documentBase64,
          date: policy.createdAt,
          source: 'Insurance'
        });
      });

      // 4. Warranty Contracts
      const warranties = await prisma.warrantyContract.findMany({
        where: { vin: vehicle.vin, dealershipId: req.dealershipId, documentBase64: { not: null } }
      });
      warranties.forEach(warranty => {
        documents.push({
          id: warranty.id,
          type: 'Warranty Contract',
          name: warranty.sourceFileName || `Warranty - ${warranty.warrantyCompany}`,
          base64: warranty.documentBase64,
          date: warranty.createdAt,
          source: 'Warranty'
        });
      });
    }

    res.json(documents);
  } catch (err) {
    console.error('[All Documents Fetch Error]', err);
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const cacheKey = `vehicle-list:${req.dealershipId}`;
    const cachedData = vehicleCache.get(cacheKey);
    if (cachedData) {
      console.log('[Cache] Returning cached vehicle list');
      return res.json(cachedData);
    }

    const vehicles = await prisma.vehicle.findMany({
      where: { dealershipId: req.dealershipId },
      orderBy: { createdAt: 'desc' },
      include: { 
        purchase: {
          select: {
            id: true,
            sellerName: true,
            sellerAddress: true,
            sellerCity: true,
            sellerState: true,
            sellerZip: true,
            purchasePrice: true,
            buyerFee: true,
            transportCost: true,
            inspectionCost: true,
            registrationCost: true,
            totalPurchaseCost: true,
            purchaseDate: true,
            paymentMethod: true,
          }
        },
        repairs: true,
        sale: {
          select: {
            id: true,
            customerName: true,
            salePrice: true,
            saleDate: true,
            profit: true,
            hasBillOfSale: true,
            paymentMethod: true,
          }
        } 
      }
    });

    const isStaff = req.user.role === 'STAFF';

    // Fetch VINs that have entries in DocumentRegistry for fallbacks
    const allVins = vehicles.map(v => v.vin).filter(Boolean);
    const registryEntries = await prisma.documentRegistry.findMany({
      where: { 
        vin: { in: allVins },
        dealershipId: req.dealershipId
      },
      select: { vin: true, documentType: true }
    });
    
    const vinsWithSource = new Set(registryEntries.map(e => e.vin));
    const vinsWithGeneratedRecord = new Set(
      registryEntries
        .filter(e => e.documentType === 'Used Vehicle Record')
        .map(e => e.vin)
    );

    const enrichedVehicles = vehicles.map(v => {
      const hasDocument = !!v.purchase?.documentBase64 || vinsWithGeneratedRecord.has(v.vin);
      const hasSourceDocument = !!v.purchase?.sourceDocumentBase64 || vinsWithSource.has(v.vin);
      const hasBillOfSale = !!v.sale?.hasBillOfSale;
      
      // Strip base64 strings
      const { documentBase64, sourceDocumentBase64, ...purchaseData } = v.purchase || {};
      
      // If Staff, mask financial data
      if (isStaff) {
        return {
          id: v.id,
          vin: v.vin,
          make: v.make,
          model: v.model,
          year: v.year,
          mileage: v.mileage,
          color: v.color,
          status: v.status,
          purchaseDate: v.purchaseDate,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
          hasDocument,
          hasSourceDocument,
          hasBillOfSale,
          // Hide all money fields for staff
          purchasePrice: 0,
          totalPurchaseCost: 0,
          inspectionCost: 0,
          registrationCost: 0,
          transportCost: 0,
          repairCost: 0,
          purchase: null,
          repairs: [],
          sale: v.sale ? { status: 'Sold' } : null // Only show THAT it is sold, not for how much
        };
      }

      return {
        ...v,
        purchase: v.purchase
          ? {
              ...purchaseData,
              totalPurchaseCost: getBasePurchaseCost(v.purchase)
            }
          : null,
        purchasePrice: v.purchase?.purchasePrice || 0,
        totalPurchaseCost: getBasePurchaseCost(v.purchase),
        inspectionCost: v.purchase?.inspectionCost || 0,
        registrationCost: v.purchase?.registrationCost || 0,
        transportCost: v.purchase?.transportCost || 0,
        repairCost: v.repairs.reduce((sum, r) => sum + r.partsCost + r.laborCost, 0),
        hasDocument,
        hasSourceDocument,
        hasBillOfSale,
      };
    });

    vehicleCache.set(cacheKey, enrichedVehicles);
    res.json(enrichedVehicles);
  } catch (err) {
    console.error('[Vehicles List Error]', {
      dealershipId: req.dealershipId,
      role: req.user?.role,
      message: err?.message,
    });
    // Keep UI alive even on query issues.
    res.json([]);
  }
});

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

router.post('/', validate(vehicleSchema), async (req, res, next) => {
  const { 
    vin, make, model, year, mileage, color, purchaseDate,
    purchasedFrom, sellerAddress, sellerCity, sellerState, sellerZip,
    purchasePrice, paymentMethod, transportCost, buyerFee,
    inspectionCost, registrationCost, repairCost, titleNumber, documentBase64, sourceDocumentBase64
  } = req.body;

  try {
    const normalizedVin = vin ? vin.toUpperCase().trim() : '';

    // Check if vehicle with this VIN already exists in THIS dealership (with fuzzy OCR matching)
    const existingVehicle = await findFuzzyVehicle(normalizedVin, req.dealershipId);

    if (existingVehicle) {
      return res.status(409).json({ 
        message: `Vehicle with VIN '${normalizedVin}' already exists in your inventory (matched existing VIN: ${existingVehicle.vin}).`,
        existingId: existingVehicle.id
      });
    }

    const totalPurchaseCost = purchasePrice + transportCost + buyerFee + inspectionCost + registrationCost;
    
    // Efficiently create the vehicle with nested relations
    const vehicle = await prisma.vehicle.create({
      data: {
        vin: normalizedVin,
        make,
        model,
        year,
        mileage,
        color,
        titleNumber: titleNumber || null,
        purchaseDate: new Date(purchaseDate),
        status: 'Available',
        createdById: req.user.id,
        dealershipId: req.dealershipId,
        purchase: {
          create: {
            sellerName: purchasedFrom,
            sellerAddress: sellerAddress || '',
            sellerCity: sellerCity || '',
            sellerState: sellerState || '',
            sellerZip: sellerZip || '',
            purchasePrice,
            buyerFee,
            transportCost,
            inspectionCost,
            registrationCost,
            totalPurchaseCost,
            purchaseDate: new Date(purchaseDate),
            paymentMethod,
            documentBase64,
            sourceDocumentBase64,
            dealershipId: req.dealershipId
          }
        },
        ...(repairCost > 0 && {
          repairs: {
            create: {
              repairShop: 'Initial Pre-Purchase Inspection/Repair',
              partsCost: repairCost,
              laborCost: 0,
              description: 'Initial repairs added during vehicle entry',
              repairDate: new Date(purchaseDate),
              dealershipId: req.dealershipId
            }
          }
        })
      },
      include: { purchase: true, repairs: true }
    });
    
    const cacheKey = `vehicle-list:${req.dealershipId}`;
    vehicleCache.delete(cacheKey); // Invalidate cache
    res.status(201).json(vehicle);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { 
      vin, make, model, year, mileage, color, status, purchaseDate,
      purchasedFrom, purchasePrice, paymentMethod, transportCost, buyerFee,
      inspectionCost, registrationCost, titleNumber,
      sellerAddress, sellerCity, sellerState, sellerZip
    } = req.body;

    const vehicleId = req.params.id;

    // 1. Update the Vehicle and Purchase records
    const updatedVehicle = await prisma.$transaction(async (tx) => {
      // Check for VIN conflicts if VIN is being updated
      if (vin) {
        const normalizedVin = vin.toUpperCase().trim();
        const existing = await tx.vehicle.findFirst({ 
          where: { vin: normalizedVin, dealershipId: req.dealershipId } 
        });
        if (existing && existing.id !== vehicleId) {
          throw new Error('VIN_CONFLICT');
        }
      }

      // Update Vehicle details
      await tx.vehicle.updateMany({
        where: { id: vehicleId, dealershipId: req.dealershipId },
        data: {
          ...(vin !== undefined && { vin: vin.toUpperCase().trim() }),
          ...(make !== undefined && { make }),
          ...(model !== undefined && { model }),
          ...(year !== undefined && { year: Number(year) }),
          ...(mileage !== undefined && { mileage: Number(mileage) }),
          ...(color !== undefined && { color }),
          ...(status !== undefined && { status }),
          ...(titleNumber !== undefined && { titleNumber: titleNumber || null }),
          ...(purchaseDate && { purchaseDate: new Date(purchaseDate) }),
        }
      });
      
      const v = await tx.vehicle.findUnique({
        where: { id: vehicleId },
        include: { purchase: true }
      });

      // Update Purchase details if provided
      if (v.purchase) {
        const pPrice = purchasePrice !== undefined ? Number(purchasePrice) : v.purchase.purchasePrice;
        const tCost = transportCost !== undefined ? Number(transportCost) : v.purchase.transportCost;
        const bFee = buyerFee !== undefined ? Number(buyerFee) : v.purchase.buyerFee;
        const iCost = inspectionCost !== undefined ? Number(inspectionCost) : v.purchase.inspectionCost;
        const rCost = registrationCost !== undefined ? Number(registrationCost) : v.purchase.registrationCost;
        const total = pPrice + tCost + bFee + iCost + rCost;

        await tx.purchase.update({
          where: { id: v.purchase.id },
          data: {
            ...(purchasedFrom !== undefined && { sellerName: purchasedFrom }),
            ...(sellerAddress !== undefined && { sellerAddress }),
            ...(sellerCity !== undefined && { sellerCity }),
            ...(sellerState !== undefined && { sellerState }),
            ...(sellerZip !== undefined && { sellerZip }),
            ...(purchasePrice !== undefined && { purchasePrice: pPrice }),
            ...(buyerFee !== undefined && { buyerFee: bFee }),
            ...(transportCost !== undefined && { transportCost: tCost }),
            ...(inspectionCost !== undefined && { inspectionCost: iCost }),
            ...(registrationCost !== undefined && { registrationCost: rCost }),
            totalPurchaseCost: total,
            ...(purchaseDate && { purchaseDate: new Date(purchaseDate) }),
            ...(paymentMethod !== undefined && { paymentMethod }),
          }
        });
      }

      return await tx.vehicle.findUnique({
        where: { id: vehicleId },
        include: { purchase: true, repairs: true, sale: true }
      });
    });

    // 2. Regenerate the PDF document
    try {
      if (updatedVehicle && updatedVehicle.purchase) {
        const templateBuffer = await readFile(defaultUsedVehicleTemplatePath);
        
        // Look up DocumentRegistry for granular disposition fields
        let registryEntry = null;
        if (updatedVehicle.vin) {
          registryEntry = await prisma.documentRegistry.findFirst({
            where: { 
              vin: updatedVehicle.vin, 
              documentType: 'Used Vehicle Record',
              dealershipId: req.dealershipId
            },
            orderBy: { createdAt: 'desc' }
          });
        }

        // Parse the combined Sale.address string into city/state/zip components
        let parsedCity = '', parsedState = '', parsedZip = '';
        if (updatedVehicle.sale?.address) {
          const parts = updatedVehicle.sale.address.split(',').map(p => p.trim());
          // Typical format: "121 WINSLOW AVE, Norwood, MA, 02062" or "Norwood, MA, 02062"
          if (parts.length >= 3) {
            parsedZip = parts[parts.length - 1] || '';
            parsedState = parts[parts.length - 2] || '';
            parsedCity = parts[parts.length - 3] || '';
          } else if (parts.length === 2) {
            parsedState = parts[1] || '';
            parsedCity = parts[0] || '';
          }
        }

        // Build the full address for disposition line (just the street part)
        let disposedStreetAddress = updatedVehicle.sale?.address || '';
        if (updatedVehicle.sale?.address) {
          const parts = updatedVehicle.sale.address.split(',').map(p => p.trim());
          // If there are 4+ parts, first part(s) are the street address
          if (parts.length >= 4) {
            disposedStreetAddress = parts.slice(0, parts.length - 3).join(', ');
          } else {
            disposedStreetAddress = parts[0] || '';
          }
        }

        // Prepare info object for the PDF service — merging all sources
        const pdfInfo = {
          // Vehicle identification
          vin: updatedVehicle.vin,
          make: updatedVehicle.make,
          model: updatedVehicle.model,
          year: updatedVehicle.year,
          color: updatedVehicle.color,
          mileage: updatedVehicle.mileage,
          titleNumber: updatedVehicle.titleNumber || registryEntry?.titleNumber || '',
          // Acquisition details
          purchaseDate: updatedVehicle.purchaseDate,
          purchasedFrom: updatedVehicle.purchase.sellerName,
          usedVehicleSourceAddress: updatedVehicle.purchase.sellerAddress,
          usedVehicleSourceCity: updatedVehicle.purchase.sellerCity,
          usedVehicleSourceState: updatedVehicle.purchase.sellerState,
          usedVehicleSourceZipCode: updatedVehicle.purchase.sellerZip,
          purchasePrice: updatedVehicle.purchase.purchasePrice,
          transportCost: updatedVehicle.purchase.transportCost,
          inspectionCost: updatedVehicle.purchase.inspectionCost,
          registrationCost: updatedVehicle.purchase.registrationCost,
          // Disposition details — prefer registry (granular) over parsed Sale address
          disposedTo: updatedVehicle.sale?.customerName || registryEntry?.disposedTo || '',
          disposedAddress: registryEntry?.disposedAddress || disposedStreetAddress || '',
          disposedCity: registryEntry?.disposedCity || parsedCity || '',
          disposedState: registryEntry?.disposedState || parsedState || '',
          disposedZip: registryEntry?.disposedZip || parsedZip || '',
          disposedDate: updatedVehicle.sale?.saleDate || (registryEntry?.disposedDate ? new Date(registryEntry.disposedDate) : null),
          disposedPrice: updatedVehicle.sale?.salePrice || Number(registryEntry?.disposedPrice) || 0,
          disposedOdometer: Number(registryEntry?.disposedOdometer) || 0,
          disposedDlNumber: updatedVehicle.sale?.driverLicense || registryEntry?.disposedDlNumber || '',
          disposedDlState: registryEntry?.disposedDlState || '',
          paymentMethod: updatedVehicle.sale?.paymentMethod || '',
        };

        const newPdfBase64 = await fillUsedVehiclePdf(templateBuffer, pdfInfo, 'image/jpeg');

        await prisma.purchase.update({
          where: { id: updatedVehicle.purchase.id },
          data: { documentBase64: newPdfBase64 }
        });
        
        console.log(`[Regenerate] PDF rebuilt successfully for vehicle ${vehicleId}`);
      }
    } catch (pdfErr) {
      console.error('[Regenerate] Failed to rebuild PDF:', pdfErr);
      // We don't fail the whole update if only PDF regeneration fails, 
      // but the user might notice the old PDF.
    }
    
    const cacheKey = `vehicle-list:${req.dealershipId}`;
    vehicleCache.delete(cacheKey); // Invalidate cache
    res.json(updatedVehicle);
  } catch (err) {
    if (err.message === 'VIN_CONFLICT') {
      return res.status(409).json({ message: 'A vehicle with this VIN already exists.' });
    }
    next(err);
  }
});

router.delete('/:id', authorizeAdmin, async (req, res, next) => {
  try {
    // Check ownership
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId }
    });
    
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    // Delete associated records in order, including customer notes
    await prisma.$transaction([
      prisma.customerNote.deleteMany({ where: { vehicleId: req.params.id, dealershipId: req.dealershipId } }),
      prisma.sale.deleteMany({ where: { vehicleId: req.params.id, dealershipId: req.dealershipId } }),
      prisma.purchase.deleteMany({ where: { vehicleId: req.params.id, dealershipId: req.dealershipId } }),
      prisma.repair.deleteMany({ where: { vehicleId: req.params.id, dealershipId: req.dealershipId } }),
      prisma.vehicle.deleteMany({ where: { id: req.params.id, dealershipId: req.dealershipId } })
    ]);
    
    const cacheKey = `vehicle-list:${req.dealershipId}`;
    vehicleCache.delete(cacheKey); // Invalidate cache
    res.json({ message: 'Vehicle deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
