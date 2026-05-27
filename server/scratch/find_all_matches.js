import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reportPath = path.join(__dirname, '../..', 'artifacts', 'bulk_import_report.md');
const mdContent = fs.readFileSync(reportPath, 'utf8');

// Parse MD file to extract acquisition documents
const acqSection = mdContent.split('## Acquisition (Buy) Documents Audit')[1] || '';
const acqLines = acqSection.split('\n').filter(l => l.includes('|') && !l.includes('File Name') && !l.includes('---'));

const buyDocs = {};
for (const line of acqLines) {
  const parts = line.split('|').map(p => p.trim());
  if (parts.length >= 5) {
    const file = parts[1];
    const vin = parts[2].replace(/`/g, '');
    const status = parts[3];
    const details = parts[4];
    buyDocs[vin] = { file, status, details };
  }
}

// Parse matched sales
const alignedSection = mdContent.split('## Aligned & Sold Vehicles')[1]?.split('## Failed or Unmatched Sale Documents')[0] || '';
const alignedLines = alignedSection.split('\n').filter(l => l.includes('|') && !l.includes('File Name') && !l.includes('---'));

const matchedPairs = [];
for (const line of alignedLines) {
  const parts = line.split('|').map(p => p.trim());
  if (parts.length >= 6) {
    const saleFile = parts[1];
    const vin = parts[2].replace(/`/g, '');
    const vehicle = parts[3];
    const method = parts[5];
    
    // Check if we have a matching buy document for this VIN
    let buyMatch = buyDocs[vin];
    if (!buyMatch) {
      // Check if any buy document VIN is close/partially matches (fuzzy)
      const clean = (v) => v.replace(/[^A-Z0-9]/g, '');
      const cleanVin = clean(vin);
      for (const [bVin, bData] of Object.entries(buyDocs)) {
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

    matchedPairs.push({
      vin,
      vehicle,
      buyFile: buyMatch ? buyMatch.file : 'N/A',
      saleFile,
      method
    });
  }
}

// Parse unmatched sales
const unmatchedSection = mdContent.split('## Failed or Unmatched Sale Documents')[1]?.split('## Acquisition (Buy) Documents Audit')[0] || '';
const unmatchedLines = unmatchedSection.split('\n').filter(l => l.includes('|') && !l.includes('File Name') && !l.includes('---'));

const unmatchedPairs = [];
for (const line of unmatchedLines) {
  const parts = line.split('|').map(p => p.trim());
  if (parts.length >= 4) {
    const saleFile = parts[1];
    const vin = parts[2].replace(/`/g, '');
    const reason = parts[3];
    
    // Let's check if there is a buy document with the same or similar VIN
    let buyMatch = buyDocs[vin];
    if (!buyMatch) {
      const clean = (v) => v.replace(/[^A-Z0-9]/g, '');
      const cleanVin = clean(vin);
      for (const [bVin, bData] of Object.entries(buyDocs)) {
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

console.log('--- ALL MATCHED PAIRS ---', matchedPairs.length);
console.log('--- ALL UNMATCHED RELATED PAIRS ---', unmatchedPairs.length);

let out = `### Document VIN Matchings Summary\n\n`;
out += `Comparing all documents (PDFs and JPEGs) in \`public/buy\` and \`public/sale\` directories:\n\n`;
out += `#### 1. Aligned & Matched Document Pairs (Successfully Synced)\n`;
out += `| Vehicle | VIN | Buy Document File | Sale Document File | Matching Method |\n`;
out += `| :--- | :--- | :--- | :--- | :--- |\n`;
for (const p of matchedPairs) {
  out += `| ${p.vehicle} | \`${p.vin}\` | ${p.buyFile} | ${p.saleFile} | ${p.method} |\n`;
}

out += `\n#### 2. Unmatched but Related Document Pairs (Potential Matches)\n`;
out += `| VIN | Buy Document File | Sale Document File | Status / Reason |\n`;
out += `| :--- | :--- | :--- | :--- |\n`;
for (const p of unmatchedPairs) {
  out += `| \`${p.vin}\` | ${p.buyFile} | ${p.saleFile} | ${p.reason} |\n`;
}

console.log('\n=== MD REPORT ===');
console.log(out);
