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

const buyVins = new Set();
for (const line of acqLines) {
  const parts = line.split('|').map(p => p.trim());
  if (parts.length >= 3) {
    const vin = parts[2].replace(/`/g, '');
    if (vin && vin !== 'N/A') {
      buyVins.add(vin);
    }
  }
}

// Parse all sale matches and mismatches
const alignedSection = mdContent.split('## Aligned & Sold Vehicles')[1]?.split('## Failed or Unmatched Sale Documents')[0] || '';
const alignedLines = alignedSection.split('\n').filter(l => l.includes('|') && !l.includes('File Name') && !l.includes('---'));

const matchedVins = new Set();
for (const line of alignedLines) {
  const parts = line.split('|').map(p => p.trim());
  if (parts.length >= 3) {
    const vin = parts[2].replace(/`/g, '');
    if (vin && vin !== 'N/A') {
      matchedVins.add(vin);
    }
  }
}

const unmatchedSection = mdContent.split('## Failed or Unmatched Sale Documents')[1]?.split('## Acquisition (Buy) Documents Audit')[0] || '';
const unmatchedLines = unmatchedSection.split('\n').filter(l => l.includes('|') && !l.includes('File Name') && !l.includes('---'));

const unmatchedVins = new Set();
for (const line of unmatchedLines) {
  const parts = line.split('|').map(p => p.trim());
  if (parts.length >= 3) {
    const vin = parts[2].replace(/`/g, '');
    if (vin && vin !== 'N/A') {
      unmatchedVins.add(vin);
    }
  }
}

// Let's count how many unique VINs exist in BOTH Buy and Sale sets
const totalUniqueMatches = new Set();

// Helper to do fuzzy/levenshtein or exact match
const clean = (v) => v.replace(/[^A-Z0-9]/g, '');

for (const bVin of buyVins) {
  const cleanB = clean(bVin);
  
  // Check aligned
  for (const sVin of matchedVins) {
    const cleanS = clean(sVin);
    if (cleanB === cleanS || cleanB.endsWith(cleanS.slice(-6)) || cleanS.endsWith(cleanB.slice(-6))) {
      totalUniqueMatches.add(bVin);
    }
  }
  
  // Check unmatched
  for (const sVin of unmatchedVins) {
    const cleanS = clean(sVin);
    if (cleanB === cleanS || cleanB.endsWith(cleanS.slice(-6)) || cleanS.endsWith(cleanB.slice(-6))) {
      totalUniqueMatches.add(bVin);
    }
  }
}

console.log('--- STATISTICS ---');
console.log('Total unique VINs in public/buy:', buyVins.size);
console.log('Total unique matched VINs in database:', matchedVins.size);
console.log('Total unique unmatched VINs in sale folder:', unmatchedVins.size);
console.log('Total UNIQUE matching VINs between buy and sale folders (both database-aligned and unaligned):', totalUniqueMatches.size);
console.log('Unique matching VIN list:', Array.from(totalUniqueMatches));
