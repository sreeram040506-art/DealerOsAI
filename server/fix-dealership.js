import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fix() {
  // Fix: Set System Administration dealership to active
  const result = await prisma.dealership.updateMany({
    where: { name: 'System Administration' },
    data: { isActive: true }
  });
  console.log('Updated System Administration dealership:', result);

  // Verify
  const dealerships = await prisma.dealership.findMany({
    select: { id: true, name: true, isActive: true }
  });
  console.log('All dealerships:');
  dealerships.forEach(d => console.log(`  ${d.name} | active: ${d.isActive} | id: ${d.id}`));

  await prisma.$disconnect();
}

fix().catch(console.error);
