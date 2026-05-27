import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- STARTING DATA WIPE ---')
  
  try {
    console.log('Deleting Sales records...')
    await prisma.sale.deleteMany({})
    
    console.log('Deleting Repair records...')
    await prisma.repair.deleteMany({})
    
    console.log('Deleting Purchase records...')
    await prisma.purchase.deleteMany({})
    
    console.log('Deleting Advertising expenses...')
    await prisma.advertisingExpense.deleteMany({})
    
    console.log('Deleting Business expenses...')
    await prisma.businessExpense.deleteMany({})
    
    console.log('Deleting Document Registry...')
    await prisma.documentRegistry.deleteMany({})
    
    console.log('Deleting Customer Notes...')
    await prisma.customerNote.deleteMany({})
    
    console.log('Deleting Vehicle inventory...')
    await prisma.vehicle.deleteMany({})

    console.log('--- DATA WIPE COMPLETE ---')
    console.log('Note: User accounts were preserved for login.')
  } catch (err) {
    console.error('Error during data wipe:', err)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
