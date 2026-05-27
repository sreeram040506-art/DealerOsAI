import { readFile } from 'fs/promises';
import path from 'path';
import { extractVehicleInfo } from '../server/services/documentParser.js';

async function run() {
  try {
    const filePath = path.resolve('public', 'Bill_20260105_0002.pdf');
    const buffer = await readFile(filePath);
    const mimetype = 'application/pdf';
    console.log('Running extractVehicleInfo on', filePath);
    const info = await extractVehicleInfo(buffer, mimetype, 'acquisition');
    console.log('Extraction result:', JSON.stringify(info, null, 2));
  } catch (err) {
    console.error('Test parse failed:', err);
  }
}

run();
