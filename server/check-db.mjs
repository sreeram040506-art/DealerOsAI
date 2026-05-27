import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const v = await prisma.vehicle.findMany({ include: { purchase: true, sale: true }, take: 5, orderBy: { createdAt: 'desc' }});
  console.log(v.map(v => ({ id: v.id, make: v.make, hasDoc: !!v.purchase?.documentBase64, hasSource: !!v.purchase?.sourceDocumentBase64, hasSale: !!v.sale, hasBillOfSale: v.sale?.hasBillOfSale })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
