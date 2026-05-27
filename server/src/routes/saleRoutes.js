import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeManagerOrAdmin } from '../middlewares/authMiddleware.js';
import { validate, saleSchema } from '../utils/validators.js';

import { salesCache, vehicleCache } from '../utils/cache.js';

import multer from 'multer';
import { readFile } from 'fs/promises';
import { fillUsedVehiclePdf } from '../../services/usedVehiclePdfService.js';
const upload = multer({ storage: multer.memoryStorage() });

const defaultUsedVehicleTemplatePath = new URL('../../used-vechile-report.jpeg', import.meta.url);

const router = express.Router();
const META_PREFIX = 'APH_CUSTOMER_META:';

function getBasePurchaseCost(purchase) {
  if (!purchase) return 0;
  return (Number(purchase.purchasePrice) || 0)
    + (Number(purchase.transportCost) || 0)
    + (Number(purchase.buyerFee) || 0)
    + (Number(purchase.inspectionCost) || 0)
    + (Number(purchase.registrationCost) || 0);
}

function buildCustomerNotes(meta) {
  return `${META_PREFIX}${JSON.stringify(meta)}`;
}

function splitCustomerName(customerName = '') {
  const parts = String(customerName).trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'Unknown',
    lastName: parts.slice(1).join(' ') || null
  };
}

function parseAddress(address = '') {
  const parts = String(address).split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 4) {
    const zip = parts.pop() || null;
    const state = parts.pop() || null;
    const city = parts.pop() || null;
    return { address: parts.join(', ') || null, city, state, zip };
  }
  if (parts.length === 3) {
    const city = parts[0] || null;
    const state = parts[1] || null;
    const zip = parts[2] || null;
    return { address: String(address).trim() || null, city, state, zip };
  }
  return { address: String(address).trim() || null, city: null, state: null, zip: null };
}

async function upsertCustomerFromSale(tx, req, saleData) {
  const { firstName, lastName } = splitCustomerName(saleData.customerName);
  const addressParts = parseAddress(saleData.address);
  const email = saleData.email ? String(saleData.email).trim() : null;
  const phone = saleData.phone ? String(saleData.phone).trim() : null;

  const existing = await tx.customer.findFirst({
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
    return tx.customer.update({
      where: { id: existing.id },
      data: Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null && value !== ''))
    });
  }

  return tx.customer.create({ data });
}

// Allow all authenticated users, but we will mask data for STAFF
// router.use(authenticateToken); // Redundant, handled by app.js

router.get('/', async (req, res, next) => {
  try {
    const cacheKey = `sales-list:${req.dealershipId}`;
    const cachedData = salesCache.get(cacheKey);
    if (cachedData) return res.json(cachedData);

    const sales = await prisma.sale.findMany({
      where: { dealershipId: req.dealershipId },
      select: {
        id: true,
        vehicleId: true,
        customerName: true,
        salePrice: true,
        saleDate: true,
        profit: true,
        paymentMethod: true,
        hasBillOfSale: true,
        address: true,
        phone: true,
        createdAt: true,
        // billOfSaleBase64 EXCLUDED for performance
        vehicle: {
          include: { 
            purchase: {
              select: {
                id: true,
                sellerName: true,
                purchasePrice: true,
                buyerFee: true,
                transportCost: true,
                inspectionCost: true,
                registrationCost: true,
                totalPurchaseCost: true,
                purchaseDate: true,
                // base64 strings EXCLUDED
              }
            }, 
            repairs: true 
          }
        } 
      },
      orderBy: [
        { saleDate: 'desc' },
        { createdAt: 'desc' }
      ]
    });
    
    const isStaff = req.user.role === 'STAFF';
    
    // Mask profit for staff
    const processedSales = sales.map(s => {
      const hasBillOfSale = s.hasBillOfSale || false;
      const normalizedPurchase = s.vehicle?.purchase
        ? {
            ...s.vehicle.purchase,
            totalPurchaseCost: getBasePurchaseCost(s.vehicle.purchase)
          }
        : s.vehicle?.purchase;
      
      if (isStaff) {
        const { profit, ...rest } = s;
        return {
          ...rest,
          vehicle: rest.vehicle ? { ...rest.vehicle, purchase: normalizedPurchase } : rest.vehicle,
          profit: 0,
          hasBillOfSale
        };
      }
      return {
        ...s,
        vehicle: s.vehicle ? { ...s.vehicle, purchase: normalizedPurchase } : s.vehicle,
        hasBillOfSale
      };
    });

    // Safety net: if old duplicate records exist, keep only the latest sale for each vehicle.
    const dedupedSales = [];
    const seenVehicleIds = new Set();
    for (const sale of processedSales) {
      if (seenVehicleIds.has(sale.vehicleId)) continue;
      seenVehicleIds.add(sale.vehicleId);
      dedupedSales.push(sale);
    }

    salesCache.set(cacheKey, dedupedSales);
    res.json(dedupedSales);
  } catch (err) {
    next(err);
  }
});

router.post('/', upload.single('file'), validate(saleSchema), async (req, res, next) => {
  try {
    const { vehicleId, saleDate, salePrice, customerName, email, phone, address, paymentMethod, ...loanDetails } = req.body;
    
    // Fetch vehicle with all costs for profit calculation
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, dealershipId: req.dealershipId },
      include: { purchase: true, repairs: true }
    });

    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

    const totalPurchaseCost = getBasePurchaseCost(vehicle.purchase);
    const totalRepairCost = vehicle.repairs.reduce((sum, r) => sum + r.partsCost + r.laborCost, 0);
    
    // Profit = Sale Price - Purchase Cost - Repair Cost
    const profit = salePrice - totalPurchaseCost - totalRepairCost;

    const sale = await prisma.$transaction(async (tx) => {
      const s = await tx.sale.upsert({
        where: { vehicleId },
        create: {
          customerName,
          phone,
          address,
          saleDate: new Date(saleDate),
          salePrice,
          paymentMethod,
          profit,
          vehicleId,
          createdById: req.user.id,
          dealershipId: req.dealershipId,
          hasBillOfSale: !!req.file,
          billOfSaleBase64: req.file ? req.file.buffer.toString('base64') : undefined,
          ...loanDetails
        },
        update: {
          customerName,
          phone,
          address,
          saleDate: new Date(saleDate),
          salePrice,
          paymentMethod,
          profit,
          hasBillOfSale: !!req.file || undefined,
          billOfSaleBase64: req.file ? req.file.buffer.toString('base64') : undefined,
          ...loanDetails
        }
      });
      await tx.vehicle.update({
        where: { id: vehicleId, dealershipId: req.dealershipId },
        data: { status: 'Sold' }
      });
      await upsertCustomerFromSale(tx, req, {
        customerName,
        email,
        phone,
        address,
        driverLicense: loanDetails.driverLicense,
        vehicleId,
        vehicleLabel: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin
      });

      // ── Step 3: Regenerate Used Vehicle Record PDF with Disposition Data ──
      try {
        const fullVehicle = await tx.vehicle.findFirst({
          where: { id: vehicleId, dealershipId: req.dealershipId },
          include: { purchase: true, sale: { where: { id: s.id } } }
        });

        if (fullVehicle && fullVehicle.purchase) {
          const templateBuffer = await readFile(defaultUsedVehicleTemplatePath);
          
          const registryEntry = await tx.documentRegistry.findFirst({
            where: { 
              vin: fullVehicle.vin, 
              documentType: 'Used Vehicle Record',
              dealershipId: req.dealershipId 
            },
            orderBy: { createdAt: 'desc' }
          });

          let parsedCity = '', parsedState = '', parsedZip = '';
          const addr = fullVehicle.sale?.address || '';
          const addrParts = addr.split(',').map(p => p.trim());
          if (addrParts.length >= 3) {
            parsedZip = addrParts.pop() || '';
            parsedState = addrParts.pop() || '';
            parsedCity = addrParts.pop() || '';
          }

          const pdfInfo = {
            vin: fullVehicle.vin,
            make: fullVehicle.make,
            model: fullVehicle.model,
            year: fullVehicle.year,
            color: fullVehicle.color,
            mileage: fullVehicle.mileage,
            titleNumber: fullVehicle.titleNumber || registryEntry?.titleNumber || '',
            purchaseDate: fullVehicle.purchaseDate,
            purchasedFrom: fullVehicle.purchase.sellerName,
            usedVehicleSourceAddress: fullVehicle.purchase.sellerAddress,
            usedVehicleSourceCity: fullVehicle.purchase.sellerCity,
            usedVehicleSourceState: fullVehicle.purchase.sellerState,
            usedVehicleSourceZipCode: fullVehicle.purchase.sellerZip,
            purchasePrice: fullVehicle.purchase.purchasePrice,
            disposedTo: fullVehicle.sale?.customerName || '',
            disposedAddress: addrParts.join(', ') || addr,
            disposedCity: parsedCity,
            disposedState: parsedState,
            disposedZip: parsedZip,
            disposedDate: fullVehicle.sale?.saleDate,
            disposedPrice: fullVehicle.sale?.salePrice,
            disposedOdometer: fullVehicle.mileage, 
            disposedDlNumber: fullVehicle.sale?.driverLicense || '',
            paymentMethod: fullVehicle.sale?.paymentMethod || '',
          };

          const newPdfBase64 = await fillUsedVehiclePdf(templateBuffer, pdfInfo, 'image/jpeg');

          await tx.purchase.update({
            where: { id: fullVehicle.purchase.id },
            data: { documentBase64: newPdfBase64 }
          });

          if (registryEntry) {
            await tx.documentRegistry.update({
              where: { id: registryEntry.id },
              data: {
                disposedTo: String(fullVehicle.sale?.customerName || ''),
                disposedAddress: String(pdfInfo.disposedAddress),
                disposedCity: String(pdfInfo.disposedCity),
                disposedState: String(pdfInfo.disposedState),
                disposedZip: String(pdfInfo.disposedZip),
                disposedDate: fullVehicle.sale?.saleDate ? String(fullVehicle.sale.saleDate) : null,
                disposedPrice: String(fullVehicle.sale?.salePrice || ''),
                documentBase64: newPdfBase64
              }
            });
          }
        }
      } catch (pdfErr) {
        console.error('[Sale PDF Update] Failed to regenerate record:', pdfErr);
      }

      return s;
    });

    const sCacheKey = `sales-list:${req.dealershipId}`;
    const vCacheKey = `vehicle-list:${req.dealershipId}`;
    salesCache.delete(sCacheKey);
    vehicleCache.delete(vCacheKey); // Invalidate inventory as well
    res.status(201).json(sale);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authorizeManagerOrAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { salePrice, saleDate, customerName, email, phone, address, paymentMethod, driverLicense } = req.body;

    const existingSale = await prisma.sale.findFirst({
      where: { id, dealershipId: req.dealershipId },
      include: { 
        vehicle: {
          include: { purchase: true, repairs: true }
        }
      }
    });

    if (!existingSale) return res.status(404).json({ message: 'Sale not found' });

    let profit = existingSale.profit;
    if (salePrice !== undefined) {
      const vehicle = existingSale.vehicle;
      const totalPurchaseCost = getBasePurchaseCost(vehicle.purchase);
      const totalRepairCost = vehicle.repairs.reduce((sum, r) => sum + r.partsCost + r.laborCost, 0);
      profit = Number(salePrice) - totalPurchaseCost - totalRepairCost;
    }

    const updateResult = await prisma.$transaction(async (tx) => {
      const result = await tx.sale.updateMany({
        where: { id, dealershipId: req.dealershipId },
        data: {
          salePrice: salePrice !== undefined ? Number(salePrice) : undefined,
          saleDate: saleDate ? new Date(saleDate) : undefined,
          customerName,
          phone,
          address,
          paymentMethod,
          profit
        }
      });

      if (result.count > 0 && (customerName || phone || address || email || driverLicense)) {
        await upsertCustomerFromSale(tx, req, {
          customerName: customerName || existingSale.customerName,
          email,
          phone: phone || existingSale.phone,
          address: address || existingSale.address,
          driverLicense: driverLicense || existingSale.driverLicense,
          vehicleId: existingSale.vehicleId,
          vehicleLabel: [existingSale.vehicle.year, existingSale.vehicle.make, existingSale.vehicle.model].filter(Boolean).join(' ') || existingSale.vehicle.vin
        });
      }

      return result;
    });

    if (updateResult.count === 0) return res.status(404).json({ message: 'Sale not found' });
    const updatedSale = await prisma.sale.findUnique({ where: { id } });

    const sCacheKey = `sales-list:${req.dealershipId}`;
    const vCacheKey = `vehicle-list:${req.dealershipId}`;
    salesCache.delete(sCacheKey);
    vehicleCache.delete(vCacheKey);

    // ── Step 4: Regenerate Used Vehicle Record PDF ──
    try {
      const fullVehicle = await prisma.vehicle.findFirst({
        where: { id: updatedSale.vehicleId, dealershipId: req.dealershipId },
        include: { purchase: true, sale: true }
      });

      if (fullVehicle && fullVehicle.purchase) {
        const templateBuffer = await readFile(defaultUsedVehicleTemplatePath);
        const registryEntry = await prisma.documentRegistry.findFirst({
          where: { 
            vin: fullVehicle.vin, 
            documentType: 'Used Vehicle Record',
            dealershipId: req.dealershipId
          },
          orderBy: { createdAt: 'desc' }
        });

        let parsedCity = '', parsedState = '', parsedZip = '';
        const addr = fullVehicle.sale?.address || '';
        const addrParts = addr.split(',').map(p => p.trim());
        if (addrParts.length >= 3) {
          parsedZip = addrParts.pop() || '';
          parsedState = addrParts.pop() || '';
          parsedCity = addrParts.pop() || '';
        }

        const pdfInfo = {
          vin: fullVehicle.vin,
          make: fullVehicle.make,
          model: fullVehicle.model,
          year: fullVehicle.year,
          color: fullVehicle.color,
          mileage: fullVehicle.mileage,
          titleNumber: fullVehicle.titleNumber || registryEntry?.titleNumber || '',
          purchaseDate: fullVehicle.purchaseDate,
          purchasedFrom: fullVehicle.purchase.sellerName,
          usedVehicleSourceAddress: fullVehicle.purchase.sellerAddress,
          usedVehicleSourceCity: fullVehicle.purchase.sellerCity,
          usedVehicleSourceState: fullVehicle.purchase.sellerState,
          usedVehicleSourceZipCode: fullVehicle.purchase.sellerZip,
          purchasePrice: fullVehicle.purchase.purchasePrice,
          disposedTo: fullVehicle.sale?.customerName || '',
          disposedAddress: addrParts.join(', ') || addr,
          disposedCity: parsedCity,
          disposedState: parsedState,
          disposedZip: parsedZip,
          disposedDate: fullVehicle.sale?.saleDate,
          disposedPrice: fullVehicle.sale?.salePrice,
          disposedOdometer: fullVehicle.mileage,
          disposedDlNumber: fullVehicle.sale?.driverLicense || '',
          paymentMethod: fullVehicle.sale?.paymentMethod || '',
        };

        const newPdfBase64 = await fillUsedVehiclePdf(templateBuffer, pdfInfo, 'image/jpeg');

        await prisma.purchase.update({
          where: { id: fullVehicle.purchase.id },
          data: { documentBase64: newPdfBase64 }
        });

        if (registryEntry) {
          await prisma.documentRegistry.update({
            where: { id: registryEntry.id },
            data: {
              disposedTo: String(fullVehicle.sale?.customerName || ''),
              disposedAddress: String(pdfInfo.disposedAddress),
              disposedCity: String(pdfInfo.disposedCity),
              disposedState: String(pdfInfo.disposedState),
              disposedZip: String(pdfInfo.disposedZip),
              disposedDate: fullVehicle.sale?.saleDate ? String(fullVehicle.sale.saleDate) : null,
              disposedPrice: String(fullVehicle.sale?.salePrice || ''),
              documentBase64: newPdfBase64
            }
          });
        }
      }
    } catch (err) {
      console.error('[Sale Update PDF] Error:', err);
    }

    res.json(updatedSale);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authorizeManagerOrAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const sale = await prisma.sale.findFirst({
      where: { id, dealershipId: req.dealershipId },
      select: { vehicleId: true }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale record not found' });
    }

    await prisma.$transaction([
      // 1. Delete the sale record
      prisma.sale.deleteMany({ where: { id, dealershipId: req.dealershipId } }),
      // 2. Move vehicle back to Available
      prisma.vehicle.updateMany({
        where: { id: sale.vehicleId, dealershipId: req.dealershipId },
        data: { status: 'Available' }
      })
    ]);

    // ── Step 3: Regenerate Used Vehicle Record (Clear Disposition) ──
    try {
      const fullVehicle = await prisma.vehicle.findFirst({
        where: { id: sale.vehicleId, dealershipId: req.dealershipId },
        include: { purchase: true }
      });

      if (fullVehicle && fullVehicle.purchase) {
        const templateBuffer = await readFile(defaultUsedVehicleTemplatePath);
        const registryEntry = await prisma.documentRegistry.findFirst({
          where: { 
            vin: fullVehicle.vin, 
            documentType: 'Used Vehicle Record',
            dealershipId: req.dealershipId
          },
          orderBy: { createdAt: 'desc' }
        });

        const pdfInfo = {
          vin: fullVehicle.vin,
          make: fullVehicle.make,
          model: fullVehicle.model,
          year: fullVehicle.year,
          color: fullVehicle.color,
          mileage: fullVehicle.mileage,
          titleNumber: fullVehicle.titleNumber || registryEntry?.titleNumber || '',
          purchaseDate: fullVehicle.purchaseDate,
          purchasedFrom: fullVehicle.purchase.sellerName,
          usedVehicleSourceAddress: fullVehicle.purchase.sellerAddress,
          usedVehicleSourceCity: fullVehicle.purchase.sellerCity,
          usedVehicleSourceState: fullVehicle.purchase.sellerState,
          usedVehicleSourceZipCode: fullVehicle.purchase.sellerZip,
          purchasePrice: fullVehicle.purchase.purchasePrice,
          // Clear disposition fields
          disposedTo: '',
          disposedAddress: '',
          disposedCity: '',
          disposedState: '',
          disposedZip: '',
          disposedDate: null,
          disposedPrice: 0,
          disposedOdometer: 0,
          disposedDlNumber: '',
          paymentMethod: '',
        };

        const newPdfBase64 = await fillUsedVehiclePdf(templateBuffer, pdfInfo, 'image/jpeg');

        await prisma.purchase.update({
          where: { id: fullVehicle.purchase.id },
          data: { documentBase64: newPdfBase64 }
        });

        if (registryEntry) {
          await prisma.documentRegistry.update({
            where: { id: registryEntry.id },
            data: {
              disposedTo: '',
              disposedAddress: '',
              disposedCity: '',
              disposedState: '',
              disposedZip: '',
              disposedDate: null,
              disposedPrice: '',
              documentBase64: newPdfBase64
            }
          });
        }
      }
    } catch (err) {
      console.error('[Sale Delete PDF] Error:', err);
    }

    // 3. Clear caches
    const sCacheKey = `sales-list:${req.dealershipId}`;
    const vCacheKey = `vehicle-list:${req.dealershipId}`;
    salesCache.delete(sCacheKey);
    vehicleCache.delete(vCacheKey);

    res.json({ message: 'Sale deleted and vehicle reverted to Available status.' });
  } catch (err) {
    console.error('[Sale Delete Error]', err);
    next(err);
  }
});

export default router;
