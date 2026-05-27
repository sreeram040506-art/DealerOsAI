import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reportPath = path.join(__dirname, '../..', 'artifacts', 'bulk_import_report.md');
const mdContent = fs.readFileSync(reportPath, 'utf8');

// Parse MD file to extract acquisition images
const acqSection = mdContent.split('## Acquisition (Buy) Documents Audit')[1] || '';
const acqLines = acqSection.split('\n').filter(l => l.includes('|') && l.includes('WhatsApp Image'));

const buyImages = {};
for (const line of acqLines) {
  const parts = line.split('|').map(p => p.trim());
  if (parts.length >= 5) {
    const file = parts[1];
    const vin = parts[2].replace(/`/g, '');
    const details = parts[4];
    buyImages[vin] = { file, details };
  }
}

console.log('--- ALL BUY IMAGES ---');
console.log(buyImages);

// Parse matched sales
const alignedSection = mdContent.split('## Aligned & Sold Vehicles')[1]?.split('## Failed or Unmatched Sale Documents')[0] || '';
const alignedLines = alignedSection.split('\n').filter(l => l.includes('|') && l.includes('WhatsApp Image'));

const matchedPairs = [];
for (const line of alignedLines) {
  const parts = line.split('|').map(p => p.trim());
  if (parts.length >= 6) {
    const saleFile = parts[1];
    const vin = parts[2].replace(/`/g, '');
    const vehicle = parts[3];
    const method = parts[5];
    
    // Check if we have a matching buy image for this VIN
    // Note: fuzzy matches or direct VIN
    let buyMatch = buyImages[vin];
    if (!buyMatch) {
      // Check if any buy image VIN is close/partially matches (fuzzy)
      const clean = (v) => v.replace(/[^A-Z0-9]/g, '');
      const cleanVin = clean(vin);
      for (const [bVin, bData] of Object.entries(buyImages)) {
        const cleanB = clean(bVin);
        if (cleanB === cleanVin || 
            (cleanB.endsWith(cleanVin.slice(-6))) || 
            (cleanVin.endsWith(cleanB.slice(-6))) ||
            (bVin.substring(0, 3) === vin.substring(0, 3) && bVin.endsWith(vin.slice(-6)))) {
          buyMatch = bData;
          break;
        }
      }
    }

    if (buyMatch) {
      matchedPairs.push({
        vin,
        vehicle,
        buyFile: buyMatch.file,
        saleFile,
        method
      });
    }
  }
}

// Parse unmatched sales to see if any could/should have matched buy images
const unmatchedSection = mdContent.split('## Failed or Unmatched Sale Documents')[1]?.split('## Acquisition (Buy) Documents Audit')[0] || '';
const unmatchedLines = unmatchedSection.split('\n').filter(l => l.includes('|') && l.includes('WhatsApp Image'));

const unmatchedPairs = [];
for (const line of unmatchedLines) {
  const parts = line.split('|').map(p => p.trim());
  if (parts.length >= 4) {
    const saleFile = parts[1];
    const vin = parts[2].replace(/`/g, '');
    const reason = parts[3];
    
    // Let's check if there is a buy image with the same or similar VIN
    let buyMatch = buyImages[vin];
    if (!buyMatch) {
      const clean = (v) => v.replace(/[^A-Z0-9]/g, '');
      const cleanVin = clean(vin);
      for (const [bVin, bData] of Object.entries(buyImages)) {
        const cleanB = clean(bVin);
        if (cleanB === cleanVin || 
            (cleanB.endsWith(cleanVin.slice(-6))) || 
            (cleanVin.endsWith(cleanB.slice(-6))) ||
            (bVin.substring(0, 3) === vin.substring(0, 3) && bVin.endsWith(vin.slice(-6)))) {
          buyMatch = bData;
          break;
        }
      }
    }

    if (buyMatch) {
      unmatchedPairs.push({
        vin,
        buyFile: buyMatch.file,
        saleFile,
        reason
      });
    }
  }
}

console.log('\n--- MATCHED PAIRS ---');
console.log(matchedPairs);

console.log('\n--- UNMATCHED PAIRS ---');
console.log(unmatchedPairs);

// Output beautiful Markdown
let out = `### Image-to-Image VIN Matchings Summary\n\n`;
out += `Comparing image files in \`public/buy\` and \`public/sale\` directories:\n\n`;
out += `#### 1. Aligned & Matched Image Pairs (Successfully Synced)\n`;
out += `| Vehicle | VIN | Buy Image File | Sale Image File | Matching Method |\n`;
out += `| :--- | :--- | :--- | :--- | :--- |\n`;
for (const p of matchedPairs) {
  out += `| ${p.vehicle} | \`${p.vin}\` | ${p.buyFile} | ${p.saleFile} | ${p.method} |\n`;
}

out += `\n#### 2. Unmatched but Related Image Pairs (Potential Matches)\n`;
out += `| VIN | Buy Image File | Sale Image File | Status / Reason |\n`;
out += `| :--- | :--- | :--- | :--- |\n`;
for (const p of unmatchedPairs) {
  out += `| \`${p.vin}\` | ${p.buyFile} | ${p.saleFile} | ${p.reason} |\n`;
}

console.log('\n=== MD REPORT ===');
console.log(out);
