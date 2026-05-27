import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

function getBasePurchaseCost(purchase) {
  if (!purchase) return 0;
  return (Number(purchase.purchasePrice) || 0)
    + (Number(purchase.transportCost) || 0)
    + (Number(purchase.buyerFee) || 0)
    + (Number(purchase.inspectionCost) || 0)
    + (Number(purchase.registrationCost) || 0);
}

router.post('/', async (req, res, next) => {
  try {
    const { message, history } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.length > 4000) {
      return res.status(400).json({ error: 'Message is too long' });
    }
    if (history !== undefined && !Array.isArray(history)) {
      return res.status(400).json({ error: 'History must be an array' });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey || openaiApiKey === 'YOUR_OPENAI_API_KEY_HERE') {
      return res.status(503).json({ error: 'AI Assistant is not configured on this server.' });
    }

    // 1. Gather Business Context
    const [
      availableVehicles,
      soldVehicles,
      sales,
      adsCount,
      adsSpendResult,
      expenseSumResult,
      allVehicles
    ] = await Promise.all([
      prisma.vehicle.findMany({
        where: { status: 'Available', dealershipId: req.dealershipId },
        include: { purchase: true, repairs: true },
        orderBy: { purchaseDate: 'asc' } // Oldest first
      }),
      prisma.vehicle.count({ where: { status: 'Sold', dealershipId: req.dealershipId } }),
      prisma.sale.aggregate({
        where: { dealershipId: req.dealershipId },
        _sum: { salePrice: true, profit: true }
      }),
      prisma.advertisingExpense.count({ where: { dealershipId: req.dealershipId } }),
      prisma.advertisingExpense.aggregate({ 
        where: { dealershipId: req.dealershipId },
        _sum: { amountSpent: true } 
      }),
      prisma.businessExpense.aggregate({ 
        where: { dealershipId: req.dealershipId },
        _sum: { amount: true } 
      }),
      prisma.vehicle.findMany({
        where: { dealershipId: req.dealershipId },
        select: {
          vin: true,
          make: true,
          model: true,
          year: true,
          status: true,
          daysInInventory: true,
          purchase: {
            select: {
              sellerName: true,
              purchasePrice: true,
              transportCost: true,
              buyerFee: true,
              inspectionCost: true,
              registrationCost: true
            }
          },
          sale: { select: { profit: true } }
        }
      })
    ]);

    const totalInventoryCost = availableVehicles.reduce((sum, v) => sum + getBasePurchaseCost(v.purchase) + v.repairs.reduce((rSum, r) => rSum + r.partsCost + r.laborCost, 0), 0);
    const totalRevenue = sales._sum.salePrice || 0;
    const totalProfit = sales._sum.profit || 0;
    const totalAdsSpend = adsSpendResult._sum.amountSpent || 0;
    const totalBusinessExpenses = expenseSumResult._sum.amount || 0;

    // Summarize oldest 5 cars
    const oldestCars = availableVehicles.slice(0, 5).map(v => 
      `${v.year} ${v.make} ${v.model} (VIN: ${v.vin}) - Cost: $${getBasePurchaseCost(v.purchase)}, In stock since: ${new Date(v.purchaseDate).toLocaleDateString()}`
    ).join('\n- ');

    const inventoryDataset = allVehicles.map(v => ({
      vin: v.vin.slice(-6), // save tokens, just last 6
      veh: `${v.year} ${v.make} ${v.model}`,
      status: v.status,
      days: v.daysInInventory,
      src: v.purchase?.sellerName || 'Unknown',
      cost: getBasePurchaseCost(v.purchase),
      profit: v.sale?.profit || 0
    }));

    const soldWithProfit = allVehicles
      .filter(v => v.status === 'Sold' && typeof v.sale?.profit === 'number')
      .map(v => ({
        vin: v.vin,
        veh: `${v.year} ${v.make} ${v.model}`,
        profit: v.sale.profit
      }));

    const soldByProfitDesc = [...soldWithProfit].sort((a, b) => b.profit - a.profit);
    const soldByProfitAsc = [...soldWithProfit].sort((a, b) => a.profit - b.profit);
    const lossVehicles = soldWithProfit.filter(v => v.profit < 0).sort((a, b) => a.profit - b.profit);

    const topProfitVehicle = soldByProfitDesc[0] || null;
    const lowestProfitVehicle = soldByProfitAsc[0] || null;
    const topProfitList = soldByProfitDesc.slice(0, 5);
    const lowProfitList = soldByProfitAsc.slice(0, 5);
    const siteFeatures = `
Core sections and what they do:
- Dashboard/Overview: business KPIs and high-level performance.
- Inventory: add, edit, and track vehicles and inventory age.
- Sales: completed deals and profit tracking.
- Expenses: operating costs and spending records.
- Customers: customer management and related details.
- Repairs: repair logs and cost tracking by vehicle.
- Advertising: ad campaign spend and performance context.
- Registry: compliance/registration-related records.
- Reports/Financial views: summaries and performance insights.
- Team analytics, settings, and super admin (role-based): user, org, and admin controls.
- AI assistant: product help and dealership performance guidance.`;

    // 2. Build System Prompt
    const systemPrompt = `You are the "Auto Profit Hub AI", a product expert for this site and a business advisor for dealership performance.
Speak naturally, clearly, and concisely.

Primary behavior:
1. Answer any question about this site: features, pages, workflows, and where to perform actions.
2. Answer business performance and inventory questions using the live business data context below.
3. If the user asks for an action you cannot directly perform in UI, provide exact step-by-step instructions.
4. If a question is outside product/dealership context, give a short answer and then steer back to relevant help.

Site Knowledge:
${siteFeatures}

Data Accuracy Rule:
When counting or summarizing data from the Complete Inventory Dataset JSON, be exact and verify before replying.
For profit ranking/loss questions, prioritize the Sold Vehicle Profit Insights section below.

### Live Business Data Context:
- Available Inventory: ${availableVehicles.length} vehicles
- Total Inventory Value (Purchases + Repairs): $${totalInventoryCost.toLocaleString()}
- Total Vehicles Sold: ${soldVehicles}
- Total Lifetime Revenue (All Sales): $${totalRevenue.toLocaleString()}
- Total Lifetime Profit (All Sales): $${totalProfit.toLocaleString()}
- Total Ad Spend: $${totalAdsSpend.toLocaleString()} across ${adsCount} campaigns
- Setup / Business Expenses: $${totalBusinessExpenses.toLocaleString()}

**Oldest Vehicles in Stock (Needs Attention):**
- ${oldestCars || 'No available inventory.'}

### Complete Inventory Dataset (JSON):
Use this dataset to answer specific questions about the inventory (e.g., counting cars from a specific auction, checking profits on a specific model, etc.):
${JSON.stringify(inventoryDataset)}

### Sold Vehicle Profit Insights:
- Total sold vehicles with profit data: ${soldWithProfit.length}
- Highest-profit sold vehicle: ${topProfitVehicle ? `${topProfitVehicle.veh} (VIN: ${topProfitVehicle.vin}) with $${topProfitVehicle.profit.toLocaleString()}` : 'No sold vehicle profit data available.'}
- Lowest-profit sold vehicle: ${lowestProfitVehicle ? `${lowestProfitVehicle.veh} (VIN: ${lowestProfitVehicle.vin}) with $${lowestProfitVehicle.profit.toLocaleString()}` : 'No sold vehicle profit data available.'}
- Vehicles sold at a loss (profit < 0): ${lossVehicles.length}
- Top 5 highest-profit sold vehicles (JSON): ${JSON.stringify(topProfitList)}
- Top 5 lowest-profit sold vehicles (JSON): ${JSON.stringify(lowProfitList)}
- Loss vehicles list (JSON): ${JSON.stringify(lossVehicles)}

When user asks questions like "which vehicle gave high profit", "low profit", or "loss", answer directly with vehicle details and profit values from these insights.

When asked for business advice, refer to these numbers and suggest practical next steps (pricing, ad focus, aging stock strategy, and expense control).`;
    const formattedHistory = (history || []).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    })).filter((msg) => typeof msg.content === 'string' && msg.content.trim().length > 0);

    // 3. Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          ...formattedHistory,
          { role: "user", content: message }
        ],
        temperature: 0.2, // Low temp for factual accuracy
        max_tokens: 500,
        stream: false
      })
    });

    const data = await response.json().catch(() => ({}));
    
    if (!response.ok || data.error) {
      console.error("OpenAI API Error:", data.error);
      return res.status(500).json({ error: 'AI provider error' });
    }

    const aiMessage = data?.choices?.[0]?.message?.content;
    if (!aiMessage || typeof aiMessage !== 'string') {
      return res.status(500).json({ error: 'AI provider returned an invalid response' });
    }
    res.json({ reply: aiMessage });

  } catch (error) {
    console.error('Chat routing error:', error);
    next(error);
  }
});

export default router;

