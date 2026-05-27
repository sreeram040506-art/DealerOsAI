import fs from 'fs';
const filepath = 'c:/Users/SREER/Documents/indra/auto-profit-hub-main/public/buy/Bill_20240819_0001.pdf';
const buffer = fs.readFileSync(filepath);
console.log('File size:', buffer.length);
console.log('First 50 bytes (hex):', buffer.slice(0, 50).toString('hex'));
console.log('First 50 bytes (ascii):', buffer.slice(0, 50).toString('ascii'));
