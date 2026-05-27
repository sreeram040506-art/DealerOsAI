// Backend diagnostic script
// Run this locally to test if your backend configuration is correct

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '.env') });

console.log('=== Backend Configuration Check ===\n');

// Check critical environment variables
const requiredVars = ['DATABASE_URL', 'JWT_SECRET', 'PORT'];
const optionalVars = ['NODE_ENV', 'CLIENT_URL', 'VITE_API_ORIGIN'];

console.log('Required Variables:');
requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    if (varName === 'DATABASE_URL') {
      console.log(`✅ ${varName}: ${value.replace(/:([^:@]+)@/, ':****@')}`);
    } else {
      console.log(`✅ ${varName}: ${value}`);
    }
  } else {
    console.log(`❌ ${varName}: MISSING`);
  }
});

console.log('\nOptional Variables:');
optionalVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${value}`);
  } else {
    console.log(`⚠️  ${varName}: Not set (optional)`);
  }
});

console.log('\n=== Configuration Summary ===');
console.log(`Node Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Port: ${process.env.PORT || '3001 (default)'}`);
console.log(`Backend URL: ${process.env.VITE_API_ORIGIN || 'Not set'}`);
console.log(`Client URL: ${process.env.CLIENT_URL || 'Not set'}`);

console.log('\n=== Next Steps ===');
console.log('1. If all required variables are set, your local backend should work');
console.log('2. For Render deployment, ensure these same variables are set in Render dashboard');
console.log('3. Test locally: npm run dev');
console.log('4. Test deployed: curl https://dealerosai.onrender.com/api/ping');
