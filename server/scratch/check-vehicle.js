import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const vin = '1FADP3F25DL227699';
  console.log(`Checking vehicle with VIN: ${vin}`);
  const vehicles = await prisma.vehicle.findMany({
    where: { vin }
  });
  console.log('Vehicles:', vehicles);

  const allVehiclesCount = await prisma.vehicle.count();
  console.log('Total vehicles in database:', allVehiclesCount);
  
  const allVins = await prisma.vehicle.findMany({
    select: { vin: true, dealershipId: true }
  });
  console.log('All VINs in database:', allVins);
}

main().finally(() => prisma.$disconnect());
