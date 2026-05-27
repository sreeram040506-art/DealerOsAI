import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupRegistry() {
  console.log('--- STARTING REGISTRY CLEANUP ---');
  
  try {
    const allLogs = await prisma.documentRegistry.findMany({
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`Total entries in registry: ${allLogs.length}`);
    
    const seen = new Set();
    const idsToKeep = [];
    const idsToDelete = [];
    
    for (const log of allLogs) {
      const type = log.documentType || 'Used Vehicle Record';
      const key = `${log.vin}-${type}`;
      
      if (seen.has(key)) {
        idsToDelete.push(log.id);
      } else {
        seen.add(key);
        idsToKeep.push(log.id);
      }
    }
    
    console.log(`Entries to keep: ${idsToKeep.length}`);
    console.log(`Duplicates to delete: ${idsToDelete.length}`);
    
    if (idsToDelete.length > 0) {
      const deleteResult = await prisma.documentRegistry.deleteMany({
        where: {
          id: { in: idsToDelete }
        }
      });
      console.log(`Successfully deleted ${deleteResult.count} duplicate entries.`);
    } else {
      console.log('No duplicates found.');
    }
    
    console.log('--- REGISTRY CLEANUP COMPLETE ---');
  } catch (err) {
    console.error('Error during registry cleanup:', err);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupRegistry();
