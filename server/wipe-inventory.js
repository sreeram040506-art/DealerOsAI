import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Wiping inventory data...')
  
  // Delete all dependent collections first
  await prisma.customerNote.deleteMany({})
  await prisma.repair.deleteMany({})
  await prisma.purchase.deleteMany({})
  await prisma.sale.deleteMany({})
  await prisma.advertisingExpense.deleteMany({})
  await prisma.businessExpense.deleteMany({})
  await prisma.documentRegistry.deleteMany({})
  await prisma.customer.deleteMany({})
  
  // Delete vehicles
  await prisma.vehicle.deleteMany({})
  
  // We explicitly DO NOT delete:
  // - User
  // - Dealership

  console.log('Inventory data wiped successfully. Users and Dealerships have been preserved.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
