import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
const prisma = new PrismaClient();

async function main() {
  const dealers = await prisma.dealership.findMany({ take: 10 });
  console.log('Found dealerships:', dealers.length);
  dealers.forEach(d => console.log(d.id, d.name, d.slug));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
