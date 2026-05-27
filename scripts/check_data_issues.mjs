import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const filePath = path.resolve('scripts/parse_results.json');
const raw = await readFile(filePath, 'utf8');
const data = JSON.parse(raw);
const issues = [];
for (const item of data) {
  const { file, info } = item;
  const missingFields = [];
  if (!info.vin) missingFields.push('missing vin');
  if (!('purchasePrice' in info) && !('disposedPrice' in info)) missingFields.push('missing price');
  if (!info.vin && info.purchasePrice == null && info.disposedPrice == null) missingFields.push('missing vin and price');
  const price = info.purchasePrice ?? info.disposedPrice;
  const suspicious = [];
  if (price !== undefined && price !== null) {
    if (Number(price) <= 0) suspicious.push('non-positive price');
    if (Number(price) < 50) suspicious.push('very low price');
    if (Number(price) > 100000) suspicious.push('very high price');
  }
  if (info.vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(info.vin)) suspicious.push('bad VIN format');
  if (missingFields.length || suspicious.length) {
    issues.push({ file, missingFields, suspicious, info });
  }
}
await writeFile(path.resolve('scripts/data_issues.json'), JSON.stringify(issues, null, 2));
console.log(`Found ${issues.length} issues, wrote scripts/data_issues.json`);
