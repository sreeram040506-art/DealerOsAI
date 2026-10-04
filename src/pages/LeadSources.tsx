import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Megaphone } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import ReportControls from '@/components/reports/ReportControls';
import { buildLeadSources, NOT_RECORDED } from '@/lib/leadSources';
import { yearsPresent } from '@/lib/reportPeriods';
import { useReportFilters } from '@/lib/reportFilters';

const truncate = (s: string) => (s.length > 20 ? `${s.slice(0, 19)}…` : s);

/**
 * How many customers came from each source (CarGurus, Google, referrals, ...), by the date the
 * customer was added. Sources are set on each customer, from Customers.
 */
export default function LeadSources() {
  const { customers } = useCustomers();
  // Customer counts are small, so this opens on all time rather than the current year.
  const { filters, setFilters, resolved, rangeLabel } = useReportFilters({ range: { kind: 'all' } });

  const years = useMemo(() => yearsPresent(customers.map((c) => c.createdAt)), [customers]);
  const { rows, total } = useMemo(() => buildLeadSources(customers, resolved), [customers, resolved]);
  const recorded = rows.filter((r) => r.source !== NOT_RECORDED);
  const unrecorded = rows.find((r) => r.source === NOT_RECORDED)?.count ?? 0;
  const top = recorded[0];

  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">Lead Sources</h2>
        <p className="text-sm text-muted-foreground">Where customers came from. Showing {rangeLabel}, by the date each customer was added.</p>
      </div>

      <ReportControls filters={filters} onChange={setFilters} years={years} showGranularity={false} showOrder={false} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border/50 bg-muted/40 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Customers · {rangeLabel}</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{total}</p>
          <p className="text-xs text-muted-foreground">{recorded.length} source{recorded.length === 1 ? '' : 's'} recorded</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/40 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Top source</p>
          <p className="mt-1 truncate font-display text-2xl font-bold text-foreground">{top ? top.source : '—'}</p>
          <p className="text-xs text-muted-foreground">{top ? `${top.count} customer${top.count === 1 ? '' : 's'} · ${top.share.toFixed(0)}%` : 'No sources recorded yet'}</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/40 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">No source recorded</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{unrecorded}</p>
          <p className="text-xs text-muted-foreground">
            Set a source when you add or edit a customer in <Link to="/customers" className="text-primary underline">Customers</Link>.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-14 text-center text-muted-foreground">
          <Megaphone className="h-8 w-8" aria-hidden="true" />
          <p className="text-sm">No customers in {rangeLabel}.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="stat-card" role="figure" aria-label="Customers by lead source">
            <h3 className="mb-3 font-semibold text-foreground">Customers by source</h3>
            <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34 + 24)}>
              <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 40, top: 4, bottom: 4 }} barCategoryGap={8}>
                <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.6} horizontal={false} />
                <XAxis type="number" allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="source" width={124} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={truncate} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                  formatter={(value: number) => [`${value} customer${value === 1 ? '' : 's'}`, 'Customers']}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', fontSize: '12px' }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
                  <LabelList dataKey="count" position="right" fontSize={11} fill="hsl(var(--foreground))" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card/50">
            <table className="w-full text-sm">
              <caption className="sr-only">Customers by lead source</caption>
              <thead className="bg-muted/50 text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-bold">Source</th>
                  <th className="px-4 py-3 text-right font-bold">Customers</th>
                  <th className="px-4 py-3 text-right font-bold">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((r) => (
                  <tr key={r.source} className="hover:bg-muted/30">
                    <td className={r.source === NOT_RECORDED ? 'px-4 py-3 italic text-muted-foreground' : 'px-4 py-3 font-medium text-foreground'}>{r.source}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.count}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.share.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-primary/30 bg-muted/70 font-bold">
                <tr>
                  <td className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{total}</td>
                  <td className="px-4 py-3 text-right tabular-nums">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
