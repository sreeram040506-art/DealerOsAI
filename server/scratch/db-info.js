import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const dealerships = await prisma.dealership.findMany();
  console.log('--- Dealerships ---');
  console.table(dealerships.map(d => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    isActive: d.isActive
  })));

  const vehicleCount = await prisma.vehicle.count();
  const documentCount = await prisma.documentRegistry.count();
  const saleCount = await prisma.sale.count();
  const purchaseCount = await prisma.purchase.count();
  const repairCount = await prisma.repair.count();

  console.log(`Vehicles: ${vehicleCount}`);
  console.log(`Documents: ${documentCount}`);
  console.log(`Sales: ${saleCount}`);
  console.log(`Purchases: ${purchaseCount}`);
  console.log(`Repairs: ${repairCount}`);
}

main().finally(() => prisma.$disconnect());
