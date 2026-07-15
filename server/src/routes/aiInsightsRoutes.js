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

function generateVehicleRecommendation(vehicle, allVehicles, sales) {
  const days = safeNumber(vehicle.daysInInventory);
  const holdingCost = days * 35;
  const label = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const purchase = vehicle.purchase;
  const purchasePrice = purchase ? safeNumber(purchase.purchasePrice) : 0;
  const totalCost = purchase ? safeNumber(purchase.totalPurchaseCost) : 0;
  const repairCost = (vehicle.repairs || []).reduce((s, r) => s + safeNumber(r.partsCost) + safeNumber(r.laborCost), 0);
  const totalInvested = totalCost + repairCost;

  // Check how well this make/model sells
  const sameMakeSales = sales.filter(s => s.vehicle && s.vehicle.make === vehicle.make);
  const sameModelSales = sales.filter(s => s.vehicle && s.vehicle.make === vehicle.make && s.vehicle.model === vehicle.model);
  const avgModelProfit = sameModelSales.length
    ? sameModelSales.reduce((sum, s) => sum + safeNumber(s.profit), 0) / sameModelSales.length
    : null;

  // Count how many of same make are on lot
  const sameMakeOnLot = allVehicles.filter(v => v.status !== 'Sold' && v.make === vehicle.make).length;

  if (days >= 120) {
    const lossEstimate = holdingCost + repairCost;
    return `URGENT: ${label} has been on lot ${days} days with ${money(holdingCost)} in holding costs alone. Total invested: ${money(totalInvested)}. At this age, auction liquidation is recommended — every additional day adds $35 in losses. Consider wholesale or dealer-to-dealer swap immediately.`;
  }

  if (days >= 90) {
    let rec = `${label} is at ${days} days (${money(holdingCost)} holding cost). This unit has crossed the critical threshold.`;
    if (avgModelProfit !== null && avgModelProfit > 0) {
      rec += ` Similar ${vehicle.make} ${vehicle.model} units sold at avg ${money(avgModelProfit)} profit — a 10-15% price reduction could still recover margin.`;
    } else {
      rec += ` No recent comparable sales found for this model. Consider aggressive repricing (10%+ drop) or move to auction.`;
    }
    rec += ` List on 3+ platforms simultaneously to maximize exposure.`;
    return rec;
  }

  if (days >= 60) {
    let rec = `${label} at ${days} days — approaching critical territory (${money(holdingCost)} holding cost so far).`;
    if (sameMakeOnLot > 2) {
      rec += ` You have ${sameMakeOnLot} ${vehicle.make} units on lot — oversaturation may slow turnover. Consider a 5% price drop on this unit to differentiate.`;
    } else if (sameMakeSales.length > 0) {
      rec += ` ${vehicle.make} models have moved well (${sameMakeSales.length} sold) — a targeted Facebook/Instagram ad campaign could accelerate this sale.`;
    } else {
      rec += ` Suggest dropping price by 5% and launching targeted social media ads. Feature this unit prominently on your website.`;
    }
    return rec;
  }

  // 45-59 days
  let rec = `${label} entering the aging zone at ${days} days.`;
  if (purchasePrice > 0 && totalInvested > purchasePrice * 1.25) {
    rec += ` Total investment (${money(totalInvested)}) is 25%+ above purchase price due to repairs — price aggressively to avoid further losses.`;
  } else if (sameMakeSales.length > 2) {
    rec += ` Good news: ${vehicle.make} sells well at your lot (${sameMakeSales.length} units sold). Refresh listing photos, add a test-drive promotion, and prioritize in showroom rotation.`;
  } else {
    rec += ` Schedule fresh listing photos, activate social ads, and consider a limited-time promotion to drive showroom traffic.`;
  }
  return rec;
}

function calculateHealthScore(context) {
  const { summary, highlights } = context;
  let score = 70; // baseline

  // Inventory turnover factor (higher avg days = lower score)
  if (summary.avgDaysOnLot <= 25) score += 12;
  else if (summary.avgDaysOnLot <= 40) score += 6;
  else if (summary.avgDaysOnLot >= 60) score -= 12;
  else if (summary.avgDaysOnLot >= 45) score -= 6;

  // Aging inventory penalty
  const activeVehicles = summary.activeInventory || 1;
  const agingCount = (highlights.oldestInventory || []).filter(v => v.daysInInventory >= 45).length;
  const agingRatio = agingCount / activeVehicles;
  if (agingRatio > 0.4) score -= 15;
  else if (agingRatio > 0.2) score -= 8;
  else if (agingRatio === 0) score += 8;

  // Profit margin factor
  if (summary.marginPct >= 18) score += 10;
  else if (summary.marginPct >= 10) score += 5;
  else if (summary.marginPct < 5 && summary.soldUnits > 0) score -= 8;

  // Sales activity
  if (summary.soldUnits >= 10) score += 5;
  else if (summary.soldUnits === 0) score -= 10;

  // Compliance penalty
  const pendingCount = (highlights.pendingCompliance || []).length;
  if (pendingCount > 3) score -= 10;
  else if (pendingCount > 0) score -= 4;

  // Document coverage
  if (summary.documentCount > summary.activeInventory) score += 3;

  return clamp(Math.round(score), 0, 100);
}

function generateDynamicInsights(context) {
  const { summary, highlights, vehicles, sales, purchases, expenses, advertisingExpenses, complianceRecords, auctions } = context;
  const insights = [];

  // --- CRITICAL AGING (90+ days) ---
  const activeVehicles = (vehicles || []).filter(v => v.status !== 'Sold');
  const critical = activeVehicles.filter(v => safeNumber(v.daysInInventory) >= 90);
  const highRisk = activeVehicles.filter(v => safeNumber(v.daysInInventory) >= 60 && safeNumber(v.daysInInventory) < 90);
  const warning = activeVehicles.filter(v => safeNumber(v.daysInInventory) >= 45 && safeNumber(v.daysInInventory) < 60);

  if (critical.length > 0) {
    const totalHoldingCost = critical.reduce((sum, v) => sum + safeNumber(v.daysInInventory) * 35, 0);
    const worstUnit = critical.sort((a, b) => safeNumber(b.daysInInventory) - safeNumber(a.daysInInventory))[0];
    insights.push({
      category: 'Critical Aging',
      severity: 'critical',
      icon: '🔴',
      title: `${critical.length} vehicle${critical.length > 1 ? 's' : ''} past 90-day mark`,
      description: `${worstUnit.year} ${worstUnit.make} ${worstUnit.model} is the oldest at ${safeNumber(worstUnit.daysInInventory)} days. Combined holding cost for all critical units: ${money(totalHoldingCost)}. Immediate action required — consider auction, wholesale, or aggressive price cuts.`,
      actionable: `Price drop or auction ${worstUnit.year} ${worstUnit.make} ${worstUnit.model}`,
      vehicleIds: critical.map(v => v.vin),
    });
  }

  if (highRisk.length > 0) {
    const totalHoldingCost = highRisk.reduce((sum, v) => sum + safeNumber(v.daysInInventory) * 35, 0);
    insights.push({
      category: 'High-Risk Aging',
      severity: 'warning',
      icon: '🟠',
      title: `${highRisk.length} vehicle${highRisk.length > 1 ? 's' : ''} in 60–89 day zone`,
      description: `These units are approaching critical territory with ${money(totalHoldingCost)} combined holding costs. Targeted marketing and 5% price reductions recommended before they cross 90 days.`,
      actionable: 'Launch targeted ads for high-risk inventory',
      vehicleIds: highRisk.map(v => v.vin),
    });
  }

  if (warning.length > 0) {
    insights.push({
      category: 'Aging Watch',
      severity: 'info',
      icon: '🟡',
      title: `${warning.length} vehicle${warning.length > 1 ? 's' : ''} entering aging zone (45–59 days)`,
      description: `These units just crossed the 45-day threshold. Refresh listing photos, activate social media campaigns, and consider promotional pricing to accelerate turnover.`,
      actionable: 'Refresh listings and boost marketing',
      vehicleIds: warning.map(v => v.vin),
    });
  }

  // --- PROFIT TRENDS ---
  if (summary.soldUnits > 0) {
    const marginStatus = summary.marginPct >= 15 ? 'healthy' : summary.marginPct >= 8 ? 'moderate' : 'thin';
    let profitDesc = `Gross margin is at ${percent(summary.marginPct)} across ${summary.soldUnits} sales (${money(summary.totalRevenue)} revenue, ${money(summary.totalProfit)} profit).`;
    if (highlights.highestProfitSale) {
      profitDesc += ` Best deal: ${highlights.highestProfitSale.vehicle} at ${money(highlights.highestProfitSale.profit)} profit.`;
    }
    if (highlights.lowestProfitSale && highlights.lowestProfitSale.profit < 0) {
      profitDesc += ` ⚠️ Loss detected: ${highlights.lowestProfitSale.vehicle} at ${money(highlights.lowestProfitSale.profit)}.`;
    }
    insights.push({
      category: 'Profit Trends',
      severity: marginStatus === 'thin' ? 'warning' : 'success',
      icon: '💰',
      title: `${marginStatus === 'healthy' ? 'Strong' : marginStatus === 'moderate' ? 'Moderate' : 'Thin'} margins at ${percent(summary.marginPct)}`,
      description: profitDesc,
      actionable: marginStatus === 'thin' ? 'Review pricing strategy' : 'Maintain current strategy',
    });
  } else {
    insights.push({
      category: 'Profit Trends',
      severity: 'info',
      icon: '💰',
      title: 'No closed sales yet',
      description: 'Focus on competitive pricing and marketing to close your first deals. Every unit sitting on the lot costs $35/day.',
      actionable: 'Set competitive prices and launch ads',
    });
  }

  // --- INVENTORY HEALTH ---
  if (summary.activeInventory > 0) {
    const makeCounts = {};
    activeVehicles.forEach(v => {
      makeCounts[v.make] = (makeCounts[v.make] || 0) + 1;
    });
    const topMake = Object.entries(makeCounts).sort((a, b) => b[1] - a[1])[0];
    const topMakePercent = topMake ? Math.round((topMake[1] / summary.activeInventory) * 100) : 0;

    let invDesc = `${summary.activeInventory} vehicles on lot, averaging ${summary.avgDaysOnLot} days. Inventory value: ${money(summary.totalInventoryCost)}.`;
    if (topMakePercent > 50) {
      invDesc += ` ⚠️ ${topMake[0]} makes up ${topMakePercent}% of inventory — consider diversifying to reduce concentration risk.`;
    } else if (topMake) {
      invDesc += ` Top make: ${topMake[0]} (${topMake[1]} units, ${topMakePercent}%).`;
    }

    insights.push({
      category: 'Inventory Health',
      severity: summary.avgDaysOnLot > 50 ? 'warning' : 'success',
      icon: '📦',
      title: `${summary.avgDaysOnLot} avg days on lot — ${summary.avgDaysOnLot <= 35 ? 'Excellent turnover' : summary.avgDaysOnLot <= 50 ? 'Healthy turnover' : 'Slow turnover'}`,
      description: invDesc,
      actionable: summary.avgDaysOnLot > 50 ? 'Focus on moving aged units' : 'Maintain sourcing cadence',
    });
  }

  // --- PURCHASE INTELLIGENCE ---
  if (purchases && purchases.length > 0) {
    const recentPurchases = [...purchases].sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate)).slice(0, 5);
    const avgRecentCost = recentPurchases.reduce((sum, p) => sum + safeNumber(p.totalPurchaseCost), 0) / recentPurchases.length;
    const allAvgCost = purchases.reduce((sum, p) => sum + safeNumber(p.totalPurchaseCost), 0) / purchases.length;
    const costTrend = allAvgCost > 0 ? Math.round(((avgRecentCost - allAvgCost) / allAvgCost) * 100) : 0;

    let purchDesc = `${purchases.length} total purchases at ${money(summary.totalPurchasesCost)} total spend.`;
    if (highlights.topSources.length > 0) {
      purchDesc += ` Top source: ${highlights.topSources[0].source} (${highlights.topSources[0].count} vehicles).`;
    }
    if (Math.abs(costTrend) > 5) {
      purchDesc += ` Recent purchase costs trending ${costTrend > 0 ? 'up' : 'down'} ${Math.abs(costTrend)}% vs. overall average.`;
    }

    insights.push({
      category: 'Purchase Intelligence',
      severity: costTrend > 15 ? 'warning' : 'info',
      icon: '🏷️',
      title: `Avg purchase cost: ${money(avgRecentCost)}${Math.abs(costTrend) > 5 ? ` (${costTrend > 0 ? '↑' : '↓'}${Math.abs(costTrend)}%)` : ''}`,
      description: purchDesc,
      actionable: costTrend > 15 ? 'Negotiate harder or find new sources' : 'Continue sourcing strategy',
    });
  }

  // --- COMPLIANCE ALERTS ---
  const pendingCompliance = (highlights.pendingCompliance || []);
  if (pendingCompliance.length > 0) {
    const details = pendingCompliance.slice(0, 3).map(r => r.vin).join(', ');
    insights.push({
      category: 'Compliance Alerts',
      severity: pendingCompliance.length > 3 ? 'critical' : 'warning',
      icon: '⚠️',
      title: `${pendingCompliance.length} vehicle${pendingCompliance.length > 1 ? 's' : ''} with pending compliance items`,
      description: `VINs affected: ${details}${pendingCompliance.length > 3 ? ` and ${pendingCompliance.length - 3} more` : ''}. Address pending title transfers, registration, insurance, or tax submissions before regulatory deadlines.`,
      actionable: 'Review compliance dashboard',
    });
  }

  // --- EXPENSE ANALYSIS ---
  if (summary.totalBusinessExpenses > 0 || summary.totalAdSpend > 0) {
    const adToRevenueRatio = summary.totalRevenue > 0 ? Math.round((summary.totalAdSpend / summary.totalRevenue) * 100) : 0;
    let expDesc = `Business expenses: ${money(summary.totalBusinessExpenses)}. Ad spend: ${money(summary.totalAdSpend)}.`;
    if (summary.totalRevenue > 0) {
      expDesc += ` Ad-to-revenue ratio: ${adToRevenueRatio}%.`;
      if (adToRevenueRatio > 20) {
        expDesc += ' This is high — review ad campaign performance to ensure ROI.';
      } else if (adToRevenueRatio < 5 && summary.avgDaysOnLot > 40) {
        expDesc += ' Consider increasing ad spend to accelerate slow-moving inventory.';
      }
    }
    if (highlights.expenseByCategory && highlights.expenseByCategory.length > 0) {
      expDesc += ` Largest category: ${highlights.expenseByCategory[0].category} (${money(highlights.expenseByCategory[0].amount)}).`;
    }
    insights.push({
      category: 'Expense Analysis',
      severity: adToRevenueRatio > 20 ? 'warning' : 'info',
      icon: '📊',
      title: `${money(summary.totalBusinessExpenses + summary.totalAdSpend)} total expenditure`,
      description: expDesc,
      actionable: adToRevenueRatio > 20 ? 'Audit ad campaign ROI' : 'Monitor spending trends',
    });
  }

  // --- AUCTION OPPORTUNITIES ---
  const auctionOpps = (highlights.auctionOpportunities || []);
  if (auctionOpps.length > 0) {
    const best = auctionOpps[0];
    insights.push({
      category: 'Auction Opportunities',
      severity: 'info',
      icon: '🎯',
      title: `${auctionOpps.length} active auction opportunit${auctionOpps.length > 1 ? 'ies' : 'y'}`,
      description: `Best value: ${best.vehicle} at ${money(best.marketValue)} market value (recommended max bid: ${money(best.recommendedMaxBid)}).`,
      actionable: `Evaluate ${best.vehicle} auction bid`,
    });
  }

  // --- ZERO-AGING CELEBRATION ---
  if (critical.length === 0 && highRisk.length === 0 && warning.length === 0 && summary.activeInventory > 0) {
    insights.push({
      category: 'Inventory Health',
      severity: 'success',
      icon: '✅',
      title: 'Zero aging vehicles — excellent lot turnover!',
      description: `All ${summary.activeInventory} active vehicles have been on lot less than 45 days. Your sourcing and pricing strategy is working. Keep it up.`,
      actionable: 'Maintain current strategy',
    });
  }

  // Sort by severity priority
  const severityOrder = { critical: 0, warning: 1, info: 2, success: 3 };
  insights.sort((a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99));

  return insights;
}

function generateAgingRecommendations(context) {
  const { vehicles, sales } = context;
  const activeVehicles = (vehicles || []).filter(v => v.status !== 'Sold' && v.status !== 'Returned');
  const agingVehicles = activeVehicles.filter(v => safeNumber(v.daysInInventory) >= 45);
  const recommendations = {};

  for (const vehicle of agingVehicles) {
    recommendations[vehicle.vin] = generateVehicleRecommendation(vehicle, vehicles, sales || []);
  }

  return recommendations;
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
        id: true,
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

    // Generate dynamic, data-driven insights
    const dynamicInsights = generateDynamicInsights(context);

    // Generate per-vehicle aging recommendations
    const agingRecommendations = generateAgingRecommendations(context);

    // Calculate overall health score
    const healthScore = calculateHealthScore(context);

    res.json({
      summary,
      highlights: context.highlights,
      dealership: context.dealership,
      insights: dynamicInsights,
      agingRecommendations,
      healthScore,
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
