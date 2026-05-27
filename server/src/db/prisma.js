import { PrismaClient } from '@prisma/client';

const isProduction = process.env.NODE_ENV === 'production';

const prisma = new PrismaClient({
  log: isProduction ? ['warn', 'error'] : ['query', 'warn', 'error'],
});

const dbUrl = process.env.DATABASE_URL || 'NOT_SET';
console.log(`[Prisma] Initialized with DB: ${dbUrl.replace(/:([^:@]+)@/, ':****@')}`);

export default prisma;
