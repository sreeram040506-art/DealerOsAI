import { useState, useMemo } from 'react';
import { useSales } from '@/hooks/useSales';
import { useInventory } from '@/hooks/useInventory';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useExpenses } from '@/hooks/useExpenses';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { FileDown, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FinancialSummaryProps {
  isSubpage?: boolean;
}

export default function FinancialSummary({ isSubpage = false }: FinancialSummaryProps) {
  const { sales } = useSales();
  const { vehicles } = useInventory();
  const { ads } = useAdvertising();
  const { expenses } = useExpenses();
  const [period, setPeriod] = useState<'monthly' | 'yearly' | 'all'>('monthly');

  const report = useMemo(() => {
    const buckets = new Map<string, {
      revenue: number; cogs: number; repairCost: number;
      adSpend: number; opExpenses: number; unitsSold: number;
    }>();

    const getKey = (date: Date | string) => {
      const d = new Date(date);
      if (period === 'monthly') return d.toLocaleString('default', { month: 'short', year: 'numeric' });
      if (period === 'yearly') return String(d.getFullYear());
      return 'All Time';
    };

    const ensure = (key: string) => {
      if (!buckets.has(key)) buckets.set(key, { revenue: 0, cogs: 0, repairCost: 0, adSpend: 0, opExpenses: 0, unitsSold: 0 });
      return buckets.get(key)!;
    };

    // Sales revenue + COGS
    sales.forEach(s => {
      const b = ensure(getKey(s.saleDate));
      b.revenue += s.salePrice;
      b.unitsSold += 1;
      // COGS = purchase cost of the sold vehicle
      const vehicle = vehicles.find(v => v.id === s.vehicleId);
      if (vehicle) {
        b.cogs += (vehicle.totalPurchaseCost || vehicle.purchase?.totalPurchaseCost || 0);
        b.repairCost += (vehicle.repairCost || vehicle.repairs?.reduce((s,r)=>s+(r.partsCost||0)+(r.laborCost||0),0) || 0);
      }
    });

    // Advertising
    ads.forEach(a => {
      const b = ensure(getKey(a.startDate));
      b.adSpend += a.amountSpent;
    });

    // Operating Expenses
    expenses.forEach(e => {
      const b = ensure(getKey(e.date));
      b.opExpenses += e.amount;
    });

    const rows = Array.from(buckets.entries()).map(([periodLabel, data]) => {
      const grossProfit = data.revenue - data.cogs - data.repairCost;
      const totalExpenses = data.adSpend + data.opExpenses;
      const netProfit = grossProfit - totalExpenses;
      return { period: periodLabel, ...data, grossProfit, totalExpenses, netProfit };
    });

    // Sort by period descending
    if (period !== 'all') {
      rows.sort((a, b) => b.period.localeCompare(a.period));
    }

    return rows;
  }, [sales, vehicles, ads, expenses, period]);

  const totals = useMemo(() => ({
    revenue: report.reduce((s, r) => s + r.revenue, 0),
    cogs: report.reduce((s, r) => s + r.cogs, 0),
    repairCost: report.reduce((s, r) => s + r.repairCost, 0),
    grossProfit: report.reduce((s, r) => s + r.grossProfit, 0),
    adSpend: report.reduce((s, r) => s + r.adSpend, 0),
    opExpenses: report.reduce((s, r) => s + r.opExpenses, 0),
    totalExpenses: report.reduce((s, r) => s + r.totalExpenses, 0),
    netProfit: report.reduce((s, r) => s + r.netProfit, 0),
    unitsSold: report.reduce((s, r) => s + r.unitsSold, 0),
  }), [report]);

  const generatePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Profit & Loss Report', 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()} | View: ${period.toUpperCase()}`, 14, 30);

    autoTable(doc, {
      head: [['Period', 'Units', 'Revenue', 'COGS', 'Repair', 'Gross Profit', 'Ad Spend', 'Op. Expenses', 'Net Profit']],
      body: [
        ...report.map(r => [
          r.period, r.unitsSold.toString(),
          `$${r.revenue.toLocaleString()}`, `$${r.cogs.toLocaleString()}`,
          `$${r.repairCost.toLocaleString()}`, `$${r.grossProfit.toLocaleString()}`,
          `$${r.adSpend.toLocaleString()}`, `$${r.opExpenses.toLocaleString()}`,
          `$${r.netProfit.toLocaleString()}`
        ]),
        ['TOTAL', totals.unitsSold.toString(),
          `$${totals.revenue.toLocaleString()}`, `$${totals.cogs.toLocaleString()}`,
          `$${totals.repairCost.toLocaleString()}`, `$${totals.grossProfit.toLocaleString()}`,
          `$${totals.adSpend.toLocaleString()}`, `$${totals.opExpenses.toLocaleString()}`,
          `$${totals.netProfit.toLocaleString()}`
        ]
      ],
      startY: 38,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] },
    });

    doc.save(`PnL_Report_${period}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6 p-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h3 className="text-xl font-display font-bold text-foreground">Profit & Loss Statement</h3>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
            <SelectTrigger className="w-[180px] bg-muted/50 border-border h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-muted border-border text-foreground">
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={generatePDF} size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs uppercase tracking-widest">
            <FileDown className="w-3.5 h-3.5 mr-2" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-muted/40 border border-border/50 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Total Sales</p>
          <p className="text-2xl font-display font-bold text-foreground mt-1">{totals.unitsSold}</p>
          <p className="text-xs text-muted-foreground">${totals.revenue.toLocaleString()} revenue</p>
        </div>
        <div className="bg-muted/40 border border-border/50 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Total Expenses</p>
          <p className="text-2xl font-display font-bold text-foreground mt-1">${totals.totalExpenses.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Ads + Operating</p>
        </div>
        <div className="bg-muted/40 border border-border/50 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Gross Profit</p>
          <p className={cn("text-2xl font-display font-bold mt-1", totals.grossProfit >= 0 ? "text-primary" : "text-foreground")}>
            ${totals.grossProfit.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">Revenue - COGS</p>
        </div>
        <div className="bg-muted/40 border border-primary/20 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-bold text-primary">Net Profit</p>
          <p className={cn("text-2xl font-display font-bold mt-1", totals.netProfit >= 0 ? "text-primary" : "text-foreground")}>
            ${totals.netProfit.toLocaleString()}
          </p>
          <div className="flex items-center gap-1 mt-1">
            {totals.netProfit >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-primary" /> : <TrendingDown className="w-3.5 h-3.5 text-foreground" />}
            <span className={cn("text-xs font-bold", totals.netProfit >= 0 ? "text-primary" : "text-foreground")}>
              {totals.revenue > 0 ? ((totals.netProfit / totals.revenue) * 100).toFixed(1) : 0}% margin
            </span>
          </div>
        </div>
      </div>

      {/* P&L Table */}
      <div className="bg-card/50 rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Period</th>
                <th className="px-4 py-3 text-right font-bold">Units</th>
                <th className="px-4 py-3 text-right font-bold">Revenue</th>
                <th className="px-4 py-3 text-right font-bold">COGS</th>
                <th className="px-4 py-3 text-right font-bold">Gross Profit</th>
                <th className="px-4 py-3 text-right font-bold">Ad Spend</th>
                <th className="px-4 py-3 text-right font-bold">Op. Exp</th>
                <th className="px-4 py-3 text-right font-bold">Net Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {report.map((row, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-bold text-foreground">{row.period}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{row.unitsSold}</td>
                  <td className="px-4 py-3 text-right text-foreground font-medium">${row.revenue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-foreground">${row.cogs.toLocaleString()}</td>
                  <td className={cn("px-4 py-3 text-right font-bold", row.grossProfit >= 0 ? "text-primary" : "text-foreground")}>
                    ${row.grossProfit.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">${row.adSpend.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">${row.opExpenses.toLocaleString()}</td>
                  <td className={cn("px-4 py-3 text-right font-display font-bold text-base", row.netProfit >= 0 ? "text-primary" : "text-foreground")}>
                    ${row.netProfit.toLocaleString()}
                  </td>
                </tr>
              ))}
              {report.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No data for the selected period.</td></tr>
              )}
            </tbody>
            {report.length > 0 && (
              <tfoot className="bg-muted/70 border-t-2 border-primary/30">
                <tr>
                  <td className="px-4 py-3 font-black text-primary uppercase text-[10px] tracking-widest">Total</td>
                  <td className="px-4 py-3 text-right font-bold text-foreground">{totals.unitsSold}</td>
                  <td className="px-4 py-3 text-right font-bold text-foreground">${totals.revenue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-bold text-foreground">${totals.cogs.toLocaleString()}</td>
                  <td className={cn("px-4 py-3 text-right font-bold", totals.grossProfit >= 0 ? "text-primary" : "text-foreground")}>
                    ${totals.grossProfit.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-muted-foreground">${totals.adSpend.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-bold text-muted-foreground">${totals.opExpenses.toLocaleString()}</td>
                  <td className={cn("px-4 py-3 text-right font-black text-lg font-display", totals.netProfit >= 0 ? "text-primary" : "text-foreground")}>
                    ${totals.netProfit.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
