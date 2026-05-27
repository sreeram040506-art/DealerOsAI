import { readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { extractVehicleInfo } from '../server/services/documentParser.js';
const mapExt = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', tif: 'image/tiff', tiff: 'image/tiff' };

const results = [];
for (const dir of ['public/buy','public/sale']){
  const files = await readdir(dir);
  for (const f of files){
    const rel = path.join(dir,f);
    const buffer = await readFile(rel);
    const ext = f.split('.').pop().toLowerCase();
    const mimetype = mapExt[ext] || 'application/octet-stream';
    const purpose = dir.includes('buy') ? 'acquisition' : 'disposition';
    try{
      const info = await extractVehicleInfo(buffer, mimetype, purpose);
      results.push({ file: rel, info });
    } catch (e) {
      results.push({ file: rel, error: String(e) });
    }
  }
}
await writeFile('scripts/parse_results.json', JSON.stringify(results, null, 2));
console.log('Wrote scripts/parse_results.json');
