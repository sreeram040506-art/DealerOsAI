import express from 'express';
import prisma from '../db/prisma.js';
import Jimp from 'jimp';

const router = express.Router();

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

function decodeBase64(base64String) {
  const raw = base64String.includes('base64,') ? base64String.split('base64,')[1] : base64String;
  return Buffer.from(raw, 'base64');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildReasonLines({ brightness, sharpness, contrast, resolution }) {
  const reasons = [];

  if (brightness >= 95 && brightness <= 185) {
    reasons.push('Lighting looks balanced');
  } else if (brightness < 95) {
    reasons.push('Image is a bit dark');
  } else {
    reasons.push('Image is quite bright or washed out');
  }

  if (sharpness >= 18) {
    reasons.push('Edges and details are reasonably clear');
  } else {
    reasons.push('Image looks soft or slightly blurry');
  }

  if (contrast >= 30) {
    reasons.push('Contrast is healthy');
  } else {
    reasons.push('Contrast is limited');
  }

  if (resolution >= 900000) {
    reasons.push('Resolution is strong enough for inspection');
  } else {
    reasons.push('Higher resolution would improve review quality');
  }

  return reasons;
}

async function analyzeImage(imageBase64, fileName = 'image') {
  const buffer = decodeBase64(imageBase64);
  const img = await Jimp.read(buffer);
  const { width, height } = img.bitmap;
  const resolution = width * height;

  const working = img.clone().resize(240, Jimp.AUTO).grayscale();
  const { width: w, height: h } = working.bitmap;
  const values = [];
  let sum = 0;
  let diffSum = 0;
  let diffCount = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = (y * w + x) * 4;
      const px = working.bitmap.data[idx];
      values.push(px);
      sum += px;

      if (x < w - 1) {
        const right = working.bitmap.data[(y * w + (x + 1)) * 4];
        diffSum += Math.abs(px - right);
        diffCount += 1;
      }
      if (y < h - 1) {
        const down = working.bitmap.data[((y + 1) * w + x) * 4];
        diffSum += Math.abs(px - down);
        diffCount += 1;
      }
    }
  }

  const average = sum / values.length;
  const variance = values.reduce((acc, value) => acc + ((value - average) ** 2), 0) / values.length;
  const contrast = Math.sqrt(variance);
  const sharpness = diffSum / (diffCount || 1);

  const brightnessScore = clamp(30 - (Math.abs(average - 145) / 6), 0, 30);
  const sharpnessScore = clamp((sharpness / 2.2), 0, 35);
  const contrastScore = clamp((contrast / 1.8), 0, 25);
  const resolutionScore = clamp((Math.log10(Math.max(resolution, 1)) - 5.1) * 20, 0, 10);
  const score = Math.round(clamp(brightnessScore + sharpnessScore + contrastScore + resolutionScore, 0, 100));

  const reasonLines = buildReasonLines({
    brightness: average,
    sharpness,
    contrast,
    resolution,
  });

  return {
    type: 'image',
    fileName,
    score,
    verdict: score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 55 ? 'Fair' : 'Needs attention',
    reason: reasonLines.join('. '),
    reasonLines,
    metrics: {
      width,
      height,
      averageBrightness: Number(average.toFixed(2)),
      contrast: Number(contrast.toFixed(2)),
      sharpness: Number(sharpness.toFixed(2)),
      resolution,
    },
  };
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

function detectIntent(question) {
  const q = normalizeText(question);
  if (!q) return 'general';
  if (/(image|photo|picture|attachment|upload|scan|document)/.test(q)) return 'attachments';
  if (/(margin|profit|revenue|earn|sales? performance|best seller|top seller|worst seller|loss)/.test(q)) return 'sales';
  if (/(purchase|bought|buy|seller|source|cost)/.test(q)) return 'purchases';
  if (/(inventory|stock|lot|aging|days on lot|turnover|vehicles?)/.test(q)) return 'inventory';
  if (/(expense|spend|ad|advertis)/.test(q)) return 'expenses';
  if (/(compliance|title|registration|insurance|inspection|tax)/.test(q)) return 'compliance';
  if (/(document|paperwork|forms|registry)/.test(q)) return 'documents';
  if (/(customer|client|buyer|lead|note)/.test(q)) return 'customers';
  if (/(auction|bid|auction watch|market value)/.test(q)) return 'auctions';
  return 'general';
}

function buildRuleBasedAnswer(question, context, attachmentAnalysis) {
  const intent = detectIntent(question);
  const { summary, highlights } = context;
  const answerParts = [];
  const evidence = [];
  const nextSteps = [];
  let confidence = 78;
  let topic = 'general';

  if (intent === 'purchases') {
    topic = 'purchases';
    answerParts.push(`You have ${summary.purchasesCount} recorded purchases with total purchase spend of ${money(summary.totalPurchasesCost)}.`);
    if (highlights.recentPurchases.length) {
      const latest = highlights.recentPurchases[0];
      answerParts.push(`Most recent purchase: ${latest.vehicle} from ${latest.sellerName} at ${money(latest.purchasePrice)}.`);
      evidence.push(`Recent purchase: ${latest.vehicle} from ${latest.sellerName}`);
      nextSteps.push(`Review ${latest.vehicle} if you want to confirm recon, title, or turn plan.`);
    }
    if (highlights.topSources.length) {
      const topSource = highlights.topSources[0];
      answerParts.push(`Most frequent purchase source: ${topSource.source} with ${topSource.count} vehicles.`);
      evidence.push(`Top purchase source: ${topSource.source}`);
    }
    confidence += 8;
  }

  if (intent === 'inventory') {
    topic = 'inventory';
    answerParts.push(`You currently have ${summary.activeInventory} active vehicles on the lot, averaging ${summary.avgDaysOnLot} days in inventory.`);
    if (highlights.oldestInventory.length) {
      const oldest = highlights.oldestInventory.slice(0, 3);
      answerParts.push(`Oldest active units: ${oldest.map((item) => `${item.label} (${item.daysInInventory} days)`).join(', ')}.`);
      evidence.push(...oldest.map((item) => `Aging inventory: ${item.label} (${item.daysInInventory} days)`));
      nextSteps.push('Focus marketing and pricing attention on the oldest units first.');
    }
    confidence += 8;
  }

  if (intent === 'sales') {
    topic = 'sales';
    answerParts.push(`Closed sales total ${summary.soldUnits} units, ${money(summary.totalRevenue)} revenue, and ${money(summary.totalProfit)} profit at a ${percent(summary.marginPct)} margin.`);
    if (highlights.highestProfitSale) {
      answerParts.push(`Top profit sale: ${highlights.highestProfitSale.vehicle} with ${money(highlights.highestProfitSale.profit)} profit.`);
      evidence.push(`Best profit: ${highlights.highestProfitSale.vehicle}`);
    }
    if (highlights.lowestProfitSale) {
      answerParts.push(`Lowest profit sale: ${highlights.lowestProfitSale.vehicle} with ${money(highlights.lowestProfitSale.profit)} profit.`);
      evidence.push(`Lowest profit: ${highlights.lowestProfitSale.vehicle}`);
    }
    nextSteps.push('Use the highest-profit patterns to guide future pricing and sourcing.');
    confidence += 8;
  }

  if (intent === 'customers') {
    topic = 'customers';
    answerParts.push(`There are ${summary.customerCount} customers tracked in the dealership data.`);
    if (summary.totalNotes > 0) {
      answerParts.push(`Customer notes are attached to ${summary.totalNotes} records.`);
      evidence.push(`Customer note coverage: ${summary.totalNotes} records`);
    }
    confidence += 3;
  }

  if (intent === 'expenses') {
    topic = 'expenses';
    answerParts.push(`Business expenses total ${money(summary.totalBusinessExpenses)} and ad spend totals ${money(summary.totalAdSpend)}.`);
    if (highlights.expenseByCategory.length) {
      const topCategory = highlights.expenseByCategory[0];
      answerParts.push(`Largest expense category: ${topCategory.category} at ${money(topCategory.amount)}.`);
      evidence.push(`Top expense category: ${topCategory.category}`);
    }
    nextSteps.push('Check whether the largest categories are producing the return you expect.');
    confidence += 3;
  }

  if (intent === 'compliance') {
    topic = 'compliance';
    answerParts.push(`The system currently has ${summary.documentCount} document records and ${summary.complianceRecordCount} compliance records.`);
    if (highlights.pendingCompliance.length) {
      answerParts.push(`There are ${highlights.pendingCompliance.length} compliance records with at least one pending status.`);
      evidence.push(`Pending compliance records: ${highlights.pendingCompliance.length}`);
    }
    nextSteps.push('Work pending title, registration, insurance, or tax items before the deal ages further.');
    confidence += 3;
  }

  if (intent === 'documents') {
    topic = 'documents';
    answerParts.push(`The system currently has ${summary.documentCount} document records.`);
    if (summary.documentCount === 0) {
      nextSteps.push('Upload bills of sale, purchase docs, and registry records so the assistant can answer paperwork questions more precisely.');
    }
    confidence += 2;
  }

  if (intent === 'auctions') {
    topic = 'auctions';
    answerParts.push(`Auction watch currently has ${summary.auctionWatchCount} records.`);
    if (highlights.auctionOpportunities.length) {
      const best = highlights.auctionOpportunities[0];
      answerParts.push(`Top auction opportunity: ${best.vehicle} with market value ${money(best.marketValue)} and recommended max bid ${money(best.recommendedMaxBid)}.`);
      evidence.push(`Auction opportunity: ${best.vehicle}`);
    }
    nextSteps.push('Use market value and recommended bid together before placing a bid.');
    confidence += 3;
  }

  if (intent === 'attachments') {
    topic = 'attachments';
    if (attachmentAnalysis.length) {
      const topAttachment = [...attachmentAnalysis].sort((a, b) => b.score - a.score)[0];
      answerParts.push(`I reviewed ${attachmentAnalysis.length} image(s). Best score: ${topAttachment.fileName} at ${topAttachment.score}/100 (${topAttachment.verdict}).`);
      answerParts.push(topAttachment.reason);
      evidence.push(`Image score: ${topAttachment.fileName} => ${topAttachment.score}/100`);
      nextSteps.push(...topAttachment.reasonLines.slice(0, 2));
      confidence = Math.min(96, confidence + 10);
    }
  }

  if (!answerParts.length) {
    const capabilityList = [
      `${summary.activeInventory} active vehicles`,
      `${summary.purchasesCount} purchases`,
      `${summary.soldUnits} closed sales`,
      `${summary.customerCount} customers`,
      `${summary.documentCount} documents`,
      `${summary.complianceRecordCount} compliance records`,
      `${summary.auctionWatchCount} auction watch records`,
    ];
    answerParts.push(`I can answer questions about ${capabilityList.join(', ')}. Ask about profit, aging stock, purchase costs, expense categories, compliance, documents, customers, auctions, or uploaded images.`);
    confidence -= 8;
    nextSteps.push('Try a more specific question such as "Which vehicles are over 90 days old?" or "Show my highest profit sale."');
  }

  if (attachmentAnalysis.length && intent !== 'attachments') {
    const topAttachment = [...attachmentAnalysis].sort((a, b) => b.score - a.score)[0];
    answerParts.push(`I also reviewed ${attachmentAnalysis.length} image(s). Best score: ${topAttachment.fileName} at ${topAttachment.score}/100.`);
    evidence.push(`Image review completed for ${attachmentAnalysis.length} attachment(s)`);
    confidence = Math.min(96, confidence + 4);
  }

  return {
    topic,
    answer: answerParts.join(' '),
    confidence: clamp(confidence, 48, 96),
    reason: [
      `Grounded in live dealership data: ${summary.activeInventory} active vehicles, ${summary.purchasesCount} purchases, ${summary.soldUnits} sales.`,
      evidence.length ? `Evidence used: ${evidence.join('; ')}.` : 'Answer was generated from summary-level dealership records.',
      attachmentAnalysis.length ? `Image attachments were scored directly and included in the response.` : 'No attachments were included.',
    ].join(' '),
    evidence,
    nextSteps: uniqueStrings(nextSteps).slice(0, 5),
    facts: uniqueStrings(evidence).slice(0, 8),
  };
}

async function getOpenAiAnswer({ question, context, attachmentAnalysis, answerPlan }) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey || openaiApiKey === 'YOUR_OPENAI_API_KEY_HERE') {
    return null;
  }

  const systemPrompt = `You are the dealership intelligence assistant for a used-car dealership platform.
Answer only using the provided dealership context and the precomputed facts. Do not invent facts.
Prefer the exact numbers and named records already provided. If the data does not support a precise answer, say so and ask for a more specific question.
Be direct, confident, and concise.
Return JSON with this shape:
{
  "answer": "string",
  "confidence": number,
  "reason": "string",
  "evidence": ["string"],
  "nextSteps": ["string"],
  "topic": "string"
}

When image attachments are present, include their scores and the reason for each score in the answer.`;

  const userPrompt = JSON.stringify({
    question,
    dealershipContext: context,
    attachments: attachmentAnalysis,
    factsToPreserve: answerPlan,
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
      max_tokens: 700,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'OpenAI request failed');
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
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

router.get('/', async (req, res, next) => {
  try {
    const context = await loadContext(req.dealershipId);
    const summary = context.summary;

    const insights = [
      `You have ${summary.activeInventory} active vehicles and ${summary.soldUnits} closed sales.`,
      `Purchases total ${money(summary.totalPurchasesCost)} and gross margin sits at ${percent(summary.marginPct)}.`,
      context.highlights.oldestInventory?.length
        ? `${context.highlights.oldestInventory[0].label} is the oldest active unit at ${context.highlights.oldestInventory[0].daysInInventory} days.`
        : 'No active inventory is currently on the lot.',
    ];

    res.json({
      summary,
      highlights: context.highlights,
      dealership: context.dealership,
      insights,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/ask', async (req, res, next) => {
  try {
    const question = String(req.body.question || '').trim();
    const attachmentList = Array.isArray(req.body.attachments) ? req.body.attachments : [];

    if (!question && attachmentList.length === 0) {
      return res.status(400).json({ message: 'Question or attachments are required' });
    }

    const context = await loadContext(req.dealershipId);
    const attachmentAnalysis = [];

    for (const attachment of attachmentList) {
      if (!attachment?.base64 || typeof attachment.fileType !== 'string') continue;
      if (!attachment.fileType.startsWith('image/')) continue;
      const analysis = await analyzeImage(attachment.base64, attachment.fileName || 'image');
      attachmentAnalysis.push(analysis);
    }

    const answerPlan = buildRuleBasedAnswer(question, context, attachmentAnalysis);

    const openAiAnswer = await getOpenAiAnswer({
      question,
      context,
      attachmentAnalysis,
      answerPlan,
    }).catch((error) => {
      console.error('AI insights OpenAI error:', error);
      return null;
    });

    if (openAiAnswer) {
      const confidence = clamp(Number(openAiAnswer.confidence ?? 84), 0, 100);
      return res.json({
        answer: openAiAnswer.answer || 'No answer returned.',
        confidence,
        reason: openAiAnswer.reason || 'Generated from live dealership context.',
        evidence: Array.isArray(openAiAnswer.evidence) ? openAiAnswer.evidence : [],
        nextSteps: Array.isArray(openAiAnswer.nextSteps) ? openAiAnswer.nextSteps : answerPlan.nextSteps,
        topic: String(openAiAnswer.topic || answerPlan.topic || 'general'),
        facts: answerPlan.facts,
        attachments: attachmentAnalysis,
        summary: context.summary,
        generatedAt: new Date().toISOString(),
        source: 'openai',
      });
    }

    return res.json({
      ...answerPlan,
      attachments: attachmentAnalysis,
      summary: context.summary,
      generatedAt: new Date().toISOString(),
      source: 'rules',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
