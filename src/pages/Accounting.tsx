import AppLayout from '@/components/AppLayout';
import { useState, useMemo } from 'react';
import { useSales } from '@/hooks/useSales';
import { useInventory } from '@/hooks/useInventory';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useExpenses } from '@/hooks/useExpenses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, MessageSquare } from 'lucide-react';

function formatCurrency(v: number) {
  return `$${(v || 0).toLocaleString()}`;
}

function toCSV(rows: any[]) {
  if (!rows || rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const lines = [keys.join(',')].concat(rows.map(r => keys.map(k => {
    const v = r[k];
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  }).join(',')));
  return lines.join('\n');
}

export default function Accounting() {
  const { sales } = useSales();
  const { vehicles } = useInventory();
  const { ads } = useAdvertising();
  const { expenses } = useExpenses();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const transactions = useMemo(() => {
    const txs: any[] = [];
    sales?.forEach(s => {
      const vehicle = vehicles.find(v => v.id === s.vehicleId);
      txs.push({ type: 'income', label: `Sale: ${vehicle?.make || 'Unknown'} ${vehicle?.model || ''}`, amount: s.salePrice, date: s.saleDate, source: 'sale' });
    });
    vehicles?.forEach(v => {
      const purchaseCost = (v.totalPurchaseCost || v.purchase?.totalPurchaseCost || 0) + (v.repairCost || v.repairs?.reduce((s,r)=>s+(r.partsCost||0)+(r.laborCost||0),0) || 0);
      txs.push({ type: 'expense', label: `Purchase & Prep: ${v.make} ${v.model}`, amount: purchaseCost, date: v.purchaseDate || v.purchase?.purchaseDate, source: 'purchase' });
    });
    expenses?.forEach(e => txs.push({ type: 'expense', label: e.category, amount: e.amount, date: e.date, source: 'expense' }));
    ads?.forEach(a => txs.push({ type: 'expense', label: `Ad: ${a.campaignName}`, amount: a.amountSpent, date: a.startDate, source: 'ad' }));
    // Apply date filters when provided
    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() : null;
    return txs.filter(tx => {
      if (!tx.date) return true;
      const d = new Date(tx.date).getTime();
      if (fromTs && d < fromTs) return false;
      if (toTs && d > toTs) return false;
      return true;
    }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, vehicles, expenses, ads, from, to]);

  const totalIncome = useMemo(() => sales.reduce((s, sale) => s + (sale.salePrice || 0), 0), [sales]);
  const totalOutgoing = useMemo(() => {
    const carCosts = vehicles.reduce((s, v) => s + (((v.totalPurchaseCost || v.purchase?.totalPurchaseCost || 0)) + ((v.repairCost || v.repairs?.reduce((s,r)=>s+(r.partsCost||0)+(r.laborCost||0),0) || 0))), 0);
    const adsCost = ads.reduce((s, a) => s + (a.amountSpent || 0), 0);
    const op = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    return carCosts + adsCost + op;
  }, [vehicles, ads, expenses]);

  const exportCsv = () => {
    const rows = transactions.map(tx => ({ Date: tx.date ? new Date(tx.date).toISOString() : '', Type: tx.type, Label: tx.label, Amount: tx.amount, Source: tx.source }));
    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounting-transactions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="animate-in slide-in-from-top-4 duration-500 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground tracking-tight">Accounting</h1>
            <p className="text-muted-foreground mt-1">Live financials: cash flow, expenses and ledgers</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground mr-1">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground mr-1">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button variant="outline" onClick={() => { setFrom(''); setTo(''); }}>Clear</Button>
            <Button onClick={exportCsv}><Download className="w-4 h-4 mr-2" /> Export CSV</Button>
            <Button asChild>
              <a href="/ai-insights" className="flex items-center"><MessageSquare className="w-4 h-4 mr-2"/> Ask AI</a>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {/* Reuse the CashFlow visual by embedding its markup via the existing page — user can click into details */}
            <div className="bg-card rounded-xl border border-border shadow-xl p-4">
              <h3 className="font-bold mb-3">Overview</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-secondary/30 rounded">Total Income<br/><strong>{formatCurrency(totalIncome)}</strong></div>
                <div className="p-4 bg-secondary/30 rounded">Total Outgoing<br/><strong>{formatCurrency(totalOutgoing)}</strong></div>
                <div className="p-4 bg-secondary/30 rounded">Net Cash Flow<br/><strong>{formatCurrency(totalIncome - totalOutgoing)}</strong></div>
              </div>
            </div>

            <div className="mt-6 bg-card rounded-xl border border-border shadow-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-muted/30">
                <h3 className="font-display font-bold text-foreground uppercase tracking-widest text-xs">Transaction Registry</h3>
              </div>
              <div className="divide-y divide-border">
                {transactions.map((tx, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">{tx.type === 'income' ? '+' : '-'}</div>
                      <div>
                        <p className="text-sm font-bold">{tx.label}</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{new Date(tx.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="font-display font-bold text-lg">{tx.type === 'income' ? '+' : '-'}{Number(tx.amount).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-card rounded-xl border border-border overflow-hidden shadow-xl p-4">
              <h3 className="font-bold mb-2">Quick Actions</h3>
              <div className="flex flex-col gap-2">
                <Button onClick={exportCsv} className="w-full"><Download className="w-4 h-4 mr-2"/> Export Transactions</Button>
                <a href="/expenses" className="w-full"><Button variant="ghost" className="w-full">Manage Expenses</Button></a>
                <a href="/cash-flow" className="w-full"><Button variant="ghost" className="w-full">View Cash Flow</Button></a>
                <a href="/ai-insights" className="w-full"><Button variant="outline" className="w-full"><MessageSquare className="w-4 h-4 mr-2"/> Ask AI about accounting</Button></a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
