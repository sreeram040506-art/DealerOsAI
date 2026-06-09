import Jimp from 'jimp';
import fetch from 'node-fetch';

async function main(){
  const img = new Jimp(200, 100, 0xffffffff); // white image
  const buffer = await img.getBufferAsync(Jimp.MIME_PNG);
  const base64 = 'data:image/png;base64,' + buffer.toString('base64');

  const url = 'http://127.0.0.1:3001/api/dev/predictor/condition?dealershipId=6a18401f1a6eecef0d9595f4';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64 })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

main().catch(e=>{ console.error(e); process.exit(1); });
