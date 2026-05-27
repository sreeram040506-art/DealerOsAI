import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminPassword = await bcrypt.hash('password123', 10)
  const staffPassword = await bcrypt.hash('password123', 10)
  const managerPassword = await bcrypt.hash('password123', 10)

  console.log('Clearing existing data...')
  await prisma.customerNote.deleteMany({})
  await prisma.repair.deleteMany({})
  await prisma.purchase.deleteMany({})
  await prisma.sale.deleteMany({})
  await prisma.advertisingExpense.deleteMany({})
  await prisma.businessExpense.deleteMany({})
  await prisma.documentRegistry.deleteMany({})
  await prisma.customer.deleteMany({})
  await prisma.vehicle.deleteMany({})
  await prisma.user.deleteMany({})
  await prisma.dealership.deleteMany({})

  console.log('Creating default dealership...')
  const dealership = await prisma.dealership.create({
    data: {
      name: 'Main Dealership',
      slug: 'main',
      address: '123 Main St',
      phone: '555-1234',
      email: 'contact@maindealership.com'
    }
  })

  // Seed Users
  await prisma.user.create({
    data: {
      email: 'admin@gmail.com',
      password: adminPassword,
      name: 'Admin User',
      role: 'ADMIN',
      dealershipId: dealership.id
    },
  })

  await prisma.user.create({
    data: {
      email: 'manager@gmail.com',
      password: managerPassword,
      name: 'Manager User',
      role: 'MANAGER',
      dealershipId: dealership.id
    },
  })

  await prisma.user.create({
    data: {
      email: 'staff@gmail.com',
      password: staffPassword,
      name: 'Staff User',
      role: 'STAFF',
      dealershipId: dealership.id
    },
  })

  console.log('Seeding vehicles...')
  const vehicles = [
    {
      vin: '1HGCM82633A004352',
      make: 'Honda',
      model: 'Civic',
      year: 2021,
      mileage: 32000,
      color: 'Silver',
      purchaseDate: new Date('2024-01-15T00:00:00Z'),
      status: 'Available',
      dealershipId: dealership.id,
      purchase: {
        create: {
          sellerName: 'Auction',
          purchasePrice: 12000,
          transportCost: 350,
          totalPurchaseCost: 12350,
          purchaseDate: new Date('2024-01-15T00:00:00Z'),
          paymentMethod: 'Bank Transfer',
          dealershipId: dealership.id
        }
      },
      repairs: {
        create: [
          { repairShop: 'Main Auto', partsCost: 500, laborCost: 300, description: 'Brake service', dealershipId: dealership.id }
        ]
      }
    },
    {
      vin: '2T1BR32EXX6004321',
      make: 'Toyota',
      model: 'Corolla',
      year: 2022,
      mileage: 18000,
      color: 'White',
      purchaseDate: new Date('2024-02-10T00:00:00Z'),
      status: 'Sold',
      dealershipId: dealership.id,
      purchase: {
        create: {
          sellerName: 'Dealer',
          purchasePrice: 15000,
          transportCost: 400,
          totalPurchaseCost: 15400,
          purchaseDate: new Date('2024-02-10T00:00:00Z'),
          paymentMethod: 'Check',
          dealershipId: dealership.id
        }
      },
      repairs: {
        create: [
          { repairShop: 'Detail Pro', partsCost: 50, laborCost: 150, description: 'Buffing and polish', dealershipId: dealership.id }
        ]
      }
    },
    {
      vin: 'JF1GD29632G009876',
      make: 'Subaru',
      model: 'Impreza',
      year: 2020,
      mileage: 45000,
      color: 'Blue',
      purchaseDate: new Date('2024-03-01T00:00:00Z'),
      status: 'Reserved',
      dealershipId: dealership.id,
      purchase: {
        create: {
          sellerName: 'Individual',
          purchasePrice: 9000,
          transportCost: 0,
          totalPurchaseCost: 9000,
          purchaseDate: new Date('2024-03-01T00:00:00Z'),
          paymentMethod: 'Cash',
          dealershipId: dealership.id
        }
      },
      repairs: {
        create: [
          { repairShop: 'Engine Plus', partsCost: 800, laborCost: 400, description: 'Gasket replacement', dealershipId: dealership.id }
        ]
      }
    },
    {
      vin: '5UXWX7C51H0U998877',
      make: 'BMW',
      model: 'X3',
      year: 2023,
      mileage: 5000,
      color: 'Black',
      purchaseDate: new Date('2024-03-10T00:00:00Z'),
      status: 'Available',
      dealershipId: dealership.id,
      purchase: {
        create: {
          sellerName: 'Auction',
          purchasePrice: 35000,
          transportCost: 800,
          totalPurchaseCost: 35800,
          purchaseDate: new Date('2024-03-10T00:00:00Z'),
          paymentMethod: 'Bank Transfer',
          dealershipId: dealership.id
        }
      }
    }
  ]

  const createdVehicles = []
  for (const v of vehicles) {
    const vehicle = await prisma.vehicle.create({ 
      data: v,
      include: { purchase: true, repairs: true }
    })
    createdVehicles.push(vehicle)
  }

  console.log('Seeding sales...')
  const soldVehicle = createdVehicles.find(v => v.model === 'Corolla')
  if (soldVehicle) {
    await prisma.sale.create({
      data: {
        vehicleId: soldVehicle.id,
        customerName: 'John Doe',
        phone: '555-0199',
        address: '123 Maple St, Springfield',
        saleDate: new Date('2024-02-25T00:00:00Z'),
        salePrice: 19500,
        paymentMethod: 'Bank Transfer',
        profit: 3500,
        financeCompany: 'Chase Auto',
        downPayment: 3000,
        loanAmount: 16500,
        interestRate: 5.9,
        loanTerm: 60,
        monthlyPayment: 318.50,
        dealershipId: dealership.id
      }
    })
  }

  console.log('Seeding advertising...')
  await prisma.advertisingExpense.createMany({
    data: [
      {
        campaignName: 'Facebook Spring Sale',
        platform: 'Facebook',
        startDate: new Date('2024-03-01T00:00:00Z'),
        endDate: new Date('2024-03-31T00:00:00Z'),
        amountSpent: 500,
        dealershipId: dealership.id
      },
      {
        campaignName: 'Google Search Ads',
        platform: 'Google',
        startDate: new Date('2024-03-15T00:00:00Z'),
        endDate: new Date('2024-04-15T00:00:00Z'),
        amountSpent: 1200,
        dealershipId: dealership.id
      }
    ]
  })

  console.log('Seeding business expenses...')
  await prisma.businessExpense.createMany({
    data: [
      {
        category: 'Rent',
        amount: 3500,
        date: new Date('2024-03-01T00:00:00Z'),
        notes: 'Monthly lot rent',
        dealershipId: dealership.id
      },
      {
        category: 'Utilities',
        amount: 450,
        date: new Date('2024-03-05T00:00:00Z'),
        notes: 'Electricity and water',
        dealershipId: dealership.id
      },
      {
        category: 'Insurance',
        amount: 800,
        date: new Date('2024-03-10T00:00:00Z'),
        notes: 'Liability insurance',
        dealershipId: dealership.id
      }
    ]
  })

  console.log('Seeding finished.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
