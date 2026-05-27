import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { extractVehicleInfo, isValidVin } from '../services/documentParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

function levenshteinDistance(a, b) {
  const tmp = [];
  let i, j, alen = a.length, blen = b.length;
  if (alen === 0) return blen;
  if (blen === 0) return alen;
  for (i = 0; i <= alen; i++) tmp[i] = [i];
  for (j = 0; j <= blen; j++) tmp[0][j] = j;
  for (i = 1; i <= alen; i++) {
    for (j = 1; j <= blen; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[alen][blen];
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

async function main() {
  console.log('=== STARTING BULK IMPORT AND ALIGNMENT PROCESS ===');
  
  // 1. Get default dealership and user
  const dealership = await prisma.dealership.findFirst();
  if (!dealership) {
    console.error('Error: No dealership found in database. Run server seed first.');
    process.exit(1);
  }
  const dealershipId = dealership.id;
  
  const user = await prisma.user.findFirst({ where: { dealershipId } });
  const createdById = user ? user.id : null;
  
  console.log(`Target Dealership: ${dealership.name} (${dealershipId})`);
  console.log(`Target User: ${user ? user.name : 'System'} (${createdById})`);

  // 2. Wipe database
  console.log('Clearing database tables...');
  await prisma.sale.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.repair.deleteMany();
  await prisma.customerNote.deleteMany();
  await prisma.documentRegistry.deleteMany();
  await prisma.vehicle.deleteMany();
  console.log('Database cleared.');

  // 3. Scan Directories
  const buyDir = path.join(__dirname, '../../public/buy');
  const saleDir = path.join(__dirname, '../../public/sale');
  
  const buyFiles = fs.readdirSync(buyDir).filter(f => /\.(pdf|jpg|jpeg|png)$/i.test(f));
  const saleFiles = fs.readdirSync(saleDir).filter(f => /\.(pdf|jpg|jpeg|png)$/i.test(f));
  
  console.log(`Found ${buyFiles.length} buy documents in public/buy.`);
  console.log(`Found ${saleFiles.length} sale documents in public/sale.`);

  const buyResults = [];
  const saleResults = [];

  // 4. Process Acquisitions
  console.log('\n--- PROCESSING ACQUISITIONS ---');
  for (let i = 0; i < buyFiles.length; i++) {
    const file = buyFiles[i];
    const filePath = path.join(buyDir, file);
    const buffer = fs.readFileSync(filePath);
    const mime = file.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
    
    console.log(`[Acquisition ${i + 1}/${buyFiles.length}] Processing ${file}...`);
    try {
      const info = await extractVehicleInfo(buffer, mime, 'acquisition');
      
      if (!info.vin) {
        console.warn(`[Acquisition] No VIN found in ${file}`);
        buyResults.push({ file, success: false, reason: 'No VIN extracted' });
        continue;
      }
      
      // Prevent duplicate vehicle creations from duplicate files
      const existingVehicles = await prisma.vehicle.findMany({
        where: { dealershipId }
      });
      let existing = null;
      const cleanUpper = (str) => String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const cleanVin = cleanUpper(info.vin);

      for (const v of existingVehicles) {
        const cleanV = cleanUpper(v.vin);
        if (cleanV === cleanVin) {
          existing = v;
          break;
        }
        
        // Treat as duplicate only if both the serial number (last 6 digits) AND make/model match
        const vMake = String(v.make || '').toLowerCase().trim();
        const infoMake = String(info.make || '').toLowerCase().trim();
        const vModel = String(v.model || '').toLowerCase().trim();
        const infoModel = String(info.model || '').toLowerCase().trim();
        
        const endsWithMatch = (v.vin.length >= 6 && info.vin.length >= 6) && 
            (v.vin.endsWith(info.vin.slice(-6)) || info.vin.endsWith(v.vin.slice(-6)));

        if (endsWithMatch && vMake === infoMake && vModel === infoModel) {
          existing = v;
          break;
        }
      }

      if (existing) {
        console.log(`[Acquisition] Skipping duplicate vehicle creation. VIN ${info.vin} matches existing VIN ${existing.vin}.`);
        buyResults.push({ file, success: true, vin: existing.vin, vehicle: existing });
        continue;
      }

      const purchasePrice = parseCurrency(info.purchasePrice);
      const totalPurchaseCost = purchasePrice + parseCurrency(info.transportCost) + parseCurrency(info.inspectionCost) + parseCurrency(info.registrationCost);
      
      // Create Vehicle
      const vehicle = await prisma.vehicle.create({
        data: {
          vin: info.vin,
          make: info.make || 'Unknown',
          model: info.model || 'Unknown',
          year: Number(info.year) || new Date().getFullYear(),
          mileage: Number(info.mileage) || 0,
          color: info.color || 'Unknown',
          purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
          titleNumber: info.titleNumber || null,
          status: 'Available',
          dealershipId,
          createdById,
          purchase: {
            create: {
              sellerName: info.purchasedFrom || 'Auction',
              sellerAddress: info.usedVehicleSourceAddress || '',
              sellerCity: info.usedVehicleSourceCity || '',
              sellerState: info.usedVehicleSourceState || '',
              sellerZip: info.usedVehicleSourceZipCode || '',
              purchasePrice,
              transportCost: parseCurrency(info.transportCost),
              inspectionCost: parseCurrency(info.inspectionCost),
              registrationCost: parseCurrency(info.registrationCost),
              totalPurchaseCost,
              purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
              paymentMethod: 'Bank Transfer',
              dealershipId
            }
          }
        }
      });
      
      // Register Document
      await prisma.documentRegistry.create({
        data: {
          vin: info.vin,
          make: info.make || 'Unknown',
          model: info.model || 'Unknown',
          year: String(info.year || ''),
          color: info.color || 'Unknown',
          mileage: String(info.mileage || ''),
          titleNumber: info.titleNumber || null,
          purchaseDate: info.purchaseDate || null,
          purchasedFrom: info.purchasedFrom || 'Auction',
          documentType: 'Used Vehicle Record',
          documentBase64: buffer.toString('base64'),
          dealershipId
        }
      });

      console.log(`[Acquisition] Success: ${vehicle.year} ${vehicle.make} ${vehicle.model} (VIN: ${vehicle.vin})`);
      buyResults.push({ file, success: true, vin: vehicle.vin, vehicle });
    } catch (err) {
      console.error(`[Acquisition] Failed to process ${file}:`, err.message);
      buyResults.push({ file, success: false, reason: err.message });
    }
  }

  // 5. Process Sales
  console.log('\n--- PROCESSING SALES ---');
  for (let i = 0; i < saleFiles.length; i++) {
    const file = saleFiles[i];
    const filePath = path.join(saleDir, file);
    const buffer = fs.readFileSync(filePath);
    const mime = file.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
    
    console.log(`[Sale ${i + 1}/${saleFiles.length}] Processing ${file}...`);
    try {
      const info = await extractVehicleInfo(buffer, mime, 'sale');
      
      if (!info.vin) {
        console.warn(`[Sale] No VIN found in ${file}`);
        saleResults.push({ file, success: false, reason: 'No VIN extracted' });
        continue;
      }
      
      const extractedVin = info.vin;
      
      // Find matching vehicle using robust fuzzy match
      let vehicle = await prisma.vehicle.findFirst({
        where: { vin: extractedVin, dealershipId },
        include: { purchase: true, repairs: true, sale: true }
      });
      
      let matchedVia = 'Exact Match';
      
      if (!vehicle) {
        const allVehicles = await prisma.vehicle.findMany({
          where: { dealershipId },
          include: { purchase: true, repairs: true, sale: true }
        });
        
        const cleanUpper = (str) => String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const cleanExtVin = cleanUpper(extractedVin);
        const cleanTitle = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const extTitleClean = cleanTitle(info.titleNumber);

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
            } else if (cleanV.length >= 6 && cleanExtVin.length >= 6 && 
                      (cleanV.endsWith(cleanExtVin.slice(-6)) || cleanExtVin.endsWith(cleanV.slice(-6)))) {
              score = 8;
              tempMatchedVia = `Serial Number Match (${cleanV.slice(-6)})`;
            } else if (cleanV.length >= 6 && cleanExtVin.length >= 6 && levenshteinDistance(cleanV.slice(-6), cleanExtVin.slice(-6)) <= 2) {
              score = 7.5;
              tempMatchedVia = `Fuzzy Serial Number Match (${cleanV.slice(-6)} vs ${cleanExtVin.slice(-6)})`;
            } else if (cleanV.length >= 6 && cleanExtVin.length >= 6 && cleanV.substring(0, 3) === cleanExtVin.substring(0, 3) && cleanV.endsWith(cleanExtVin.slice(-6))) {
              score = 7;
              tempMatchedVia = 'Make/Serial Match (First 3 + Last 6)';
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
          }
        }

        if (!vehicle) {
          // Fallback unique make/model search when there is exactly one available vehicle of this make/model in stock
          const extMake = String(info.make || '').toLowerCase().trim();
          const extModel = String(info.model || '').toLowerCase().trim();
          
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
            }
          }
        }
      }
      
      if (!vehicle) {
        console.warn(`[Sale] Match failed for VIN ${extractedVin}`);
        saleResults.push({ file, success: false, vin: extractedVin, reason: 'VIN not found in inventory' });
        continue;
      }
      
      // Update vehicle status
      await prisma.vehicle.update({
        where: { id: vehicle.id, dealershipId },
        data: { status: 'Sold' }
      });
      
      const salePrice = parseCurrency(info.disposedPrice);
      const purchaseCost = vehicle.purchase?.totalPurchaseCost || 0;
      const profit = salePrice - purchaseCost;
      
      const customerName = info.disposedTo || 'Unknown Customer';
      
      const existingSale = await prisma.sale.findUnique({
        where: { vehicleId: vehicle.id }
      });

      if (!existingSale) {
        await prisma.sale.create({
          data: {
            vehicleId: vehicle.id,
            customerName,
            phone: 'N/A',
            address: [
              info.disposedAddress,
              info.disposedCity,
              info.disposedState,
              info.disposedZip
            ].filter(Boolean).join(', ') || 'N/A',
            driverLicense: info.disposedDlNumber || null,
            saleDate: info.disposedDate ? new Date(info.disposedDate) : new Date(),
            salePrice,
            paymentMethod: 'Cash',
            profit,
            hasBillOfSale: true,
            dealershipId
          }
        });
      } else {
        matchedVia += ' (Duplicate Sale Doc)';
      }

      // Register document
      await prisma.documentRegistry.create({
        data: {
          vin: vehicle.vin,
          documentType: 'Bill of Sale',
          documentBase64: buffer.toString('base64'),
          disposedTo: customerName,
          disposedAddress: info.disposedAddress || '',
          disposedCity: info.disposedCity || '',
          disposedState: info.disposedState || '',
          disposedZip: info.disposedZip || '',
          disposedDate: info.disposedDate || '',
          disposedPrice: String(salePrice),
          disposedOdometer: String(info.disposedOdometer || ''),
          disposedDlNumber: info.disposedDlNumber || '',
          disposedDlState: info.disposedDlState || '',
          dealershipId
        }
      });
      
      console.log(`[Sale] Success: Matched ${vehicle.year} ${vehicle.make} ${vehicle.model} (VIN: ${vehicle.vin}) via ${matchedVia}`);
      saleResults.push({ file, success: true, vin: extractedVin, vehicle, matchedVia, salePrice });
    } catch (err) {
      console.error(`[Sale] Failed to process ${file}:`, err.message);
      saleResults.push({ file, success: false, reason: err.message });
    }
  }

  // 6. Generate Report
  console.log('\n--- GENERATING INTEGRITY REPORT ---');
  const totalVehicles = await prisma.vehicle.count();
  const soldVehicles = await prisma.vehicle.count({ where: { status: 'Sold' } });
  const availableVehicles = await prisma.vehicle.count({ where: { status: 'Available' } });
  
  console.log(`Total Vehicles Processed: ${totalVehicles}`);
  console.log(`Sold Vehicles Breakdown: ${soldVehicles}`);
  console.log(`Available Vehicles Breakdown: ${availableVehicles}`);

  const reportPath = path.join(__dirname, '../../artifacts/bulk_import_report.md');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  
  let md = `# Bulk Document Processing & Alignment Report\n\n`;
  md += `## Processing Metrics\n`;
  md += `* **Total Acquisition Documents (Buy)**: ${buyFiles.length}\n`;
  md += `* **Total Sale Documents (Sale)**: ${saleFiles.length}\n`;
  md += `* **Total Vehicles Imported to Inventory**: ${totalVehicles}\n`;
  md += `* **Vehicles Successfully Aligned & Marked Sold**: ${soldVehicles}\n`;
  md += `* **Vehicles Available in Inventory**: ${availableVehicles}\n\n`;
  
  md += `## Aligned & Sold Vehicles\n`;
  md += `| File Name | Matched VIN | Vehicle | Sale Price | Match Method |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- |\n`;
  
  for (const s of saleResults) {
    if (s.success) {
      md += `| ${s.file} | \`${s.vin}\` | ${s.vehicle.year} ${s.vehicle.make} ${s.vehicle.model} | $${s.salePrice.toLocaleString()} | ${s.matchedVia} |\n`;
    }
  }
  
  md += `\n## Failed or Unmatched Sale Documents\n`;
  md += `| File Name | Extracted VIN | Reason for Match Failure |\n`;
  md += `| :--- | :--- | :--- |\n`;
  
  for (const s of saleResults) {
    if (!s.success) {
      md += `| ${s.file} | \`${s.vin || 'N/A'}\` | ${s.reason} |\n`;
    }
  }

  md += `\n## Acquisition (Buy) Documents Audit\n`;
  md += `| File Name | Extracted VIN | Status | Details |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;
  
  for (const b of buyResults) {
    if (b.success) {
      md += `| ${b.file} | \`${b.vin}\` | Success | ${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model} |\n`;
    } else {
      md += `| ${b.file} | N/A | Failed | ${b.reason} |\n`;
    }
  }

  fs.writeFileSync(reportPath, md);
  console.log(`Saved detailed report to ${reportPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
