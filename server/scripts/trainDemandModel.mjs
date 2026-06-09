import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');
const MODEL_DIR = path.join(DATA_DIR, 'predictor-models');
const LATEST_MODEL_PATH = path.join(DATA_DIR, 'demand_model_latest.json');

function formatVersion(date = new Date()){
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

// Extended trainer: longer history, additional features, and metadata
async function train({ lookbackDays = 365, minSalesForInclusion = 1 } = {}){
  const since = new Date(Date.now() - (lookbackDays * 24 * 60 * 60 * 1000));

  const sales = await prisma.sale.findMany({ where: { saleDate: { gte: since } }, include: { vehicle: true } });
  const salesCounts = {};
  sales.forEach(s => {
    if (!s.vehicle) return;
    const key = `${s.vehicle.make}||${s.vehicle.model}`;
    salesCounts[key] = (salesCounts[key] || 0) + 1;
  });

  const inventory = await prisma.vehicle.findMany({ select: { make: true, model: true, year: true, status: true } });
  const invCounts = {};
  inventory.forEach(v => {
    const key = `${v.make}||${v.model}`;
    invCounts[key] = (invCounts[key] || 0) + 1;
  });

  const items = {};
  for (const key of new Set([...Object.keys(salesCounts), ...Object.keys(invCounts)])){
    const [make, modelName] = key.split('||');
    const salesCount = salesCounts[key] || 0;
    const inventoryCount = invCounts[key] || 0;
    const salesPer30 = salesCount / (lookbackDays / 30);
    const score = salesPer30 / (inventoryCount + 1);
    items[key] = {
      make,
      model: modelName,
      salesCount,
      inventoryCount,
      salesPer30: Number(salesPer30.toFixed(3)),
      score: Number(score.toFixed(4))
    };
  }

  const model = {
    generatedAt: new Date().toISOString(),
    lookbackDays,
    itemCount: Object.keys(items).length,
    items
  };

  fs.mkdirSync(MODEL_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const version = formatVersion();
  const versionPath = path.join(MODEL_DIR, `demand_model_${version}.json`);
  fs.writeFileSync(versionPath, JSON.stringify(model, null, 2));
  fs.writeFileSync(LATEST_MODEL_PATH, JSON.stringify({ ...model, version }, null, 2));
  return { version, path: versionPath, model };
}

if (process.argv[1] === __filename) {
  train().then(({ version, model }) => {
    console.log(`Saved demand model version ${version} with ${model.itemCount} entries`);
    prisma.$disconnect();
  }).catch(e=>{ console.error(e); prisma.$disconnect(); process.exit(1); });
}

export { train };
