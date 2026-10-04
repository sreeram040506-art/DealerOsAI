import { useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useSales } from '@/hooks/useSales';
import { useInventory } from '@/hooks/useInventory';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useExpenses } from '@/hooks/useExpenses';
import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '@/lib/utils';
import QueryErrorState from '@/components/QueryErrorState';
import VehicleDetailDialog from '@/components/VehicleDetailDialog';
import ReportControls from '@/components/reports/ReportControls';
import CostsToVerify from '@/components/reports/CostsToVerify';
import { buildCashFlow, flaggedVehicles, inventoryCashTiedUp, sumCash } from '@/lib/financeReport';
import { GRANULARITY_LABELS, inRange, yearsPresent } from '@/lib/reportPeriods';
import { useReportFilters } from '@/lib/reportFilters';
import { money } from '@/lib/reportFormat';
import type { Vehicle } from '@/types/inventory';

interface CashFlowProps {
  isSubpage?: boolean;
}

const sign = (n: number) => (n >= 0 ? 'text-primary' : 'text-destructive');

function StatementLine({ label, value, strong = false, indent = false }: { label: string; value: number; strong?: boolean; indent?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between py-1.5', strong && 'border-t border-border pt-2.5 font-bold', indent && 'pl-4')}>
      <span className={cn(!strong && 'text-muted-foreground')}>{label}</span>
      <span className={cn('tabular-nums', strong && sign(value))}>{money(value)}</span>
    </div>
  );
}

export default function CashFlow({ isSubpage = false }: CashFlowProps) {
  const { sales, isLoading: salesLoading, isError: salesError } = useSales();
  const { vehicles, isLoading: invLoading, isError: inventoryError } = useInventory();
  const { ads, isLoading: adsLoading, isError: adsError } = useAdvertising();
  const { expenses, isLoading: expLoading, isError: expensesError } = useExpenses();
  const { filters, setFilters, resolved, rangeLabel } = useReportFilters({ granularity: 'month' });
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  const inputs = useMemo(() => ({ sales, vehicles, ads, expenses }), [sales, vehicles, ads, expenses]);
  const years = useMemo(
    () => yearsPresent([
      ...sales.map((s) => s.saleDate),
      ...vehicles.map((v) => v.purchaseDate),
      ...ads.map((a) => a.startDate),
      ...expenses.map((e) => e.date),
    ]),
    [sales, vehicles, ads, expenses],
  );
  const rows = useMemo(() => buildCashFlow(inputs, filters.granularity, resolved, filters.order), [inputs, filters.granularity, resolved, filters.order]);
  const totals = useMemo(() => sumCash(rows), [rows]);
  const tiedUp = useMemo(() => inventoryCashTiedUp(vehicles), [vehicles]);
  const flagged = useMemo(
    () => flaggedVehicles(vehicles.filter((v) => inRange(v.purchaseDate || v.purchase?.purchaseDate, resolved))),
    [vehicles, resolved],
  );

  if (salesLoading || invLoading || adsLoading || expLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading cash flow...</div>;
  }

  if (salesError || inventoryError || adsError || expensesError) {
    const errorState = (
      <QueryErrorState
        title="Could not load cash flow"
        description="One or more financial data requests failed, so the page is stopping with an explicit error instead of calculating from partial empty data."
      />
    );
    return isSubpage ? errorState : <AppLayout>{errorState}</AppLayout>;
  }

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(20);
    doc.text('Cash Flow Report', 14, 20);
    doc.setFontSize(10);
    doc.text(`${rangeLabel} · ${GRANULARITY_LABELS[filters.granularity]} · Generated ${new Date().toLocaleDateString()}`, 14, 27);

    autoTable(doc, {
      startY: 33,
      head: [['Statement', rangeLabel]],
      body: [
        ['Cash in: vehicle sales', money(totals.salesIn)],
        ['Cash out: vehicle purchases', money(totals.purchases)],
        ['Cash out: repairs and reconditioning', money(totals.repairs)],
        ['Cash out: advertising', money(totals.advertising)],
        ['Cash out: operating expenses', money(totals.operating)],
        ['Total cash out', money(totals.cashOut)],
        ['Net cash flow', money(totals.net)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [34, 64, 211] },
      columnStyles: { 1: { halign: 'right' } },
      tableWidth: 120,
    });
    const afterStatement = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    const ordered = [...rows];
    autoTable(doc, {
      startY: afterStatement,
      head: [['Period', 'Sales in', 'Purchases', 'Repairs', 'Advertising', 'Operating', 'Total out', 'Net', 'Running balance']],
      body: [
        ...ordered.map((r) => [r.period.label, money(r.salesIn), money(r.purchases), money(r.repairs), money(r.advertising), money(r.operating), money(r.cashOut), money(r.net), money(r.cumulative)]),
        ['TOTAL', money(totals.salesIn), money(totals.purchases), money(totals.repairs), money(totals.advertising), money(totals.operating), money(totals.cashOut), money(totals.net), ''],
      ],
      theme: 'striped',
      headStyles: { fillColor: [40, 40, 45] },
      didParseCell: (hook) => { if (hook.row.index === ordered.length && hook.section === 'body') hook.cell.styles.fontStyle = 'bold'; },
    });
    if (totals.unverifiedCount > 0) {
      const endY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
      doc.setFontSize(9);
      doc.text(`Note: purchases include ${money(totals.unverifiedPurchases)} for ${totals.unverifiedCount} vehicle(s) whose purchase price is still to be confirmed.`, 14, endY + 7);
    }
    doc.save(`CashFlow_${rangeLabel.replace(/[^\w]+/g, '_')}_${filters.granularity}.pdf`);
  };

  const content = (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="animate-in slide-in-from-top-4 duration-500">
          {!isSubpage && <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Cash Flow Report</h1>}
          <p className={cn('text-muted-foreground', isSubpage ? 'text-sm' : 'mt-1')}>
            Money in and out, by the date it was paid. Showing {rangeLabel}.
          </p>
        </div>
        <Button onClick={generatePDF} size="sm" className="bg-primary text-xs font-bold uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
          <FileDown className="mr-2 h-3.5 w-3.5" /> Export PDF
        </Button>
      </div>

      <ReportControls filters={filters} onChange={setFilters} years={years} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="stat-card border-l-4 border-l-profit bg-secondary/30">
          <p className="stat-label text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">Cash in · {rangeLabel}</p>
          <p className="mt-1 font-display text-2xl font-black leading-none text-primary">{money(totals.salesIn)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Vehicle sales</p>
        </div>
        <div className="stat-card border-l-4 border-l-loss bg-secondary/30">
          <p className="stat-label text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">Cash out · {rangeLabel}</p>
          <p className="mt-1 font-display text-2xl font-black leading-none text-foreground">{money(totals.cashOut)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Cars, repairs, ads, expenses</p>
        </div>
        <div className="stat-card border-l-4 border-l-info bg-secondary/30">
          <p className="stat-label text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">Net cash flow · {rangeLabel}</p>
          <p className={cn('mt-1 font-display text-2xl font-black leading-none', sign(totals.net))}>{money(totals.net)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Cash in − cash out</p>
        </div>
        <div className="stat-card bg-secondary/30">
          <p className="stat-label text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">Cash in unsold cars · today</p>
          <p className="mt-1 font-display text-2xl font-black leading-none text-foreground">{money(tiedUp.amount)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{tiedUp.count} vehicle{tiedUp.count === 1 ? '' : 's'} on the lot, at cost</p>
        </div>
      </div>

      <CostsToVerify
        items={flagged}
        intro="The cash paid for these cars is counted at the price shown, which may not be what was paid."
        onOpenVehicle={setSelectedVehicle}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
        <section className="rounded-xl border border-border bg-card p-5 text-sm" aria-label="Cash flow statement">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Statement · {rangeLabel}</h3>
          <p className="pt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground/70">Cash in</p>
          <StatementLine label="Vehicle sales" value={totals.salesIn} indent />
          <p className="pt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground/70">Cash out</p>
          <StatementLine label="Vehicle purchases" value={totals.purchases} indent />
          <StatementLine label="Repairs & reconditioning" value={totals.repairs} indent />
          <StatementLine label="Advertising" value={totals.advertising} indent />
          <StatementLine label="Operating expenses" value={totals.operating} indent />
          <StatementLine label="Total cash out" value={totals.cashOut} strong />
          <StatementLine label="Net cash flow" value={totals.net} strong />
          {totals.unverifiedCount > 0 && (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
              Purchases include {money(totals.unverifiedPurchases)} for {totals.unverifiedCount} vehicle{totals.unverifiedCount === 1 ? '' : 's'} with an unconfirmed price.
            </p>
          )}
        </section>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 text-left font-bold">{GRANULARITY_LABELS[filters.granularity].replace('ly', '')}</th>
                  <th className="px-3 py-3 text-right font-bold">Sales in</th>
                  <th className="px-3 py-3 text-right font-bold">Purchases</th>
                  <th className="px-3 py-3 text-right font-bold">Repairs</th>
                  <th className="px-3 py-3 text-right font-bold">Advertising</th>
                  <th className="px-3 py-3 text-right font-bold">Operating</th>
                  <th className="px-3 py-3 text-right font-bold">Total out</th>
                  <th className="px-3 py-3 text-right font-bold">Net</th>
                  <th className="px-3 py-3 text-right font-bold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((r) => (
                  <tr key={r.period.key} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2.5 font-bold text-foreground">{r.period.label}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-primary">{money(r.salesIn)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.unverifiedCount > 0 && <span className="mr-1 text-amber-600" title="Includes a purchase price to be confirmed">⚠</span>}
                      {money(r.purchases)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{money(r.repairs)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{money(r.advertising)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{money(r.operating)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(r.cashOut)}</td>
                    <td className={cn('px-3 py-2.5 text-right font-bold tabular-nums', sign(r.net))}>{money(r.net)}</td>
                    <td className={cn('px-3 py-2.5 text-right tabular-nums', sign(r.cumulative))}>{money(r.cumulative)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No money moved in {rangeLabel}.</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="border-t-2 border-primary/30 bg-muted/70 font-bold">
                  <tr>
                    <td className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-primary">Total</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(totals.salesIn)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(totals.purchases)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(totals.repairs)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(totals.advertising)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(totals.operating)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(totals.cashOut)}</td>
                    <td className={cn('px-3 py-3 text-right tabular-nums', sign(totals.net))}>{money(totals.net)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      <VehicleDetailDialog vehicle={selectedVehicle} open={!!selectedVehicle} onOpenChange={(open) => !open && setSelectedVehicle(null)} />
    </div>
  );

  return isSubpage ? content : <AppLayout>{content}</AppLayout>;
}
