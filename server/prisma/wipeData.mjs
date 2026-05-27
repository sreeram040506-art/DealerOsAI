import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Starting full data wipe...');

  try {
    // Delete in order to satisfy potential foreign key constraints (though MongoDB doesn't enforce them strictly, it's good practice)
    
    console.log('Deleting Repairs...');
    await prisma.repair.deleteMany({});

    console.log('Deleting Purchases...');
    await prisma.purchase.deleteMany({});

    console.log('Deleting Sales...');
    await prisma.sale.deleteMany({});

    console.log('Deleting Customer Notes...');
    await prisma.customerNote.deleteMany({});

    console.log('Deleting Advertising Expenses...');
    await prisma.advertisingExpense.deleteMany({});

    console.log('Deleting Business Expenses...');
    await prisma.businessExpense.deleteMany({});

    console.log('Deleting Document Registry...');
    await prisma.documentRegistry.deleteMany({});

    console.log('Deleting Vehicles...');
    await prisma.vehicle.deleteMany({});

    console.log('Wipe complete! (Dealerships and Users were preserved)');
  } catch (err) {
    console.error('Error during wipe:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
