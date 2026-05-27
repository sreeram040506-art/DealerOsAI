import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { extractVehicleInfo } from '../server/services/documentParser.js';

const mapExt = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', tif: 'image/tiff', tiff: 'image/tiff' };

async function run(){
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
        console.log('===',rel,'===');
        console.log(JSON.stringify(info,null,2));
      } catch (e) {
        console.error('ERROR parsing',rel,e && e.message);
      }
    }
  }
}

await run();
