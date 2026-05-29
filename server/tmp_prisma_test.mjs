import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  await prisma.$connect();
  console.log('CONNECTED');
} catch (e) {
  console.error('CONNECT_ERROR', e);
} finally {
  await prisma.$disconnect();
}
