import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'http://localhost:3001/api';

async function main() {
  console.log('--- Bulk Upload Script Starting ---');
  
  // 1. Authenticate
  console.log('Logging in as admin@gmail.com...');
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@gmail.com', password: 'password123' })
  });
  
  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
  }
  
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('Login successful! Token acquired.');

  const headers = {
    'Authorization': `Bearer ${token}`
  };

  // 2. Upload BUYS
  const buyDir = 'c:/Users/SREER/Documents/indra/auto-profit-hub-main/public/buy';
  const buyFiles = fs.readdirSync(buyDir).filter(f => fs.statSync(path.join(buyDir, f)).isFile());
  console.log(`Found ${buyFiles.length} buy documents in ${buyDir}. Starting uploads...`);

  let buySuccessCount = 0;
  let buyFailCount = 0;
  const buyFailures = [];

  for (let i = 0; i < buyFiles.length; i++) {
    const filename = buyFiles[i];
    const filepath = path.join(buyDir, filename);
    console.log(`[${i+1}/${buyFiles.length}] Uploading buy document: ${filename}...`);
    
    try {
      const fileBuffer = fs.readFileSync(filepath);
      const mimeType = filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
      const fileBlob = new Blob([fileBuffer], { type: mimeType });
      
      const formData = new FormData();
      formData.append('sourceFile', fileBlob, filename);
      formData.append('pushToInventory', 'true');

      const uploadRes = await fetch(`${API_BASE}/generate-used-vehicle-form`, {
        method: 'POST',
        headers,
        body: formData
      });

      if (uploadRes.ok) {
        const result = await uploadRes.json();
        console.log(`  => SUCCESS: VIN=${result.info?.vin || 'N/A'}, Make=${result.info?.make || 'N/A'}`);
        buySuccessCount++;
      } else {
        const errorText = await uploadRes.text();
        console.error(`  => FAILED: ${uploadRes.status} - ${errorText}`);
        buyFailCount++;
        buyFailures.push({ filename, status: uploadRes.status, error: errorText });
      }
    } catch (err) {
      console.error(`  => ERROR: ${err.message}`);
      buyFailCount++;
      buyFailures.push({ filename, error: err.message });
    }
  }

  // 3. Upload SALES
  const saleDir = 'c:/Users/SREER/Documents/indra/auto-profit-hub-main/public/sale';
  const saleFiles = fs.readdirSync(saleDir).filter(f => fs.statSync(path.join(saleDir, f)).isFile()).slice(0, 30);
  console.log(`\nFound ${saleFiles.length} sale documents in ${saleDir} (limited to 30 for testing). Starting uploads...`);

  let saleSuccessCount = 0;
  let saleFailCount = 0;
  const saleFailures = [];

  for (let i = 0; i < saleFiles.length; i++) {
    const filename = saleFiles[i];
    const filepath = path.join(saleDir, filename);
    console.log(`[${i+1}/${saleFiles.length}] Uploading sale document: ${filename}...`);
    
    try {
      const fileBuffer = fs.readFileSync(filepath);
      const mimeType = filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
      const fileBlob = new Blob([fileBuffer], { type: mimeType });
      
      const formData = new FormData();
      formData.append('file', fileBlob, filename);

      const uploadRes = await fetch(`${API_BASE}/upload-bill-of-sale`, {
        method: 'POST',
        headers,
        body: formData
      });

      if (uploadRes.ok) {
        const result = await uploadRes.json();
        console.log(`  => SUCCESS: VIN=${result.sale?.vehicle?.vin || 'N/A'}, Customer=${result.sale?.customerName || 'N/A'}`);
        saleSuccessCount++;
      } else {
        const errorText = await uploadRes.text();
        console.error(`  => FAILED: ${uploadRes.status} - ${errorText}`);
        saleFailCount++;
        saleFailures.push({ filename, status: uploadRes.status, error: errorText });
      }
    } catch (err) {
      console.error(`  => ERROR: ${err.message}`);
      saleFailCount++;
      saleFailures.push({ filename, error: err.message });
    }
  }

  console.log('\n--- Bulk Upload Completed ---');
  console.log(`BUYS:  Success = ${buySuccessCount}, Failed = ${buyFailCount}`);
  console.log(`SALES: Success = ${saleSuccessCount}, Failed = ${saleFailCount}`);
  
  if (buyFailures.length > 0) {
    console.log('\nBuy Failures Summary:');
    console.table(buyFailures);
  }
  if (saleFailures.length > 0) {
    console.log('\nSale Failures Summary:');
    console.table(saleFailures);
  }
}

main().catch(console.error);
