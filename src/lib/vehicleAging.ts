/**
 * Lot-age bands agreed with the dealership: 30+ days green, 60+ days the existing warning
 * colour, 90+ days red as the "act now" flag. Under 30 days gets no tag.
 */
export type AgingBand = 'new' | '30' | '60' | '90';

export function agingBand(days: number): AgingBand {
  if (days >= 90) return '90';
  if (days >= 60) return '60';
  if (days >= 30) return '30';
  return 'new';
}

export const AGING_STYLES: Record<AgingBand, string> = {
  new: 'bg-muted text-muted-foreground border-border',
  '30': 'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400',
  '60': 'bg-warning/10 text-warning border-warning/30',
  '90': 'bg-destructive/10 text-destructive border-destructive/30',
};

export const AGING_TEXT: Record<AgingBand, string> = {
  new: 'text-foreground',
  '30': 'text-green-700 dark:text-green-400',
  '60': 'text-warning',
  '90': 'text-destructive',
};

/** "2014 Audi S7": the year leads the vehicle name everywhere it is listed. */
export function vehicleName(v: { year?: number | string | null; make?: string | null; model?: string | null }) {
  return [v.year, v.make, v.model].filter(Boolean).join(' ');
}
