import { useMemo, useState } from 'react';
import { useSales } from '@/hooks/useSales';
import { useInventory } from '@/hooks/useInventory';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useExpenses } from '@/hooks/useExpenses';
import { Button } from '@/components/ui/button';
import { FileDown, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ReportControls from '@/components/reports/ReportControls';
import PeriodDetailDialog from '@/components/reports/PeriodDetailDialog';
import CostsToVerify from '@/components/reports/CostsToVerify';
import VehicleDetailDialog from '@/components/VehicleDetailDialog';
import { buildPnL, sumPnL } from '@/lib/financeReport';
import { GRANULARITY_LABELS, yearsPresent, type Period } from '@/lib/reportPeriods';
import { useReportFilters } from '@/lib/reportFilters';
import { money } from '@/lib/reportFormat';
import type { Vehicle } from '@/types/inventory';

interface FinancialSummaryProps {
  isSubpage?: boolean;
}

const positive = (n: number) => (n >= 0 ? 'text-primary' : 'text-destructive');

export default function FinancialSummary({ isSubpage = false }: FinancialSummaryProps) {
  const { sales } = useSales();
  const { vehicles } = useInventory();
  const { ads } = useAdvertising();
  const { expenses } = useExpenses();
  // Opens on the current year: all-time totals mixed every year together.
  const { filters, setFilters, resolved, rangeLabel } = useReportFilters({ granularity: 'month' });
  const [detailPeriod, setDetailPeriod] = useState<Period | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  const inputs = useMemo(() => ({ sales, vehicles, ads, expenses }), [sales, vehicles, ads, expenses]);
  const years = useMemo(
    () => yearsPresent([
      ...sales.map((s) => s.saleDate),
      ...ads.map((a) => a.startDate),
      ...expenses.map((e) => e.date),
    ]),
    [sales, ads, expenses],
  );
  const rows = useMemo(() => buildPnL(inputs, filters.granularity, resolved, filters.order), [inputs, filters.granularity, resolved, filters.order]);
  const totals = useMemo(() => sumPnL(rows), [rows]);
  const flagged = useMemo(
    () => rows.flatMap((r) => r.sold).flatMap((i) => (i.vehicle && i.flag ? [{ vehicle: i.vehicle, flag: i.flag }] : [])),
    [rows],
  );
  const margin = totals.revenue > 0 ? ((totals.netProfit / totals.revenue) * 100).toFixed(1) : '0.0';

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(20);
    doc.text('Profit & Loss Report', 14, 20);
    doc.setFontSize(10);
    doc.text(`${rangeLabel} · ${GRANULARITY_LABELS[filters.granularity]} · Generated ${new Date().toLocaleDateString()}`, 14, 27);

    autoTable(doc, {
      head: [['Period', 'Units', 'Revenue', 'Vehicle cost', 'Repairs', 'Gross profit', 'Advertising', 'Operating', 'Net profit']],
      body: [
        ...rows.map((r) => [r.period.label, r.units, money(r.revenue), money(r.cogs), money(r.repairCost), money(r.grossProfit), money(r.adSpend), money(r.opExpenses), money(r.netProfit)]),
        ['TOTAL', totals.units, money(totals.revenue), money(totals.cogs), money(totals.repairCost), money(totals.grossProfit), money(totals.adSpend), money(totals.opExpenses), money(totals.netProfit)],
      ],
      startY: 33,
      theme: 'grid',
      headStyles: { fillColor: [34, 64, 211] },
      didParseCell: (hook) => { if (hook.row.index === rows.length && hook.section === 'body') hook.cell.styles.fontStyle = 'bold'; },
    });
    if (totals.unverified > 0) {
      const endY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
      doc.setFontSize(9);
      doc.text(`Note: ${totals.unverified} sold vehicle(s) have a purchase price still to be confirmed; their profit may change.`, 14, endY + 7);
    }
    doc.save(`PnL_${rangeLabel.replace(/[^\w]+/g, '_')}_${filters.granularity}.pdf`);
  };

  const content = (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Profit & Loss</h2>
          <p className="text-sm text-muted-foreground">Showing {rangeLabel}. Click a row to see its vehicles{filters.granularity === 'year' ? ' and all 12 months' : filters.granularity === 'quarter' ? ' and its 3 months' : ''}.</p>
        </div>
        <Button onClick={generatePDF} size="sm" className="bg-primary text-xs font-bold uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
          <FileDown className="mr-2 h-3.5 w-3.5" /> Export PDF
        </Button>
      </div>

      <ReportControls filters={filters} onChange={setFilters} years={years} />

      {/* Summary: these follow the range above, current year by default */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border/50 bg-muted/40 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Sales · {rangeLabel}</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{totals.units}</p>
          <p className="text-xs text-muted-foreground">{money(totals.revenue)} revenue</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/40 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Expenses · {rangeLabel}</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{money(totals.totalExpenses)}</p>
          <p className="text-xs text-muted-foreground">Advertising + operating</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/40 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Gross Profit · {rangeLabel}</p>
          <p className={cn('mt-1 font-display text-2xl font-bold', positive(totals.grossProfit))}>{money(totals.grossProfit)}</p>
          <p className="text-xs text-muted-foreground">Revenue − vehicle cost − repairs</p>
        </div>
        <div className="rounded-xl border border-primary/20 bg-muted/40 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Net Profit · {rangeLabel}</p>
          <p className={cn('mt-1 font-display text-2xl font-bold', positive(totals.netProfit))}>{money(totals.netProfit)}</p>
          <div className="mt-1 flex items-center gap-1">
            {totals.netProfit >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-primary" /> : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
            <span className={cn('text-xs font-bold', positive(totals.netProfit))}>{margin}% margin</span>
          </div>
        </div>
      </div>

      <CostsToVerify
        items={flagged}
        intro="Their profit may be off until the real price is entered."
        onOpenVehicle={setSelectedVehicle}
      />

      <div className="overflow-hidden rounded-xl border border-border bg-card/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-bold">{GRANULARITY_LABELS[filters.granularity].replace('ly', '')}</th>
                <th className="px-4 py-3 text-right font-bold">Units</th>
                <th className="px-4 py-3 text-right font-bold">Revenue</th>
                <th className="px-4 py-3 text-right font-bold">Vehicle cost</th>
                <th className="px-4 py-3 text-right font-bold">Repairs</th>
                <th className="px-4 py-3 text-right font-bold">Gross profit</th>
                <th className="px-4 py-3 text-right font-bold">Advertising</th>
                <th className="px-4 py-3 text-right font-bold">Operating</th>
                <th className="px-4 py-3 text-right font-bold">Net profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((row) => (
                <tr key={row.period.key} onClick={() => setDetailPeriod(row.period)} className="cursor-pointer transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-bold text-foreground">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setDetailPeriod(row.period); }} className="text-left text-primary hover:underline">
                      {row.period.label}
                    </button>
                    {row.unverified > 0 && <span className="ml-2 text-xs font-normal text-amber-600" title="Includes a vehicle whose purchase price is to be confirmed">⚠</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{row.units}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">{money(row.revenue)}</td>
                  <td className="px-4 py-3 text-right text-foreground tabular-nums">{money(row.cogs)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{money(row.repairCost)}</td>
                  <td className={cn('px-4 py-3 text-right font-bold tabular-nums', positive(row.grossProfit))}>{money(row.grossProfit)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{money(row.adSpend)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{money(row.opExpenses)}</td>
                  <td className={cn('px-4 py-3 text-right font-display text-base font-bold tabular-nums', positive(row.netProfit))}>{money(row.netProfit)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No sales, advertising or expenses in {rangeLabel}.</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-primary/30 bg-muted/70">
                <tr>
                  <td className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary">Total</td>
                  <td className="px-4 py-3 text-right font-bold text-foreground tabular-nums">{totals.units}</td>
                  <td className="px-4 py-3 text-right font-bold text-foreground tabular-nums">{money(totals.revenue)}</td>
                  <td className="px-4 py-3 text-right font-bold text-foreground tabular-nums">{money(totals.cogs)}</td>
                  <td className="px-4 py-3 text-right font-bold text-muted-foreground tabular-nums">{money(totals.repairCost)}</td>
                  <td className={cn('px-4 py-3 text-right font-bold tabular-nums', positive(totals.grossProfit))}>{money(totals.grossProfit)}</td>
                  <td className="px-4 py-3 text-right font-bold text-muted-foreground tabular-nums">{money(totals.adSpend)}</td>
                  <td className="px-4 py-3 text-right font-bold text-muted-foreground tabular-nums">{money(totals.opExpenses)}</td>
                  <td className={cn('px-4 py-3 text-right font-display text-lg font-black tabular-nums', positive(totals.netProfit))}>{money(totals.netProfit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <PeriodDetailDialog period={detailPeriod} inputs={inputs} onClose={() => setDetailPeriod(null)} onOpenVehicle={setSelectedVehicle} />
      <VehicleDetailDialog vehicle={selectedVehicle} open={!!selectedVehicle} onOpenChange={(open) => !open && setSelectedVehicle(null)} />
    </div>
  );

  return isSubpage ? content : <div className="mx-auto max-w-7xl">{content}</div>;
}
