import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Wiping transaction tables...');
  await prisma.sale.deleteMany({});
  await prisma.repair.deleteMany({});
  await prisma.purchase.deleteMany({});
  await prisma.customerNote.deleteMany({});
  await prisma.advertisingExpense.deleteMany({});
  await prisma.businessExpense.deleteMany({});
  await prisma.documentRegistry.deleteMany({});
  await prisma.vehicle.deleteMany({});
  console.log('Database successfully wiped!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
