// Downloads the background-removal model + ONNX runtime once, so the feature works with no
// network access at photo-editing time. Without this, @imgly/background-removal fetches
// ~190MB from https://staticimgly.com on every browser session, which fails outright when a
// dealership has no internet at the point of use.
//
// Safe to run repeatedly (skips files already present) and never fails the build: if the
// network is unavailable here, the app just falls back to imgly's CDN at runtime like before.
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'bg-removal');
const PACKAGE_VERSION = '1.7.0';
const CDN_ROOT = `https://staticimgly.com/@imgly/background-removal-data/${PACKAGE_VERSION}/dist/`;

// The model + WASM runtime pair actually used by our config (device: "cpu",
// model: "large" -> "isnet", full fp32 precision). We deliberately don't use the faster
// "medium"/fp16 model — it left visible ghosting artifacts around reflective/complex edges
// like wheels. Not the full asset set imgly ships (which also includes the "small"/"medium"
// models and a WebGPU runtime we don't use) — keeping only what we need holds this to ~190MB
// instead of ~330MB.
const NEEDED_KEYS = [
  '/models/isnet',
  '/onnxruntime-web/ort-wasm-simd-threaded.mjs',
  '/onnxruntime-web/ort-wasm-simd-threaded.wasm',
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function downloadChunk(name, expectedSize) {
  const dest = path.join(OUT_DIR, name);
  if (existsSync(dest)) {
    const { size } = await stat(dest);
    if (size === expectedSize) return; // already downloaded correctly
  }
  const res = await fetch(new URL(name, CDN_ROOT));
  if (!res.ok || !res.body) throw new Error(`chunk ${name} -> HTTP ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function withConcurrency(items, limit, worker) {
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const manifestPath = path.join(OUT_DIR, 'resources.json');
  let manifest = null;
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  }

  const allChunksPresent =
    manifest &&
    NEEDED_KEYS.every((key) => manifest[key]) &&
    (
      await Promise.all(
        NEEDED_KEYS.flatMap((key) =>
          manifest[key].chunks.map(async (chunk) => existsSync(path.join(OUT_DIR, chunk.name)))
        )
      )
    ).every(Boolean);

  if (allChunksPresent) {
    console.log('[bg-removal] Assets already present locally — skipping download.');
    return;
  }

  console.log('[bg-removal] Fetching model + ONNX runtime for offline use (~190MB, one-time)...');
  const fullManifest = await fetchJson(new URL('resources.json', CDN_ROOT));

  const trimmedManifest = {};
  const chunkJobs = [];
  for (const key of NEEDED_KEYS) {
    const entry = fullManifest[key];
    if (!entry) throw new Error(`Manifest is missing expected resource ${key}`);
    trimmedManifest[key] = entry;
    for (const chunk of entry.chunks) {
      const chunkSize = chunk.offsets[1] - chunk.offsets[0];
      chunkJobs.push({ name: chunk.name, size: chunkSize });
    }
  }

  await withConcurrency(chunkJobs, 5, (job) => downloadChunk(job.name, job.size));
  await writeFile(manifestPath, JSON.stringify(trimmedManifest));
  console.log('[bg-removal] Done. Background removal now works fully offline.');
}

main().catch((err) => {
  console.warn(`[bg-removal] Could not pre-download offline assets (${err.message}). ` +
    'The feature will still work online, fetching from imgly\'s CDN on first use.');
});
