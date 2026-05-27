import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const vehicles = await prisma.vehicle.findMany({
    include: { purchase: true, sale: true }
  });
  
  console.log(`=== DB VEHICLES (${vehicles.length}) ===`);
  for (const v of vehicles) {
    console.log(`- VIN: ${v.vin} | ${v.year} ${v.make} ${v.model} | Status: ${v.status} | Title: ${v.titleNumber} | Purchase: $${v.purchase?.purchasePrice || 0} | Sale: $${v.sale?.salePrice || 0}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
