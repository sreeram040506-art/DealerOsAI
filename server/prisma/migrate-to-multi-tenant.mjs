import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migrate() {
  console.log('Starting migration to multi-tenancy...');

  // 1. Create default dealership
  const dealership = await prisma.dealership.create({
    data: {
      name: 'Default Dealership',
      slug: 'default-dealership',
    }
  });
  console.log(`Created default dealership: ${dealership.name} (${dealership.id})`);

  // 2. Backfill every model
  console.log('Backfilling records with dealership ID...');
  
  const results = await Promise.all([
    prisma.user.updateMany({ data: { dealershipId: dealership.id } }),
    prisma.vehicle.updateMany({ data: { dealershipId: dealership.id } }),
    prisma.sale.updateMany({ data: { dealershipId: dealership.id } }),
    prisma.purchase.updateMany({ data: { dealershipId: dealership.id } }),
    prisma.repair.updateMany({ data: { dealershipId: dealership.id } }),
    prisma.customerNote.updateMany({ data: { dealershipId: dealership.id } }),
    prisma.advertisingExpense.updateMany({ data: { dealershipId: dealership.id } }),
    prisma.businessExpense.updateMany({ data: { dealershipId: dealership.id } }),
    prisma.documentRegistry.updateMany({ data: { dealershipId: dealership.id } }),
  ]);

  console.log('Migration results:');
  console.log(`- Users updated: ${results[0].count}`);
  console.log(`- Vehicles updated: ${results[1].count}`);
  console.log(`- Sales updated: ${results[2].count}`);
  console.log(`- Purchases updated: ${results[3].count}`);
  console.log(`- Repairs updated: ${results[4].count}`);
  console.log(`- Customer Notes updated: ${results[5].count}`);
  console.log(`- Advertising Expenses updated: ${results[6].count}`);
  console.log(`- Business Expenses updated: ${results[7].count}`);
  console.log(`- Document Registry updated: ${results[8].count}`);

  console.log('All records backfilled successfully.');
}

migrate()
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
