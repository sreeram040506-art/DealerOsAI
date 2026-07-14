import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function money(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function percent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function buildDealershipSnapshot({ dealership, vehicles, purchases, sales, expenses, advertisingExpenses, customers, documents, complianceRecords, auctions }) {
  const activeVehicles = vehicles.filter((vehicle) => vehicle.status !== 'Sold');
  const soldVehicles = sales;
  const totalRepairCost = vehicles.reduce((total, vehicle) => {
    const repairTotal = (vehicle.repairs || []).reduce((repairSum, repair) => repairSum + safeNumber(repair.partsCost) + safeNumber(repair.laborCost), 0);
    return total + repairTotal;
  }, 0);
  const totalInventoryCost = activeVehicles.reduce((total, vehicle) => {
    const purchase = vehicle.purchase;
    if (!purchase) return total;
    return total
      + safeNumber(purchase.purchasePrice)
      + safeNumber(purchase.buyerFee)
      + safeNumber(purchase.transportCost)
      + safeNumber(purchase.inspectionCost)
      + safeNumber(purchase.registrationCost)
      + ((vehicle.repairs || []).reduce((repairSum, repair) => repairSum + safeNumber(repair.partsCost) + safeNumber(repair.laborCost), 0));
  }, 0);
  const totalRevenue = soldVehicles.reduce((total, sale) => total + safeNumber(sale.salePrice), 0);
  const totalProfit = soldVehicles.reduce((total, sale) => total + safeNumber(sale.profit), 0);
  const marginPct = totalRevenue ? Number(((totalProfit / totalRevenue) * 100).toFixed(2)) : 0;
  const avgDaysOnLot = activeVehicles.length
    ? Math.round(activeVehicles.reduce((sum, vehicle) => sum + safeNumber(vehicle.daysInInventory), 0) / activeVehicles.length)
    : 0;

  const makeCounts = new Map();
  const purchaseSourceCounts = new Map();
  const profitVehicles = soldVehicles
    .map((sale) => ({
      vehicle: sale.vehicle,
      profit: safeNumber(sale.profit),
      salePrice: safeNumber(sale.salePrice),
      saleDate: sale.saleDate,
    }))
    .filter((sale) => sale.vehicle);

  for (const sale of soldVehicles) {
    const make = sale?.vehicle?.make || 'Unknown';
    makeCounts.set(make, (makeCounts.get(make) || 0) + 1);
  }

  for (const purchase of purchases) {
    const source = purchase?.sellerName || 'Unknown source';
    purchaseSourceCounts.set(source, (purchaseSourceCounts.get(source) || 0) + 1);
  }

  const topMakes = [...makeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([make, count]) => ({ make, count }));

  const topSources = [...purchaseSourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source, count]) => ({ source, count }));

  const oldestInventory = [...activeVehicles]
    .sort((a, b) => safeNumber(b.daysInInventory) - safeNumber(a.daysInInventory))
    .slice(0, 5)
    .map((vehicle) => ({
      vin: vehicle.vin,
      label: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      daysInInventory: safeNumber(vehicle.daysInInventory),
      purchaseDate: vehicle.purchaseDate,
    }));

  const highestProfitSale = [...profitVehicles].sort((a, b) => b.profit - a.profit)[0] || null;
  const lowestProfitSale = [...profitVehicles].sort((a, b) => a.profit - b.profit)[0] || null;
  const recentPurchases = [...purchases]
    .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())
    .slice(0, 5)
    .map((purchase) => ({
      vehicle: purchase.vehicle ? `${purchase.vehicle.year} ${purchase.vehicle.make} ${purchase.vehicle.model}` : 'Unknown vehicle',
      sellerName: purchase.sellerName,
      purchasePrice: safeNumber(purchase.purchasePrice),
      purchaseDate: purchase.purchaseDate,
      totalPurchaseCost: safeNumber(purchase.totalPurchaseCost),
    }));

  const recentSales = [...soldVehicles]
    .sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime())
    .slice(0, 5)
    .map((sale) => ({
      vehicle: sale.vehicle ? `${sale.vehicle.year} ${sale.vehicle.make} ${sale.vehicle.model}` : 'Unknown vehicle',
      customerName: sale.customerName,
      salePrice: safeNumber(sale.salePrice),
      profit: safeNumber(sale.profit),
      saleDate: sale.saleDate,
    }));

  const recentExpenses = [...expenses]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const totalPurchasesCost = purchases.reduce((total, purchase) => total + safeNumber(purchase.totalPurchaseCost), 0);
  const totalBusinessExpenses = expenses.reduce((total, expense) => total + safeNumber(expense.amount), 0);
  const totalAdSpend = advertisingExpenses.reduce((total, ad) => total + safeNumber(ad.amountSpent), 0);
  const totalNotes = customers.reduce((total, customer) => total + (customer.notes && String(customer.notes).trim() ? 1 : 0), 0);
  const expenseByCategory = [...expenses].reduce((acc, expense) => {
    const category = expense.category || 'Uncategorized';
    acc.set(category, (acc.get(category) || 0) + safeNumber(expense.amount));
    return acc;
  }, new Map());
  const pendingCompliance = complianceRecords.filter((record) => {
    const flags = [record.titleTransfer, record.registrationStatus, record.inspectionValidity, record.insuranceVerification, record.taxSubmission];
    return flags.some((value) => String(value || '').toUpperCase() === 'PENDING');
  });
  const auctionOpportunities = auctions
    .filter((auction) => auction.status !== 'CLOSED')
    .sort((a, b) => safeNumber(b.marketValue) - safeNumber(a.marketValue))
    .slice(0, 5)
    .map((auction) => ({
      vehicle: [auction.year, auction.make, auction.model].filter(Boolean).join(' '),
      marketValue: safeNumber(auction.marketValue),
      recommendedMaxBid: safeNumber(auction.recommendedMaxBid),
      status: auction.status,
    }));

  return {
    dealership: {
      name: dealership?.name || 'Your dealership',
      address: dealership?.address || null,
      phone: dealership?.phone || null,
      email: dealership?.email || null,
      createdAt: dealership?.createdAt || null,
    },
    summary: {
      activeInventory: activeVehicles.length,
      soldUnits: soldVehicles.length,
      purchasesCount: purchases.length,
      customerCount: customers.length,
      documentCount: documents.length,
      complianceRecordCount: complianceRecords.length,
      auctionWatchCount: auctions.length,
      avgDaysOnLot,
      totalRevenue,
      totalProfit,
      marginPct,
      totalPurchasesCost,
      totalInventoryCost,
      totalRepairCost,
      totalBusinessExpenses,
      totalAdSpend,
      totalNotes,
    },
    highlights: {
      topMakes,
      topSources,
      oldestInventory,
      recentPurchases,
      recentSales,
      recentExpenses,
      expenseByCategory: [...expenseByCategory.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category, amount]) => ({ category, amount })),
      pendingCompliance: pendingCompliance.slice(0, 5).map((record) => ({
        vin: record.vin,
        titleTransfer: record.titleTransfer,
        registrationStatus: record.registrationStatus,
        inspectionValidity: record.inspectionValidity,
        insuranceVerification: record.insuranceVerification,
        taxSubmission: record.taxSubmission,
      })),
      auctionOpportunities,
      highestProfitSale: highestProfitSale ? {
        vehicle: `${highestProfitSale.vehicle.year} ${highestProfitSale.vehicle.make} ${highestProfitSale.vehicle.model}`,
        profit: highestProfitSale.profit,
        salePrice: highestProfitSale.salePrice,
      } : null,
      lowestProfitSale: lowestProfitSale ? {
        vehicle: `${lowestProfitSale.vehicle.year} ${lowestProfitSale.vehicle.make} ${lowestProfitSale.vehicle.model}`,
        profit: lowestProfitSale.profit,
        salePrice: lowestProfitSale.salePrice,
      } : null,
    },
  };
}

async function loadContext(dealershipId) {
  const [
    dealership,
    vehicles,
    purchases,
    sales,
    expenses,
    advertisingExpenses,
    customers,
    documents,
    complianceRecords,
    auctions,
  ] = await Promise.all([
    prisma.dealership.findUnique({
      where: { id: dealershipId },
      select: { name: true, address: true, phone: true, email: true, createdAt: true },
    }),
    prisma.vehicle.findMany({
      where: { dealershipId },
      select: {
        vin: true,
        make: true,
        model: true,
        year: true,
        mileage: true,
        status: true,
        purchaseDate: true,
        daysInInventory: true,
        purchase: {
          select: {
            sellerName: true,
            purchasePrice: true,
            buyerFee: true,
            transportCost: true,
            inspectionCost: true,
            registrationCost: true,
            totalPurchaseCost: true,
          },
        },
        repairs: {
          select: {
            partsCost: true,
            laborCost: true,
            repairDate: true,
          },
        },
      },
    }),
    prisma.purchase.findMany({
      where: { dealershipId },
      include: {
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            vin: true,
            daysInInventory: true,
          },
        },
      },
    }),
    prisma.sale.findMany({
      where: { dealershipId },
      include: {
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            vin: true,
          },
        },
      },
    }),
    prisma.businessExpense.findMany({
      where: { dealershipId },
      select: { category: true, amount: true, date: true, notes: true },
    }),
    prisma.advertisingExpense.findMany({
      where: { dealershipId },
      select: { campaignName: true, platform: true, amountSpent: true, startDate: true, endDate: true, status: true },
    }),
    prisma.customer.findMany({
      where: { dealershipId },
      select: { firstName: true, lastName: true, phone: true, email: true, createdAt: true, notes: true },
    }),
    prisma.documentRegistry.findMany({
      where: { dealershipId },
      select: { vin: true, make: true, model: true, year: true, documentType: true, createdAt: true },
    }),
    prisma.complianceRecord.findMany({
      where: { dealershipId },
      select: { vin: true, titleTransfer: true, registrationStatus: true, inspectionValidity: true, insuranceVerification: true, taxSubmission: true, updatedAt: true },
    }),
    prisma.auctionVehicle.findMany({
      where: { dealershipId },
      select: { make: true, model: true, year: true, status: true, recommendedMaxBid: true, marketValue: true, createdAt: true },
    }),
  ]);

  const context = buildDealershipSnapshot({
    dealership,
    vehicles,
    purchases,
    sales,
    expenses,
    advertisingExpenses,
    customers,
    documents,
    complianceRecords,
    auctions,
  });

  return {
    dealership,
    vehicles,
    purchases,
    sales,
    expenses,
    advertisingExpenses,
    customers,
    documents,
    complianceRecords,
    auctions,
    ...context,
  };
}

async function run() {
  const users = await prisma.user.findMany({ select: { dealershipId: true } });
  if (users.length === 0) {
    console.log("No users found");
    return;
  }
  const dealershipId = users[0].dealershipId;
  console.log("Testing with dealershipId:", dealershipId);
  try {
    const context = await loadContext(dealershipId);
    console.log("SUCCESS!");
    console.log("Dealership name:", context.dealership.name);
    console.log("Active inventory count:", context.summary.activeInventory);
    console.log("Insights generated:");
    const summary = context.summary;
    const insights = [
      `You have ${summary.activeInventory} active vehicles and ${summary.soldUnits} closed sales.`,
      `Purchases total ${money(summary.totalPurchasesCost)} and gross margin sits at ${percent(summary.marginPct)}.`,
      context.highlights.oldestInventory?.length
        ? `${context.highlights.oldestInventory[0].label} is the oldest active unit at ${context.highlights.oldestInventory[0].daysInInventory} days.`
        : 'No active inventory is currently on the lot.',
    ];
    console.log(insights);
  } catch (err) {
    console.error("FAILED with error:", err);
  }
}

run().finally(() => prisma.$disconnect());
