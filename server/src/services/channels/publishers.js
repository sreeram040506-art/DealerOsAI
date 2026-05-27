async function publishMock(channel, payload, reason = null) {
  const postId = `${channel.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  return {
    channel,
    status: 'PUBLISHED',
    externalPostId: postId,
    publishedAt: new Date().toISOString(),
    permalink: payload?.trackingUrl || '',
    mode: reason ? 'MOCK_FALLBACK' : 'MOCK',
    note: reason,
  };
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

export async function publishToFacebook(payload) {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;
  if (!token || !pageId) return publishMock('Facebook Marketplace', payload, 'FACEBOOK_ACCESS_TOKEN/PAGE_ID missing');

  try {
    const message = [payload.title, payload.description, payload.cta, payload.trackingUrl].filter(Boolean).join('\n\n');
    const result = await safeJsonFetch(`https://graph.facebook.com/v20.0/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message }),
    });
    return {
      channel: 'Facebook Marketplace',
      status: 'PUBLISHED',
      externalPostId: result?.id || null,
      publishedAt: new Date().toISOString(),
      permalink: payload?.trackingUrl || '',
      mode: 'LIVE_API',
    };
  } catch (error) {
    return publishMock('Facebook Marketplace', payload, `Facebook publish failed: ${error.message}`);
  }
}

export async function publishToInstagram(payload) {
  return publishMock('Instagram', payload, 'Instagram Graph publish adapter pending');
}

export async function publishToTikTok(payload) {
  return publishMock('TikTok', payload, 'TikTok publish adapter pending');
}

export async function publishToDealerWebsite(payload) {
  return publishMock('Dealer Website', payload);
}

export async function publishToCraigslist(payload) {
  return publishMock('Craigslist', payload, 'Craigslist publish adapter pending');
}

export async function publishToYoutubeShorts(payload) {
  return publishMock('YouTube Shorts', payload, 'YouTube publish adapter pending');
}

export async function publishToGoogleVehicleListings(payload) {
  return publishMock('Google Vehicle Listings', payload, 'Google Vehicle Listings feed adapter pending');
}

export const channelPublisherMap = {
  'Facebook Marketplace': publishToFacebook,
  Instagram: publishToInstagram,
  TikTok: publishToTikTok,
  'Dealer Website': publishToDealerWebsite,
  Craigslist: publishToCraigslist,
  'YouTube Shorts': publishToYoutubeShorts,
  'Google Vehicle Listings': publishToGoogleVehicleListings,
};
