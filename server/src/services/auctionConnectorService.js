import prisma from '../db/prisma.js';
import { normalizeAuctionFeedItem } from './auctionNormalizationService.js';

export async function ingestAuctionFeed({ provider, items, dealershipId }) {
  if (!provider || !Array.isArray(items)) {
    throw new Error('provider and items array are required');
  }

  const createdOrUpdated = [];

  for (const rawItem of items) {
    const normalized = normalizeAuctionFeedItem(rawItem, provider);
    if (!normalized.vin && !normalized.sourceItemId && !normalized.lotNumber) {
      continue;
    }

    const existing = await prisma.auctionVehicle.findFirst({
      where: {
        dealershipId,
        OR: [
          { vin: normalized.vin || undefined },
          { sourceItemId: normalized.sourceItemId || undefined },
          { lotNumber: normalized.lotNumber || undefined },
        ].filter(Boolean),
      },
    });

    const record = {
      ...normalized,
      dealershipId,
      recommendedMaxBid: computeRecommendedMaxBid(normalized),
    };

    if (existing) {
      const updated = await prisma.auctionVehicle.update({
        where: { id: existing.id },
        data: record,
      });
      createdOrUpdated.push(updated);
    } else {
      const created = await prisma.auctionVehicle.create({ data: record });
      createdOrUpdated.push(created);
    }
  }

  return createdOrUpdated;
}

function computeRecommendedMaxBid({ estimatedValue, transportEstimate }) {
  const value = Number(estimatedValue || 0);
  const transport = Number(transportEstimate || 0);
  if (!value) return null;
  return Math.max(0, Number((value * 0.84 - transport).toFixed(2)));
}
