import type { ChannelResultStatus, ListingStatus } from '@/hooks/useMarketing';

export const LISTING_STATUS_STYLE: Record<ListingStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  SCHEDULED: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  PUBLISHED: 'bg-green-500/15 text-green-700 dark:text-green-400',
  ARCHIVED: 'bg-secondary text-muted-foreground line-through',
};

export const CHANNEL_STATUS: Record<ChannelResultStatus, { label: string; style: string }> = {
  POSTED: { label: 'Posted', style: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  NOT_CONNECTED: { label: 'Post manually', style: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  FAILED: { label: 'Failed', style: 'bg-destructive/15 text-destructive' },
};

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

/** The full text to paste into a channel that has no integration. */
export function listingPostText(listing: { seoTitle: string; description: string; featureBullets: string[]; hashtags: string[] }, link: string) {
  return [
    listing.seoTitle,
    '',
    listing.description,
    '',
    ...listing.featureBullets.map((b) => `• ${b}`),
    '',
    link,
    '',
    listing.hashtags.join(' '),
  ].join('\n');
}
