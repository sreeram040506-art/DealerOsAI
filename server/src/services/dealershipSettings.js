import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../db/prisma.js';
import { SUPPORTED_CHANNELS } from './channels/publishers.js';

/**
 * Per-dealership settings. Integrations used to be configured once for the whole platform
 * through environment variables, so every dealership's alerts went to one Slack channel, every
 * listing posted to one Facebook Page and every email came from one sender. Each dealership now
 * owns its preferences and its own integration credentials.
 *
 * Platform infrastructure (database, JWT secret, scheduler, the fallback OpenAI key) stays in
 * the environment.
 */

export const DEFAULT_SETTINGS = {
  notifications: {
    emailEnabled: false,
    fromEmail: '',
    alertEmails: [],
    smsEnabled: false,
    smsFromNumber: '',
    alertPhones: [],
    slackEnabled: false,
    events: { newLead: true, manualAlerts: true },
  },
  marketing: {
    enabledChannels: SUPPORTED_CHANNELS,
    facebookPageId: '',
    lowMileagePerYear: 12000,
  },
  ai: {
    enabled: true,
  },
  pricing: {
    // Daily market check on vehicles that have not sold; suggestions only, never changes a price.
    enabled: true,
    staleDays: 10,
  },
  swapNetwork: {
    // Opt-in: a dealership's inventory is never shown to other dealerships unless it agrees.
    participate: false,
    minDaysInStock: 90,
  },
};

const email = z.string().trim().toLowerCase().email();
const phone = z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'Phone numbers must be in international format, e.g. +15551234567');

const SECTION_SCHEMAS = {
  notifications: z.object({
    emailEnabled: z.boolean(),
    fromEmail: z.union([email, z.literal('')]),
    alertEmails: z.array(email).max(10),
    smsEnabled: z.boolean(),
    smsFromNumber: z.union([phone, z.literal('')]),
    alertPhones: z.array(phone).max(10),
    slackEnabled: z.boolean(),
    events: z.object({ newLead: z.boolean(), manualAlerts: z.boolean() }).partial(),
  }).partial().strict(),
  marketing: z.object({
    enabledChannels: z.array(z.enum(SUPPORTED_CHANNELS)).max(SUPPORTED_CHANNELS.length),
    facebookPageId: z.union([z.string().trim().regex(/^\d{5,25}$/, 'Facebook Page ID is numeric'), z.literal('')]),
    lowMileagePerYear: z.number().int().min(1000).max(50000),
  }).partial().strict(),
  ai: z.object({ enabled: z.boolean() }).partial().strict(),
  pricing: z.object({ enabled: z.boolean(), staleDays: z.number().int().min(3).max(120) }).partial().strict(),
  swapNetwork: z.object({
    participate: z.boolean(),
    minDaysInStock: z.number().int().min(0).max(365),
  }).partial().strict(),
};

// Credentials, validated when set. Values are never sent back to the browser.
const SECRET_SCHEMAS = {
  facebookAccessToken: z.string().trim().min(20).max(1000),
  sendgridApiKey: z.string().trim().regex(/^SG\.[\w-]+\.[\w-]+$/, 'SendGrid keys look like SG.xxxx.yyyy'),
  twilioAccountSid: z.string().trim().regex(/^AC[a-f0-9]{32}$/i, 'Twilio Account SIDs start with AC'),
  twilioAuthToken: z.string().trim().regex(/^[a-f0-9]{32}$/i, 'Twilio auth tokens are 32 hex characters'),
  // Only Slack's own webhook host, so this can't be pointed at internal services.
  slackWebhookUrl: z.string().trim().regex(/^https:\/\/hooks\.slack\.com\/services\/[\w/]+$/, 'Use a Slack incoming-webhook URL (https://hooks.slack.com/services/...)'),
};
export const SECRET_NAMES = Object.keys(SECRET_SCHEMAS);

// ── Encryption ───────────────────────────────────────────────────────────────────────────

let warnedDerivedKey = false;
function encryptionKey() {
  const configured = process.env.SETTINGS_ENCRYPTION_KEY;
  if (configured) return crypto.createHash('sha256').update(configured).digest();
  if (process.env.NODE_ENV === 'production') return null;
  // Development convenience only: tied to JWT_SECRET, so changing that makes stored
  // credentials unreadable (they then show as not configured).
  if (!process.env.JWT_SECRET) return null;
  if (!warnedDerivedKey) {
    console.warn('[Settings] SETTINGS_ENCRYPTION_KEY is not set; deriving a development key from JWT_SECRET.');
    warnedDerivedKey = true;
  }
  return crypto.createHash('sha256').update(`settings:${process.env.JWT_SECRET}`).digest();
}

function encrypt(object) {
  const key = encryptionKey();
  if (!key) {
    throw Object.assign(new Error('Saving credentials needs SETTINGS_ENCRYPTION_KEY to be set on the server.'), { status: 503 });
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(object), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

function decrypt(blob) {
  if (!blob) return {};
  const key = encryptionKey();
  if (!key) return {};
  try {
    const [version, iv, tag, data] = blob.split(':');
    if (version !== 'v1') return {};
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8'));
  } catch (err) {
    console.error('[Settings] Could not decrypt stored credentials:', err.message);
    return {};
  }
}

// ── Reading ──────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();

function mergeDefaults(stored) {
  const merged = {};
  for (const [section, defaults] of Object.entries(DEFAULT_SETTINGS)) {
    const value = { ...defaults, ...(stored?.[section] || {}) };
    if (defaults.events) value.events = { ...defaults.events, ...(stored?.[section]?.events || {}) };
    merged[section] = value;
  }
  return merged;
}

async function load(dealershipId) {
  const hit = cache.get(dealershipId);
  if (hit && hit.expires > Date.now()) return hit.value;
  const row = await prisma.dealershipSettings.findUnique({ where: { dealershipId } });
  const value = { settings: mergeDefaults(row?.settings), secrets: decrypt(row?.secrets), updatedAt: row?.updatedAt || null };
  cache.set(dealershipId, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function getDealershipSettings(dealershipId) {
  return (await load(dealershipId)).settings;
}

export async function getDealershipSecrets(dealershipId) {
  return (await load(dealershipId)).secrets;
}

/** Settings plus which credentials are configured (with a short hint), safe for the browser. */
export async function getSettingsForDisplay(dealershipId) {
  const { settings, secrets, updatedAt } = await load(dealershipId);
  const credentials = {};
  for (const name of SECRET_NAMES) {
    const value = secrets[name];
    credentials[name] = value ? { configured: true, hint: `••••${String(value).slice(-4)}` } : { configured: false };
  }
  return {
    settings,
    credentials,
    platformAiAvailable: Boolean(platformOpenAiKey()),
    canStoreCredentials: Boolean(encryptionKey()),
    updatedAt,
  };
}

// ── Writing ──────────────────────────────────────────────────────────────────────────────

/**
 * Applies a partial update. `settings` is { section: { field: value } }; `credentials` is
 * { name: string | null } where null removes the credential.
 */
export async function updateDealershipSettings(dealershipId, { settings = {}, credentials = {} }, userId) {
  const errors = [];
  const row = await prisma.dealershipSettings.findUnique({ where: { dealershipId } });
  const stored = (row?.settings && typeof row.settings === 'object') ? { ...row.settings } : {};

  for (const [section, values] of Object.entries(settings || {})) {
    const schema = SECTION_SCHEMAS[section];
    if (!schema) {
      errors.push({ path: section, message: 'Unknown settings section' });
      continue;
    }
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push({ path: [section, ...issue.path].join('.'), message: issue.message });
      continue;
    }
    const next = { ...(stored[section] || {}), ...parsed.data };
    if (parsed.data.events) next.events = { ...(stored[section]?.events || {}), ...parsed.data.events };
    stored[section] = next;
  }

  const currentSecrets = decrypt(row?.secrets);
  const nextSecrets = { ...currentSecrets };
  let secretsChanged = false;
  for (const [name, value] of Object.entries(credentials || {})) {
    const schema = SECRET_SCHEMAS[name];
    if (!schema) {
      errors.push({ path: `credentials.${name}`, message: 'Unknown credential' });
      continue;
    }
    if (value === null || value === '') {
      if (name in nextSecrets) {
        delete nextSecrets[name];
        secretsChanged = true;
      }
      continue;
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      errors.push({ path: `credentials.${name}`, message: parsed.error.issues[0]?.message || 'Invalid value' });
      continue;
    }
    nextSecrets[name] = parsed.data;
    secretsChanged = true;
  }

  if (errors.length) throw Object.assign(new Error('Some settings are invalid'), { status: 400, errors });

  const data = {
    settings: stored,
    updatedById: userId || null,
    ...(secretsChanged ? { secrets: Object.keys(nextSecrets).length ? encrypt(nextSecrets) : null } : {}),
  };
  await prisma.dealershipSettings.upsert({
    where: { dealershipId },
    update: data,
    create: { dealershipId, ...data },
  });
  cache.delete(dealershipId);
  return getSettingsForDisplay(dealershipId);
}

// ── Helpers for integrations ─────────────────────────────────────────────────────────────

function platformOpenAiKey() {
  const key = process.env.OPENAI_API_KEY;
  return key && key !== 'YOUR_OPENAI_API_KEY_HERE' ? key : null;
}

/**
 * The OpenAI key to use for a dealership: its own key if it has one, otherwise the platform's.
 * Null when the dealership has turned AI features off or no key exists.
 */
export async function resolveOpenAiKey(dealershipId) {
  if (!dealershipId) return platformOpenAiKey();
  const { settings } = await load(dealershipId);
  if (!settings.ai.enabled) return null;
  // Every dealership uses the platform's key; none has to supply its own.
  return platformOpenAiKey();
}

/** Dealership ids that have opted into the inter-dealership swap network. */
export async function swapNetworkParticipants() {
  const rows = await prisma.dealershipSettings.findMany({ select: { dealershipId: true, settings: true } });
  return new Set(rows.filter((r) => r.settings?.swapNetwork?.participate === true).map((r) => r.dealershipId));
}
