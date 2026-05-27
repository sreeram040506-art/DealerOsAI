import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  console.log('=== Performance Measurement ===');
  
  // 1. Measure query with base64 fields excluded (our optimized query)
  const startOptimized = Date.now();
  const vehiclesOptimized = await prisma.vehicle.findMany({
    orderBy: { createdAt: 'desc' },
    include: { 
      purchase: {
        select: {
          id: true,
          sellerName: true,
          sellerAddress: true,
          sellerCity: true,
          sellerState: true,
          sellerZip: true,
          purchasePrice: true,
          buyerFee: true,
          transportCost: true,
          inspectionCost: true,
          registrationCost: true,
          totalPurchaseCost: true,
          purchaseDate: true,
          paymentMethod: true,
        }
      },
      repairs: true,
      sale: true
    }
  });
  const timeOptimized = Date.now() - startOptimized;
  console.log(`Optimized query: fetched ${vehiclesOptimized.length} vehicles in ${timeOptimized}ms`);

  // 2. Measure query with base64 fields included (the old slow query)
  const startSlow = Date.now();
  const vehiclesSlow = await prisma.vehicle.findMany({
    orderBy: { createdAt: 'desc' },
    include: { 
      purchase: {
        select: {
          id: true,
          sellerName: true,
          sellerAddress: true,
          sellerCity: true,
          sellerState: true,
          sellerZip: true,
          purchasePrice: true,
          buyerFee: true,
          transportCost: true,
          inspectionCost: true,
          registrationCost: true,
          totalPurchaseCost: true,
          purchaseDate: true,
          paymentMethod: true,
          documentBase64: true,
          sourceDocumentBase64: true,
        }
      },
      repairs: true,
      sale: true
    }
  });
  const timeSlow = Date.now() - startSlow;
  console.log(`Slow query (with base64): fetched ${vehiclesSlow.length} vehicles in ${timeSlow}ms`);
  
  console.log(`\nOptimization factor: ${(timeSlow / timeOptimized).toFixed(1)}x faster!`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
