import express from 'express';
import prisma from '../db/prisma.js';
import Jimp from 'jimp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runSwapCampaign } from '../services/interDealershipCampaign.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();
const MODEL_DIR = path.join(__dirname, '../../data/predictor-models');
const LATEST_MODEL_PATH = path.join(__dirname, '../../data/demand_model_latest.json');

function getModelFilename(version){
  return path.join(MODEL_DIR, `demand_model_${version}.json`);
}

function parseVersionFromFilename(fileName){
  const match = fileName.match(/^demand_model_(\d{14})\.json$/);
  return match ? match[1] : null;
}

async function readModel(version){
  try{
    const modelPath = version ? getModelFilename(version) : LATEST_MODEL_PATH;
    if (!fs.existsSync(modelPath)) return null;
    const raw = fs.readFileSync(modelPath, 'utf-8');
    return JSON.parse(raw);
  } catch(e){
    return null;
  }
}

function listModelVersions(){
  try {
    if (!fs.existsSync(MODEL_DIR)) return [];
    return fs.readdirSync(MODEL_DIR)
      .filter((name) => parseVersionFromFilename(name))
      .map((name) => {
        const version = parseVersionFromFilename(name);
        const stats = fs.statSync(path.join(MODEL_DIR, name));
        return {
          version,
          fileName: name,
          createdAt: stats.birthtime.toISOString(),
          size: stats.size
        };
      })
      .sort((a, b) => b.version.localeCompare(a.version));
  } catch {
    return [];
  }
}

function decodeBase64(base64String){
  const raw = base64String.includes('base64,') ? base64String.split('base64,')[1] : base64String;
  return Buffer.from(raw, 'base64');
}

async function analyzeImageCondition(imageBase64) {
  const buffer = decodeBase64(imageBase64);
  const img = await Jimp.read(buffer);
  img.resize(256, Jimp.AUTO).grayscale();

  const { width, height } = img.bitmap;
  let sum = 0;
  const diffs = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const px = img.bitmap.data[idx];
      sum += px;
      if (x < width - 1) {
        const right = img.bitmap.data[(y * width + (x + 1)) * 4];
        diffs.push(Math.abs(px - right));
      }
      if (y < height - 1) {
        const down = img.bitmap.data[((y + 1) * width + x) * 4];
        diffs.push(Math.abs(px - down));
      }
    }
  }

  const avgBrightness = sum / (width * height);
  const avgDiff = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);
  const brightnessScore = (avgBrightness / 255) * 50;
  const sharpnessScore = Math.min(50, (avgDiff / 128) * 50);
  const conditionScore = Math.max(0, Math.min(100, Math.round(brightnessScore + sharpnessScore)));
  const reasonLines = [];
  if (avgBrightness >= 95 && avgBrightness <= 185) {
    reasonLines.push('Lighting is balanced');
  } else if (avgBrightness < 95) {
    reasonLines.push('The image is a bit dark');
  } else {
    reasonLines.push('The image is bright and may be washed out');
  }
  if (avgDiff >= 18) {
    reasonLines.push('Visible edges suggest good detail');
  } else {
    reasonLines.push('Lower edge contrast suggests blur or softness');
  }
  return {
    type: 'image',
    score: conditionScore,
    verdict: conditionScore >= 85 ? 'Excellent' : conditionScore >= 70 ? 'Good' : conditionScore >= 55 ? 'Fair' : 'Needs attention',
    reason: reasonLines.join('. '),
    reasonLines,
    needsReconditioning: conditionScore < 60,
    details: { avgBrightness, avgDiff },
  };
}

function analyzeVideoAttachment(fileName, fileType, base64) {
  const sizeBytes = decodeBase64(base64).length;
  return {
    type: 'video',
    fileName: fileName || 'video upload',
    fileType,
    sizeBytes,
    message: 'Video upload accepted. Lightweight analyzer does not perform frame-level analysis yet.',
  };
}

function fileTypeIsImage(fileType){
  return typeof fileType === 'string' && fileType.startsWith('image/');
}

function fileTypeIsVideo(fileType){
  return typeof fileType === 'string' && fileType.startsWith('video/');
}

// GET /predictor/models - list persisted versioned demand models
router.get('/models', async (req, res, next) => {
  try {
    const versions = listModelVersions();
    res.json({ versions });
  } catch (err) {
    next(err);
  }
});

// GET /predictor/model - return persisted demand model (latest or requested version)
router.get('/model', async (req, res, next) => {
  try{
    const version = req.query.version;
    const model = await readModel(version);
    if (!model) return res.status(404).json({ message: 'Model not found' });
    res.json(model);
  } catch(err){ next(err); }
});

// GET /predictor/scores - return scores from persisted model if available, fallback to ad-hoc compute
router.get('/scores', async (req, res, next) => {
  try {
    const dealershipId = req.dealershipId;
    const dealer = await prisma.dealership.findUnique({ where: { id: dealershipId } });
    if (!dealer) return res.status(404).json({ message: 'Dealership not found' });

    const regionState = dealer.state || null;

    // Try persisted model first
    const model = await readModel();
    if (model && model.items) {
      // Convert model.items map to results array
      const results = Object.values(model.items).map(it => ({
        make: it.make,
        model: it.model,
        salesCount: it.salesCount || 0,
        inventoryCount: it.inventoryCount || 0,
        // Normalize score to 0-100 for UI
        score: Math.round((it.score || 0) * 100)
      }));
      results.sort((a, b) => b.score - a.score);
      return res.json({ region: regionState, results });
    }

    // Fallback: compute ad-hoc using recent 90 days
    const regionalDealers = regionState ? await prisma.dealership.findMany({ where: { state: regionState }, select: { id: true } }) : [];
    const dealerIds = regionalDealers.length ? regionalDealers.map(d => d.id) : [dealershipId];

    const since = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000));

    const sales = await prisma.sale.findMany({
      where: { saleDate: { gte: since }, dealershipId: { in: dealerIds } },
      include: { vehicle: true }
    });

    const salesCounts = {};
    sales.forEach(s => {
      if (!s.vehicle) return;
      const key = `${s.vehicle.make}||${s.vehicle.model}`;
      salesCounts[key] = (salesCounts[key] || 0) + 1;
    });

    const inventory = await prisma.vehicle.findMany({
      where: { dealershipId: { in: dealerIds }, status: 'Available' },
      select: { make: true, model: true }
    });

    const invCounts = {};
    inventory.forEach(v => {
      const key = `${v.make}||${v.model}`;
      invCounts[key] = (invCounts[key] || 0) + 1;
    });

    const keys = new Set([...Object.keys(salesCounts), ...Object.keys(invCounts)]);
    const results = [];
    keys.forEach(k => {
      const [make, model] = k.split('||');
      const salesCount = salesCounts[k] || 0;
      const inventoryCount = invCounts[k] || 0;
      const score = Math.round((salesCount / (inventoryCount + 1)) * 100);
      results.push({ make, model, salesCount, inventoryCount, score });
    });

    results.sort((a, b) => b.score - a.score);
    res.json({ region: regionState, results });
  } catch (err) {
    next(err);
  }
});

// POST /predictor/assistant - enhanced assistant with optional LLM
router.post('/assistant', async (req, res, next) => {
  try {
    const { question, attachments } = req.body;
    const attachmentList = Array.isArray(attachments) ? attachments : [];
    if (!question && attachmentList.length === 0) return res.status(400).json({ message: 'Question or attachments are required' });

    const text = (question || '').toLowerCase();
    const attachmentReports = [];

    for (const attachment of attachmentList) {
      if (!attachment || !attachment.fileType || !attachment.base64) continue;
      if (fileTypeIsImage(attachment.fileType)) {
        const analysis = await analyzeImageCondition(attachment.base64);
        attachmentReports.push({ ...analysis, fileName: attachment.fileName || 'image' });
      } else if (fileTypeIsVideo(attachment.fileType)) {
        attachmentReports.push(analyzeVideoAttachment(attachment.fileName, attachment.fileType, attachment.base64));
      } else {
        attachmentReports.push({ type: 'unknown', fileName: attachment.fileName || 'upload', message: 'Unsupported attachment type' });
      }
    }

    const attachmentSummary = attachmentReports.map((report) => {
      if (report.type === 'image') {
        return `Image ${report.fileName}: conditionScore ${report.score}, needsReconditioning ${report.needsReconditioning}`;
      }
      if (report.type === 'video') {
        return `Video ${report.fileName}: ${report.message}`;
      }
      return `${report.fileName}: ${report.message || 'Attachment processed'}`;
    }).join('\n');

    // Collect context: top model items and my vehicles
    const model = await readModel();
    let topItems = [];
    if (model && model.items) {
      topItems = Object.values(model.items).slice(0, 25);
    }

    const dealerId = req.dealershipId;
    const myVehicles = await prisma.vehicle.findMany({ where: { dealershipId: dealerId, status: 'Available' }, include: { purchase: true, repairs: true } });

    // If OPENAI_API_KEY present, call OpenAI for richer parsing
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (OPENAI_KEY) {
      try {
        const system = `You are a dealership inventory assistant. Answer with practical recommendations and short clear bullets for swap and inventory actions. Use the context but do not invent unsupported details.`;
        const topItemsSummary = topItems.slice(0, 10).map(i => `${i.make} ${i.model} (score:${Math.round((i.score || 0) * 100)})`).join('; ') || 'No recent demand data available';
        const vehicleSummary = myVehicles.slice(0, 10).map(v => {
          const days = v.daysInInventory || 0;
          return `${v.make} ${v.model} ${v.year} (${days}d in stock)`;
        }).join('; ') || 'No available vehicles found';

        const userPrompt = `Question: ${question || 'Please analyze the attached media and provide guidance.'}\n\nRegional demand examples: ${topItemsSummary}\n\nDealer vehicles: ${vehicleSummary}${attachmentSummary ? `\n\nAttachments:\n${attachmentSummary}` : ''}\n\nPlease answer with: 1) Recommended action, 2) Top swap candidates or priority models, 3) Useful next step.`;

        const payload = {
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 450,
        };

        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
          body: JSON.stringify(payload)
        });
        const json = await resp.json();
        const answer = json?.choices?.[0]?.message?.content?.trim() || 'No response from LLM';
        return res.json({ intent: 'llm', source: 'openai', answer });
      } catch (e) {
        console.error('LLM error', e);
      }
    }

    // Rule-based swap intent
    if (text.includes('swap') || text.includes('swap candidates') || text.includes('good swap')) {
      const now = new Date();
      const suggestions = myVehicles.map(v => {
        const purchaseDate = v.purchaseDate ? new Date(v.purchaseDate) : (v.purchase?.purchaseDate ? new Date(v.purchase.purchaseDate) : new Date(v.createdAt));
        const days = v.daysInInventory || Math.max(0, Math.floor((now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24)));
        return { id: v.id, vin: v.vin, make: v.make, model: v.model, year: v.year, daysInInventory: days };
      }).filter(s => s.daysInInventory >= 60);

      const final = suggestions.length ? suggestions : myVehicles.map(v => ({ id: v.id, vin: v.vin, make: v.make, model: v.model, year: v.year, daysInInventory: v.daysInInventory }));
      return res.json({ intent: 'swap_suggestions', suggestions: final.slice(0, 25), attachments: attachmentReports });
    }

    // Generic fallback
    const now = new Date();
    const results = myVehicles.map(v => ({ id: v.id, make: v.make, model: v.model, year: v.year, daysInInventory: v.daysInInventory }));
    res.json({ intent: 'fallback', results, attachments: attachmentReports });
  } catch (err) {
    next(err);
  }
});

// POST /predictor/campaign/run - manually trigger the inter-dealership swap campaign
router.post('/campaign/run', async (req, res, next) => {
  try {
    const result = await runSwapCampaign();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /predictor/condition - simple image-based condition scoring
router.post('/condition', async (req, res, next) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ message: 'imageBase64 required' });

    const base64 = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
    const buffer = Buffer.from(base64, 'base64');
    const img = await Jimp.read(buffer);
    img.resize(256, Jimp.AUTO).grayscale();

    const { width, height } = img.bitmap;
    let sum = 0;
    let diffs = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const px = img.bitmap.data[idx]; // grayscale
        sum += px;
        // neighbor difference (right)
        if (x < width - 1) {
          const right = img.bitmap.data[(y * width + (x + 1)) * 4];
          diffs.push(Math.abs(px - right));
        }
        // neighbor difference (down)
        if (y < height - 1) {
          const down = img.bitmap.data[((y + 1) * width + x) * 4];
          diffs.push(Math.abs(px - down));
        }
      }
    }

    const avgBrightness = sum / (width * height);
    const avgDiff = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);

    // Heuristic score: brighter & sharper -> lower reconditioning need
    // brightness normalized 0-255 -> map to 0-50, diff normalized to 0-50
    const brightnessScore = (avgBrightness / 255) * 50;
    const sharpnessScore = Math.min(50, (avgDiff / 128) * 50);
    const combined = Math.round(brightnessScore + sharpnessScore);
    const conditionScore = Math.max(0, Math.min(100, combined));

    const needsRecond = conditionScore < 60;

    const reasonLines = [];
    if (avgBrightness >= 95 && avgBrightness <= 185) {
      reasonLines.push('Lighting is balanced');
    } else if (avgBrightness < 95) {
      reasonLines.push('The image is a bit dark');
    } else {
      reasonLines.push('The image is bright and may be washed out');
    }
    if (avgDiff >= 18) {
      reasonLines.push('Visible edges suggest good detail');
    } else {
      reasonLines.push('Lower edge contrast suggests blur or softness');
    }

    res.json({
      conditionScore,
      verdict: conditionScore >= 85 ? 'Excellent' : conditionScore >= 70 ? 'Good' : conditionScore >= 55 ? 'Fair' : 'Needs attention',
      reason: reasonLines.join('. '),
      reasonLines,
      needsReconditioning: needsRecond,
      details: { avgBrightness, avgDiff },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
