// Each publisher reports what actually happened. These used to return status 'PUBLISHED' for
// channels with no integration at all, and even when a live Facebook post failed, so the
// marketing page claimed posts that never went out.
//
//   POSTED         – the listing is live on that channel (permalink is where)
//   NOT_CONNECTED  – no integration for this channel yet; post it manually with the
//                    channel's tracking link so inquiries are still attributed to it
//   FAILED         – an integration exists but the post was rejected (error says why)

function result(channel, status, extra = {}) {
  return { channel, status, at: new Date().toISOString(), ...extra };
}

function notConnected(channel, payload, why) {
  return result(channel, 'NOT_CONNECTED', {
    note: why,
    trackingUrl: payload.trackingUrlFor(channel),
  });
}

async function safeJsonFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    const reason = parsed?.error?.message || parsed?.message || `HTTP ${response.status}`;
    throw new Error(reason);
  }
  return parsed;
}

// Posts to the dealership's own Facebook Page, configured in its settings (the Graph API has
// no Marketplace endpoint for dealers). The link points at the public listing page.
export async function publishToFacebook(payload) {
  const channel = 'Facebook Marketplace';
  const { pageId, token } = payload.facebook || {};
  if (!token || !pageId) {
    return notConnected(channel, payload, 'Facebook is not connected. Add your Page ID and access token in Settings → Marketing.');
  }

  try {
    const link = payload.trackingUrlFor(channel);
    const message = [payload.title, payload.description, payload.cta].filter(Boolean).join('\n\n');
    const response = await safeJsonFetch(`https://graph.facebook.com/v20.0/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, ...(link.startsWith('http') ? { link } : {}) }),
    });
    return result(channel, 'POSTED', { externalPostId: response?.id || null, permalink: link });
  } catch (error) {
    return result(channel, 'FAILED', { error: error.message });
  }
}

// The dealer website channel is this app's own public listing page, so it is genuinely live
// the moment the listing is published.
export async function publishToDealerWebsite(payload) {
  const channel = 'Dealer Website';
  return result(channel, 'POSTED', { permalink: payload.trackingUrlFor(channel) });
}

const pending = (channel, name) => async (payload) =>
  notConnected(channel, payload, `${name} has no integration yet — copy the listing text and post it with the tracking link.`);

export const channelPublisherMap = {
  'Facebook Marketplace': publishToFacebook,
  Instagram: pending('Instagram', 'Instagram'),
  TikTok: pending('TikTok', 'TikTok'),
  'Dealer Website': publishToDealerWebsite,
  Craigslist: pending('Craigslist', 'Craigslist'),
  'YouTube Shorts': pending('YouTube Shorts', 'YouTube'),
  'Google Vehicle Listings': pending('Google Vehicle Listings', 'Google Vehicle Listings'),
};

export const SUPPORTED_CHANNELS = Object.keys(channelPublisherMap);
