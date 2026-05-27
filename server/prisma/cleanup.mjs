import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.documentRegistry.findMany({
    orderBy: { createdAt: 'desc' }
  });
  
  const seen = new Set();
  let count = 0;
  
  for (const log of logs) {
    const type = log.documentType || 'Used Vehicle Record';
    const key = `${log.vin}-${type}`;
    
    if (seen.has(key)) {
      await prisma.documentRegistry.delete({
        where: { id: log.id }
      });
      console.log(`Deleted duplicate: ${log.vin}`);
      count++;
    } else {
      seen.add(key);
    }
  }
  
  console.log(`Cleanup finished. Deleted ${count} duplicates.`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
