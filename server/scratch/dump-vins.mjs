import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function test() {
  const vs = await prisma.vehicle.findMany();
  for (const v of vs) {
    if (v.vin.includes('1FADP3K25DL189090')) {
      console.log(`ID: ${v.id}, VIN: '${v.vin}', Make: ${v.make}`);
    }
  }
}
test().finally(() => prisma.$disconnect());
