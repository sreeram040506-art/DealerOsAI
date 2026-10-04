import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, FileDown } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildPnL, sumPnL, type FinanceInputs } from '@/lib/financeReport';
import { childMonths, type Period } from '@/lib/reportPeriods';
import { money, vehicleLabel } from '@/lib/reportFormat';
import { addSoldVehiclesTable } from '@/lib/reportPdf';
import { formatSafeDate } from '@/lib/dateUtils';
import type { Vehicle } from '@/types/inventory';

const GRANULARITY_NOUN = { week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' } as const;

/**
 * Drill-down for one period. A year shows its 12 months and a quarter its 3 (click a month to
 * go into it); every period lists the vehicles sold in it. The PDF is laid out for printing.
 */
export default function PeriodDetailDialog({
  period,
  inputs,
  onClose,
  onOpenVehicle,
}: {
  period: Period | null;
  inputs: FinanceInputs;
  onClose: () => void;
  onOpenVehicle: (vehicle: Vehicle) => void;
}) {
  const [trail, setTrail] = useState<Period[]>([]);
  useEffect(() => setTrail(period ? [period] : []), [period]);
  const view = trail[trail.length - 1] ?? null;

  const data = useMemo(() => {
    if (!view) return null;
    const range = { from: view.start, to: view.end };
    const monthRows = buildPnL(inputs, 'month', range, 'oldest');
    const byKey = new Map(monthRows.map((r) => [r.period.key, r]));
    const months = childMonths(view).map((m) => ({ period: m, row: byKey.get(m.key) ?? null }));
    const totals = sumPnL(monthRows);
    const sold = monthRows.flatMap((r) => r.sold).sort((a, b) => new Date(b.sale.saleDate).getTime() - new Date(a.sale.saleDate).getTime());
    return { months, totals, sold };
  }, [view, inputs]);

  if (!view || !data) return null;
  const { months, totals, sold } = data;

  const downloadPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(18);
    doc.text(`Sold vehicles · ${view.label}`, 14, 18);
    doc.setFontSize(10);
    doc.text(
      `${totals.units} sold · Revenue ${money(totals.revenue)} · Gross profit ${money(totals.grossProfit)} · Net profit ${money(totals.netProfit)} · Generated ${new Date().toLocaleDateString()}`,
      14, 25,
    );
    let y = 31;
    if (months.length) {
      autoTable(doc, {
        startY: y,
        head: [['Month', 'Sold', 'Revenue', 'Vehicle cost', 'Repairs', 'Gross profit', 'Advertising', 'Operating', 'Net profit']],
        body: [
          ...months.map(({ period: p, row }) => [p.label, row?.units ?? 0, money(row?.revenue), money(row?.cogs), money(row?.repairCost), money(row?.grossProfit), money(row?.adSpend), money(row?.opExpenses), money(row?.netProfit)]),
          ['Total', totals.units, money(totals.revenue), money(totals.cogs), money(totals.repairCost), money(totals.grossProfit), money(totals.adSpend), money(totals.opExpenses), money(totals.netProfit)],
        ],
        theme: 'grid',
        headStyles: { fillColor: [34, 64, 211] },
        didParseCell: (hook) => { if (hook.row.index === months.length && hook.section === 'body') hook.cell.styles.fontStyle = 'bold'; },
      });
      y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || y) + 10;
    }
    addSoldVehiclesTable(doc, sold, y);
    doc.save(`Sold_${view.label.replace(/[^\w]+/g, '_')}.pdf`);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto bg-card">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3 pr-6">
            <div>
              {trail.length > 1 && (
                <Button type="button" variant="ghost" size="sm" className="-ml-3 mb-1" onClick={() => setTrail(trail.slice(0, -1))}>
                  <ArrowLeft className="mr-1 h-4 w-4" /> Back to {trail[trail.length - 2].label}
                </Button>
              )}
              <DialogTitle className="text-2xl font-bold">{GRANULARITY_NOUN[view.granularity]}: {view.label}</DialogTitle>
              <DialogDescription>
                {totals.units} vehicle{totals.units === 1 ? '' : 's'} sold · {money(totals.revenue)} revenue · {money(totals.grossProfit)} gross profit · {money(totals.netProfit)} net profit
              </DialogDescription>
            </div>
            <Button type="button" onClick={downloadPdf} className="gap-2">
              <FileDown className="h-4 w-4" /> Download PDF
            </Button>
          </div>
        </DialogHeader>

        {months.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              {view.granularity === 'year' ? 'All 12 months' : 'Months in this quarter'}
            </h3>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Month</th>
                    <th className="px-3 py-2 text-right">Sold</th>
                    <th className="px-3 py-2 text-right">Revenue</th>
                    <th className="px-3 py-2 text-right">Gross profit</th>
                    <th className="px-3 py-2 text-right">Advertising</th>
                    <th className="px-3 py-2 text-right">Operating</th>
                    <th className="px-3 py-2 text-right">Net profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {months.map(({ period: m, row }) => {
                    const clickable = Boolean(row && row.units > 0);
                    return (
                      <tr
                        key={m.key}
                        onClick={clickable ? () => setTrail([...trail, m]) : undefined}
                        className={cn(clickable ? 'cursor-pointer hover:bg-muted/40' : 'text-muted-foreground')}
                      >
                        <td className="px-3 py-2 font-medium">
                          {clickable ? (
                            <button type="button" onClick={(e) => { e.stopPropagation(); setTrail([...trail, m]); }} className="text-left font-semibold text-primary hover:underline">
                              {m.label}
                            </button>
                          ) : m.label}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row?.units ?? 0}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(row?.revenue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(row?.grossProfit)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(row?.adSpend)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(row?.opExpenses)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(row?.netProfit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-border bg-muted/50 font-bold">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">{totals.units}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(totals.revenue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(totals.grossProfit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(totals.adSpend)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(totals.opExpenses)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(totals.netProfit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">Click a month to see the vehicles sold in it.</p>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Vehicles sold ({sold.length})</h3>
          {sold.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">No vehicles sold in this period.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Vehicle</th>
                    <th className="px-3 py-2 text-left">Customer</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2 text-right">Gross profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {sold.map((i) => (
                    <tr
                      key={i.sale.id}
                      onClick={() => i.vehicle && onOpenVehicle(i.vehicle)}
                      className={cn(i.vehicle && 'cursor-pointer hover:bg-muted/40')}
                    >
                      <td className="whitespace-nowrap px-3 py-2">{formatSafeDate(i.sale.saleDate)}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{vehicleLabel(i.vehicle)}</span>
                        {i.vehicle?.stockNumber && <span className="ml-2 font-mono text-xs text-muted-foreground">#{i.vehicle.stockNumber}</span>}
                      </td>
                      <td className="px-3 py-2">{i.sale.customerName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(i.price)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {i.flag && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" aria-label="Purchase price to confirm" />}
                        {money(i.cost + i.repairs)}
                      </td>
                      <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', i.gross < 0 && 'text-destructive')}>{money(i.gross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
