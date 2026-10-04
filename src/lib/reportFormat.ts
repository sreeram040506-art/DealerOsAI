/** Money for report tables: whole dollars, negatives as -$1,234. */
export const money = (n: number | null | undefined) => {
  const value = Math.round(Number(n) || 0);
  return `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString()}`;
};

export const vehicleLabel = (v: { year?: number | string | null; make?: string | null; model?: string | null } | null | undefined) =>
  [v?.year, v?.make, v?.model].filter(Boolean).join(' ') || 'Unknown vehicle';
