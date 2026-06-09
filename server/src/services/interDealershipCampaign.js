import fs from 'fs';
import path from 'path';
import prisma from '../db/prisma.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LATEST_MODEL_PATH = path.join(__dirname, '../../data/demand_model_latest.json');
const AGE_DAYS = Number(process.env.SWAP_CAMPAIGN_AGE_DAYS) || 60;
const TOP_DEMAND_COUNT = Number(process.env.SWAP_CAMPAIGN_TOP_COUNT) || 5;
const MAX_PROPOSALS = Number(process.env.SWAP_CAMPAIGN_MAX_PROPOSALS) || 3;

function loadLatestModel() {
  if (!fs.existsSync(LATEST_MODEL_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(LATEST_MODEL_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function makeKey(make, model) {
  return `${make.toLowerCase()}||${model.toLowerCase()}`;
}

function computeDaysInInventory(vehicle) {
  if (vehicle.daysInInventory != null) return vehicle.daysInInventory;
  const purchaseDate = vehicle.purchaseDate ? new Date(vehicle.purchaseDate) : new Date(vehicle.createdAt || Date.now());
  const diffMs = Date.now() - purchaseDate.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

async function getOrCreateSharedChannel(dealerA, dealerB, senderId, membersA, membersB) {
  const channelName = `swap-${dealerA.slug}-${dealerB.slug}`.toLowerCase();
  let channel = await prisma.channel.findFirst({
    where: {
      name: channelName,
      type: 'INTER_DEALERSHIP',
      dealershipId: null
    }
  });

  if (!channel) {
    channel = await prisma.channel.create({
      data: {
        name: channelName,
        type: 'INTER_DEALERSHIP',
        dealershipId: null,
        members: {
          create: [
            ...membersA.map((u) => ({ userId: u.id })),
            ...membersB.map((u) => ({ userId: u.id }))
          ]
        }
      }
    });
  }

  return channel;
}

async function publishToInterDealershipChannels(message, senderId) {
  const channels = await prisma.channel.findMany({ where: { type: 'INTER_DEALERSHIP' } });
  const results = [];
  for (const channel of channels) {
    try {
      const created = await prisma.message.create({
        data: {
          channelId: channel.id,
          senderId,
          text: message
        }
      });
      results.push({ channel: channel.name, status: 'posted', messageId: created.id });
    } catch (error) {
      results.push({ channel: channel.name, status: 'failed', error: error.message });
    }
  }
  return results;
}

export async function runSwapCampaign() {
  const model = loadLatestModel();
  if (!model || !model.items) {
    return { success: false, message: 'No persisted demand model available' };
  }

  const demandItems = Object.values(model.items)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, TOP_DEMAND_COUNT);

  const dealerships = await prisma.dealership.findMany({ select: { id: true, name: true, slug: true } });
  if (!dealerships.length) {
    return { success: false, message: 'No dealerships found' };
  }

  const allVehicles = await prisma.vehicle.findMany({
    where: { status: 'Available' },
    include: { purchase: true }
  });

  const vehiclesByDealer = dealerships.reduce((map, dealer) => {
    map[dealer.id] = [];
    return map;
  }, {});
  allVehicles.forEach((vehicle) => {
    if (vehiclesByDealer[vehicle.dealershipId]) vehiclesByDealer[vehicle.dealershipId].push(vehicle);
  });

  const userByDealer = {};
  const users = await prisma.user.findMany({ where: { dealershipId: { in: dealerships.map((d) => d.id) } } });
  users.forEach((user) => {
    if (!userByDealer[user.dealershipId]) userByDealer[user.dealershipId] = [];
    if (userByDealer[user.dealershipId].length < 3) userByDealer[user.dealershipId].push(user);
  });

  const proposals = [];
  const summaryEntries = [];

  for (const dealer of dealerships) {
    const inventory = vehiclesByDealer[dealer.id] || [];
    const agingVehicles = inventory
      .map((v) => ({ ...v, computedAge: computeDaysInInventory(v) }))
      .filter((v) => v.computedAge >= AGE_DAYS)
      .sort((a, b) => b.computedAge - a.computedAge);

    if (!agingVehicles.length) continue;

    const inventoryKeys = new Set(inventory.map((v) => makeKey(v.make, v.model)));
    const missingDemand = demandItems.filter((item) => !inventoryKeys.has(makeKey(item.make, item.model)));
    if (!missingDemand.length) continue;

    for (const demand of missingDemand) {
      if (proposals.length >= MAX_PROPOSALS) break;
      const candidateVehicles = allVehicles.filter((v) =>
        v.dealershipId !== dealer.id &&
        makeKey(v.make, v.model) === makeKey(demand.make, demand.model)
      );
      if (!candidateVehicles.length) continue;

      const partnerVehicle = candidateVehicles.sort((a, b) => computeDaysInInventory(b) - computeDaysInInventory(a))[0];
      const offeringVehicle = agingVehicles.shift();
      if (!offeringVehicle) break;

      const partnerDealer = dealerships.find((d) => d.id === partnerVehicle.dealershipId);
      if (!partnerDealer) continue;

      const senderDealerUsers = userByDealer[dealer.id] || [];
      const partnerDealerUsers = userByDealer[partnerDealer.id] || [];
      const senderId = senderDealerUsers[0]?.id || partnerDealerUsers[0]?.id;
      if (!senderId) continue;

      const channel = await getOrCreateSharedChannel(dealer, partnerDealer, senderId, senderDealerUsers, partnerDealerUsers);
      const message = `🔄 Automated Swap Suggestion\nDealership **${dealer.name}** has aging stock and demand for **${demand.make} ${demand.model}**.\n- Offer: ${offeringVehicle.year} ${offeringVehicle.make} ${offeringVehicle.model} (VIN ${offeringVehicle.vin ? offeringVehicle.vin.slice(-6) : 'n/a'}, ${offeringVehicle.computedAge} days)\n- Request: ${partnerVehicle.year} ${partnerVehicle.make} ${partnerVehicle.model} (VIN ${partnerVehicle.vin ? partnerVehicle.vin.slice(-6) : 'n/a'}) from **${partnerDealer.name}**.\nPlease review and discuss a swap proposal in this channel.`;

      await prisma.message.create({ data: { channelId: channel.id, senderId, text: message } });
      proposals.push({ from: dealer.name, to: partnerDealer.name, offering: offeringVehicle.id, target: partnerVehicle.id, channel: channel.name });
      summaryEntries.push(`- ${dealer.name} may swap ${offeringVehicle.year} ${offeringVehicle.make} ${offeringVehicle.model} for ${partnerVehicle.year} ${partnerVehicle.make} ${partnerVehicle.model} at ${partnerDealer.name}`);
    }
  }

  const posterId = users[0]?.id || null;
  if (!posterId) {
    return { success: false, message: 'No user available to post campaign messages' };
  }

  const summaryText = proposals.length
    ? `📣 Inter-Dealership Swap Campaign Summary\n${summaryEntries.join('\n')}\n\nMessages have been posted to shared swap channels and inter-dealership channels.`
    : '📣 Inter-Dealership Swap Campaign Summary\nNo high-confidence swap proposals were available at this time.';

  const broadcastResults = await publishToInterDealershipChannels(summaryText, posterId);
  return { success: true, proposals, broadcastResults };
}
