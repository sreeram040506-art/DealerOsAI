import { memo, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Gauge, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

type SaleLike = { saleDate: string; vehicle?: { make?: string | null; model?: string | null } | null };
type VehicleLike = {
  make?: string | null;
  model?: string | null;
  status?: string;
  daysInInventory?: number | null;
  sale?: { saleDate?: string | null } | null;
};

type Row = { name: string; value: number; sold: number };

const MAX_ROWS = 8;
// Bars are shaded by units sold on a one-hue, five-step ramp (--rank-1 fewest .. --rank-5
// most), defined per theme in index.css. Steps are relative to the most-sold row in view.
const RAMP = ['var(--rank-1)', 'var(--rank-2)', 'var(--rank-3)', 'var(--rank-4)', 'var(--rank-5)'];
const rampColor = (sold: number, maxSold: number) =>
  RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.ceil((sold / Math.max(1, maxSold)) * RAMP.length) - 1))];

const modelKey = (v?: { make?: string | null; model?: string | null } | null) =>
  [v?.make, v?.model].filter(Boolean).join(' ').trim();

function inScope(date: string | null | undefined, year: number | null) {
  if (!date) return false;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  return year === null || d.getFullYear() === year;
}

const truncate = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);

function RankingTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload: Row }[]; unit: 'sold' | 'days' }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-foreground">{row.name}</p>
      <p className="text-muted-foreground">
        {unit === 'sold'
          ? `${row.value} sold`
          : `${row.value} days on lot on average · ${row.sold} sold`}
      </p>
    </div>
  );
}

function RankingChart({ title, icon: Icon, rows, unit, empty }: {
  title: string;
  icon: typeof Trophy;
  rows: Row[];
  unit: 'sold' | 'days';
  empty: string;
}) {
  const height = Math.max(140, rows.length * 34 + 24);
  const maxSold = Math.max(1, ...rows.map((r) => r.sold));
  return (
    <div className="stat-card" role="figure" aria-label={title}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="flex h-[140px] items-center justify-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 40, top: 4, bottom: 4 }} barCategoryGap={8}>
              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.6} horizontal={false} />
              <XAxis type="number" allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={124}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={truncate}
              />
              <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} content={<RankingTooltip unit={unit} />} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
                {rows.map((r) => (
                  <Cell key={r.name} fill={rampColor(r.sold, maxSold)} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  fontSize={11}
                  fill="hsl(var(--foreground))"
                  formatter={(v: number) => (unit === 'days' ? `${v}d` : String(v))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Colour key: shade = units sold, so colour never carries meaning alone. */}
          <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-muted-foreground" aria-hidden="true">
            <span>Fewer sold</span>
            <span className="flex overflow-hidden rounded-sm">
              {RAMP.map((c) => <span key={c} className="h-2.5 w-5" style={{ backgroundColor: c }} />)}
            </span>
            <span>More sold</span>
          </div>
          {/* Same data as a table for screen readers. */}
          <table className="sr-only">
            <caption>{title}</caption>
            <thead>
              <tr><th>Vehicle</th><th>{unit === 'sold' ? 'Units sold' : 'Average days on lot'}</th>{unit === 'days' && <th>Units sold</th>}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}><td>{r.name}</td><td>{r.value}</td>{unit === 'days' && <td>{r.sold}</td>}</tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

/**
 * Top-selling (units sold per make/model) and fastest-selling (average days on lot before
 * sale, fewest first) vehicles. Counts only, no money, so every role sees them.
 */
const SalesRankingCharts = memo(function SalesRankingCharts({ sales, vehicles }: { sales: SaleLike[]; vehicles: VehicleLike[] }) {
  const currentYear = new Date().getFullYear();
  const [scope, setScope] = useState<'year' | 'all'>('year');
  const year = scope === 'year' ? currentYear : null;

  const topSelling = useMemo<Row[]>(() => {
    const counts = new Map<string, number>();
    for (const s of sales) {
      const key = modelKey(s.vehicle);
      if (!key || !inScope(s.saleDate, year)) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, value]) => ({ name, value, sold: value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
      .slice(0, MAX_ROWS);
  }, [sales, year]);

  const fastestSelling = useMemo<Row[]>(() => {
    // daysInInventory is computed server-side; for sold cars it runs to the sale date.
    const groups = new Map<string, { total: number; sold: number }>();
    for (const v of vehicles) {
      const key = modelKey(v);
      const saleDate = v.sale?.saleDate;
      if (!key || !saleDate || !inScope(saleDate, year)) continue;
      const g = groups.get(key) || { total: 0, sold: 0 };
      g.total += Math.max(0, Number(v.daysInInventory) || 0);
      g.sold += 1;
      groups.set(key, g);
    }
    return [...groups.entries()]
      .map(([name, g]) => ({ name, value: Math.round(g.total / g.sold), sold: g.sold }))
      .sort((a, b) => a.value - b.value || b.sold - a.sold || a.name.localeCompare(b.name))
      .slice(0, MAX_ROWS);
  }, [vehicles, year]);

  const emptyText = scope === 'year' ? `No vehicles sold in ${currentYear} yet.` : 'No vehicles sold yet.';

  return (
    <section className="space-y-3" aria-label="Sales rankings">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black tracking-tight text-foreground">Sales rankings</h2>
        <div className="flex rounded-xl border border-border/50 bg-muted p-1" role="group" aria-label="Time range">
          {(['year', 'all'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              aria-pressed={scope === value}
              className={cn(
                'rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
                scope === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {value === 'year' ? String(currentYear) : 'All time'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RankingChart title="Top-selling vehicles" icon={Trophy} rows={topSelling} unit="sold" empty={emptyText} />
        <RankingChart title="Fastest-selling vehicles" icon={Gauge} rows={fastestSelling} unit="days" empty={emptyText} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Fastest-selling ranks by average days on the lot before sale, fewest first.
      </p>
    </section>
  );
});

export default SalesRankingCharts;
