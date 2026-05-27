import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test default load
dotenv.config();
console.log('Default dotenv load - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'FOUND (length: ' + process.env.OPENAI_API_KEY.length + ')' : 'NOT FOUND');

// Test explicit load
dotenv.config({ path: path.resolve(__dirname, '../.env') });
console.log('Explicit dotenv load - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'FOUND (length: ' + process.env.OPENAI_API_KEY.length + ')' : 'NOT FOUND');
