import express from 'express';
import prisma from '../db/prisma.js';

import { fillUsedVehiclePdf } from '../../services/usedVehiclePdfService.js';
import { readFile } from 'fs/promises';

const router = express.Router();
const defaultUsedVehicleTemplatePath = new URL('../../used-vechile-report.jpeg', import.meta.url);

router.get('/', async (req, res, next) => {
  try {
    let allLogs = [];
    try {
      allLogs = await prisma.documentRegistry.findMany({
        where: { dealershipId: req.dealershipId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          vin: true,
          make: true,
          model: true,
          year: true,
          titleNumber: true,
          purchasedFrom: true,
          sellerAddress: true,
          sellerCity: true,
          sellerState: true,
          sellerZip: true,
          disposedTo: true,
          disposedPrice: true,
          disposedDate: true,
          documentType: true,
          sourceFileName: true,
          createdAt: true
        }
      });
    } catch (primaryErr) {
      // Fallback path: tolerate model shape drift and return minimal safe records.
      console.error('[Registry] primary query failed, using fallback', primaryErr?.message || primaryErr);
      const fallbackRows = await prisma.documentRegistry.findMany({
        where: { dealershipId: req.dealershipId },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });
      allLogs = fallbackRows.map((row) => ({
        id: row.id,
        vin: row.vin ?? null,
        make: row.make ?? null,
        model: row.model ?? null,
        year: row.year ?? null,
        titleNumber: row.titleNumber ?? null,
        purchasedFrom: row.purchasedFrom ?? null,
        sellerAddress: row.sellerAddress ?? null,
        sellerCity: row.sellerCity ?? null,
        sellerState: row.sellerState ?? null,
        sellerZip: row.sellerZip ?? null,
        disposedTo: row.disposedTo ?? null,
        disposedPrice: row.disposedPrice ?? null,
        disposedDate: row.disposedDate ?? null,
        documentType: row.documentType ?? 'Used Vehicle Record',
        sourceFileName: row.sourceFileName ?? null,
        createdAt: row.createdAt,
      }));
    }
    
    // De-duplicate: Keep only the latest entry for each (VIN + DocumentType) combination
    const uniqueLogsMap = new Map();
    
    allLogs.forEach(log => {
      const type = log.documentType || 'Used Vehicle Record';
      const key = `${log.vin}-${type}`;
      
      // Since it's ordered by createdAt DESC, the first one we see is the latest
      if (!uniqueLogsMap.has(key)) {
        uniqueLogsMap.set(key, {
          ...log,
          documentType: type
        });
      }
    });

    const logs = Array.from(uniqueLogsMap.values());
    console.log(`[Registry] Found ${allLogs.length} logs, returning ${logs.length} unique entries`);
    res.json(logs);
  } catch (err) {
    console.error('[Registry Error]', err);
    // Do not fail the UI completely; return safe empty list and log details server-side.
    res.json([]);
  }
});

router.get('/:id/data', async (req, res, next) => {
  try {
    const { id } = req.params;
    const log = await prisma.documentRegistry.findFirst({
      where: { id, dealershipId: req.dealershipId },
      select: { documentBase64: true, sourceDocumentBase64: true, vin: true }
    });
    
    if (!log) {
      return res.status(404).json({ message: 'Document log not found' });
    }
    
    // Also try to find a Bill of Sale associated with this VIN
    let billOfSaleBase64 = null;
    if (log.vin) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { vin: log.vin, dealershipId: req.dealershipId },
        include: { sale: true }
      });
      if (vehicle?.sale?.hasBillOfSale) {
        billOfSaleBase64 = vehicle.sale.billOfSaleBase64;
      }
    }
    
    res.json({
      ...log,
      billOfSaleBase64
    });
  } catch (err) {
    console.error('[Registry Data Error]', err);
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // 1. Get current log to ensure it exists and belongs to THIS dealership
    const currentLog = await prisma.documentRegistry.findFirst({
      where: { id, dealershipId: req.dealershipId }
    });

    if (!currentLog) {
      return res.status(404).json({ message: 'Document log not found' });
    }

    // 2. Perform updates in a transaction to maintain consistency
    const updatedLog = await prisma.$transaction(async (tx) => {
      // 2a. Update the DocumentRegistry entry
      const log = await tx.documentRegistry.update({
        where: { id },
        data: updates
      });

      // 2b. Sync to Vehicle record if VIN is present
      if (log.vin) {
        const vehicle = await tx.vehicle.findFirst({
          where: { vin: log.vin, dealershipId: req.dealershipId },
          include: { purchase: true, sale: true }
        });

        if (vehicle) {
          // Update base vehicle details
          await tx.vehicle.update({
            where: { id: vehicle.id },
            data: {
              ...(updates.make && { make: updates.make }),
              ...(updates.model && { model: updates.model }),
              ...(updates.year && { year: parseInt(updates.year) }),
              ...(updates.color && { color: updates.color }),
              ...(updates.mileage && { mileage: parseInt(updates.mileage) }),
              ...(updates.titleNumber && { titleNumber: updates.titleNumber }),
              ...(updates.purchaseDate && { purchaseDate: new Date(updates.purchaseDate) }),
            }
          });

          // Update Purchase record
          if (vehicle.purchase) {
            await tx.purchase.update({
              where: { id: vehicle.purchase.id },
              data: {
                ...(updates.purchasedFrom && { sellerName: updates.purchasedFrom }),
                ...(updates.sellerAddress && { sellerAddress: updates.sellerAddress }),
                ...(updates.sellerCity && { sellerCity: updates.sellerCity }),
                ...(updates.sellerState && { sellerState: updates.sellerState }),
                ...(updates.sellerZip && { sellerZip: updates.sellerZip }),
                ...(updates.purchaseDate && { purchaseDate: new Date(updates.purchaseDate) }),
              }
            });
          }

          // Update Sale record if disposition details are changed
          if (vehicle.sale && (updates.disposedTo || updates.disposedPrice || updates.disposedDate)) {
            await tx.sale.update({
              where: { id: vehicle.sale.id },
              data: {
                ...(updates.disposedTo && { customerName: updates.disposedTo }),
                ...(updates.disposedAddress && { address: updates.disposedAddress }), // We could merge city/state/zip here if needed
                ...(updates.disposedDate && { saleDate: new Date(updates.disposedDate) }),
                ...(updates.disposedPrice && { salePrice: parseFloat(updates.disposedPrice) }),
              }
            });
          }
        }
      }

      // 3. Regenerate PDF with fully updated info
      const templateBuffer = await readFile(defaultUsedVehicleTemplatePath);
      // Ensure we have all fields for the PDF filling
      const fullData = { ...currentLog, ...updates };
      const filledPdf = await fillUsedVehiclePdf(
        templateBuffer,
        fullData,
        'image/jpeg'
      );

      // Update the log with the new PDF
      return await tx.documentRegistry.update({
        where: { id },
        data: { documentBase64: filledPdf }
      });
    });

    res.json(updatedLog);
  } catch (err) {
    console.error('[Registry Patch Error]', err);
    next(err);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    // Authentication already handled by global app middleware
    
    const log = await prisma.documentRegistry.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId },
      select: { documentBase64: true, sourceDocumentBase64: true, sourceFileName: true, documentType: true, vin: true }
    });
    
    if (!log) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const docType = req.query.type;
    let base64;
    const isSource = docType === 'source';
    let prefix = '';

    if (isSource) {
      base64 = log.sourceDocumentBase64;
      prefix = 'Source_';
    } else if (docType === 'sale' || docType === 'bill_of_sale') {
      if (log.vin) {
        const vehicle = await prisma.vehicle.findFirst({
          where: { vin: log.vin, dealershipId: req.dealershipId },
          include: { sale: true }
        });
        base64 = vehicle?.sale?.billOfSaleBase64;
      }
      prefix = 'BillOfSale_';
    } else {
      base64 = log.documentBase64;
    }

    if (!base64) {
      return res.status(404).json({ message: 'Requested document data not available' });
    }
    
    if (base64.includes('base64,')) {
      base64 = base64.split('base64,')[1];
    }

    const buffer = Buffer.from(base64, 'base64');

    // Determine extension based on type and context
    let extension = 'pdf';
    if (isSource && log.sourceFileName) {
       const parts = log.sourceFileName.split('.');
       if (parts.length > 1) extension = parts.pop().toLowerCase();
    } else {
       // Generated records are usually PDF
       extension = 'pdf';
    }

    const safeFileName = `${prefix}${(log.documentType || 'Document').replace(/\s+/g, '_')}_${(log.sourceFileName || 'log').split('.')[0]}.${extension}`;
    
    const contentType = extension === 'pdf' ? 'application/pdf' : 
                        extension === 'png' ? 'image/png' : 
                        (extension === 'jpg' || extension === 'jpeg') ? 'image/jpeg' : 
                        'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'Content-Disposition': `attachment; filename="${safeFileName}"`,
    });
    
    res.end(buffer);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.documentRegistry.deleteMany({
      where: { id: req.params.id, dealershipId: req.dealershipId }
    });
    res.json({ message: 'Document log deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
