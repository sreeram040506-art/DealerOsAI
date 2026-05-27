import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  const dealership = await prisma.dealership.findFirst();
  const dealershipId = dealership.id;

  const vin = '1FADP3K25DL189090';
  console.log('Testing VIN:', vin);

  const vehicle = await prisma.vehicle.findFirst({
    where: { vin, dealershipId },
    include: { sale: true }
  });

  console.log('findFirst result:', vehicle ? vehicle.vin : 'Not found');
  
  if (vehicle) {
    try {
      await prisma.sale.create({
        data: {
          vehicleId: vehicle.id,
          customerName: 'Test',
          phone: 'N/A',
          address: 'Test',
          saleDate: new Date(),
          salePrice: 1000,
          paymentMethod: 'Cash',
          profit: 100,
          hasBillOfSale: true,
          dealershipId
        }
      });
      console.log('Created sale successfully');
    } catch (e) {
      console.error('Error creating sale:', e.message);
    }
  }

  const allVehicles = await prisma.vehicle.findMany({ where: { dealershipId } });
  const cleanUpper = (str) => String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanExtVin = cleanUpper(vin);

  for (const v of allVehicles) {
    if (cleanUpper(v.vin) === cleanExtVin && cleanExtVin.length > 0) {
      console.log('Found in fallback exact match loop:', v.vin);
      break;
    }
  }
}

test().finally(() => prisma.$disconnect());
