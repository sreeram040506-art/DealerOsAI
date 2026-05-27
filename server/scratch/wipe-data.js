import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function wipeData() {
  try {
    console.log('Starting data wipe...');

    await prisma.customerNote.deleteMany({});
    console.log('Cleared CustomerNotes');

    await prisma.repair.deleteMany({});
    console.log('Cleared Repairs');

    await prisma.purchase.deleteMany({});
    console.log('Cleared Purchases');

    await prisma.sale.deleteMany({});
    console.log('Cleared Sales');

    await prisma.advertisingExpense.deleteMany({});
    console.log('Cleared AdvertisingExpenses');

    await prisma.businessExpense.deleteMany({});
    console.log('Cleared BusinessExpenses');

    await prisma.documentRegistry.deleteMany({});
    console.log('Cleared DocumentRegistry');

    await prisma.vehicle.deleteMany({});
    console.log('Cleared Vehicles');

    console.log('Data wipe complete!');
  } catch (error) {
    console.error('Error wiping data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

wipeData();
