import AppLayout from '@/components/AppLayout';
import { useState, useMemo } from 'react';
import { useSales } from '@/hooks/useSales';
import { useInventory } from '@/hooks/useInventory';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useExpenses } from '@/hooks/useExpenses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Download, MessageSquare, TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, Search, Filter, Car, Receipt, Megaphone, CreditCard } from 'lucide-react';

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

type TxType = 'all' | 'income' | 'expense';
type TxSource = 'all' | 'sale' | 'purchase' | 'expense' | 'ad';

const sourceLabels: Record<string, string> = {
  sale: 'Sale',
  purchase: 'Vehicle',
  expense: 'Expense',
  ad: 'Advertising',
};

const sourceIcons: Record<string, typeof Receipt> = {
  sale: Receipt,
  purchase: Car,
  expense: CreditCard,
  ad: Megaphone,
};

export default function Accounting() {
  const { sales } = useSales();
  const { vehicles } = useInventory();
  const { ads } = useAdvertising();
  const { expenses } = useExpenses();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<TxType>('all');
  const [sourceFilter, setSourceFilter] = useState<TxSource>('all');
  const [search, setSearch] = useState('');

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

    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() : null;
    return txs.filter(tx => {
      if (!tx.date) return true;
      const d = new Date(tx.date).getTime();
      if (fromTs && d < fromTs) return false;
      if (toTs && d > toTs) return false;
      return true;
    }).filter(tx => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (sourceFilter !== 'all' && tx.source !== sourceFilter) return false;
      if (search && !tx.label.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, vehicles, expenses, ads, from, to, typeFilter, sourceFilter, search]);

  const totalIncome = useMemo(() => sales.reduce((s, sale) => s + (sale.salePrice || 0), 0), [sales]);
  const totalOutgoing = useMemo(() => {
    const carCosts = vehicles.reduce((s, v) => s + (((v.totalPurchaseCost || v.purchase?.totalPurchaseCost || 0)) + ((v.repairCost || v.repairs?.reduce((s,r)=>s+(r.partsCost||0)+(r.laborCost||0),0) || 0))), 0);
    const adsCost = ads.reduce((s, a) => s + (a.amountSpent || 0), 0);
    const op = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    return carCosts + adsCost + op;
  }, [vehicles, ads, expenses]);

  const netCashFlow = totalIncome - totalOutgoing;

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
        {/* Header */}
        <section className="relative overflow-hidden rounded-[32px] border border-border bg-white p-6 md:p-8 shadow-xl shadow-black/[0.02]">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary shadow-sm">
                <Wallet className="h-3.5 w-3.5" />
                Financial Overview
              </div>
              <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight text-foreground leading-[1.1]">
                Accounting
              </h1>
              <p className="max-w-xl text-sm text-muted-foreground font-medium">
                Live financials: cash flow, expenses, and ledgers across your dealership.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={exportCsv} variant="outline" className="rounded-xl h-10 px-4 text-xs font-black uppercase tracking-widest gap-2">
                <Download className="w-4 h-4" /> Export CSV
              </Button>
              <Button asChild className="rounded-xl h-10 px-4 text-xs font-black uppercase tracking-widest gap-2">
                <a href="/ai-insights"><MessageSquare className="w-4 h-4" /> Ask AI</a>
              </Button>
            </div>
          </div>
        </section>

        {/* Overview Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Income</p>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="w-4.5 h-4.5 text-emerald-600" />
              </div>
            </div>
            <p className="text-2xl font-black text-foreground">{formatCurrency(totalIncome)}</p>
            <p className="text-xs text-emerald-600 font-bold mt-1 flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5" /> {sales.length} sales recorded
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Outgoing</p>
              <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
                <TrendingDown className="w-4.5 h-4.5 text-red-500" />
              </div>
            </div>
            <p className="text-2xl font-black text-foreground">{formatCurrency(totalOutgoing)}</p>
            <p className="text-xs text-red-500 font-bold mt-1 flex items-center gap-1">
              <ArrowDownRight className="w-3.5 h-3.5" /> {vehicles.length + ads.length + expenses.length} expenses
            </p>
          </div>

          <div className={cn(
            "rounded-2xl border p-5 shadow-sm",
            netCashFlow >= 0 ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50"
          )}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Net Cash Flow</p>
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", netCashFlow >= 0 ? "bg-emerald-500/10" : "bg-red-500/10")}>
                <Wallet className={cn("w-4.5 h-4.5", netCashFlow >= 0 ? "text-emerald-600" : "text-red-500")} />
              </div>
            </div>
            <p className={cn("text-2xl font-black", netCashFlow >= 0 ? "text-emerald-700" : "text-red-600")}>
              {formatCurrency(netCashFlow)}
            </p>
            <p className={cn("text-xs font-bold mt-1", netCashFlow >= 0 ? "text-emerald-600" : "text-red-500")}>
              {netCashFlow >= 0 ? 'Profitable' : 'Net loss'}
            </p>
          </div>
        </section>

        {/* Filters */}
        <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row gap-3">
            {/* Date range */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-xl text-sm w-[150px]" />
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-xl text-sm w-[150px]" />
              {(from || to) && (
                <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); }} className="h-9 rounded-xl text-xs font-bold">
                  Clear dates
                </Button>
              )}
            </div>

            <div className="lg:ml-auto flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search transactions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 rounded-xl text-sm w-[200px]"
                />
              </div>

              {/* Type filter */}
              <div className="flex items-center rounded-xl border border-border overflow-hidden">
                {(['all', 'income', 'expense'] as TxType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={cn(
                      "px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors",
                      typeFilter === t ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-muted-foreground"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Source filter */}
              <div className="flex items-center rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => setSourceFilter('all')}
                  className={cn(
                    "px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors",
                    sourceFilter === 'all' ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  <Filter className="w-3 h-3" />
                </button>
                {(['sale', 'purchase', 'expense', 'ad'] as TxSource[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setSourceFilter(s)}
                    className={cn(
                      "px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors",
                      sourceFilter === s ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-muted-foreground"
                    )}
                  >
                    {sourceLabels[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Transaction List */}
        <section className="rounded-3xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
            <h3 className="font-display font-bold text-foreground uppercase tracking-widest text-xs">
              Transaction Registry
            </h3>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {transactions.length} record{transactions.length !== 1 ? 's' : ''}
            </span>
          </div>

          {transactions.length === 0 ? (
            <div className="py-16 text-center">
              <Wallet className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-bold text-muted-foreground">No transactions found</p>
              <p className="text-xs text-muted-foreground mt-1">Adjust your filters or date range to see records.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {transactions.map((tx, i) => {
                const isIncome = tx.type === 'income';
                const Icon = sourceIcons[tx.source] || Receipt;
                return (
                  <div key={i} className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        isIncome ? "bg-emerald-500/10" : "bg-red-500/10"
                      )}>
                        <Icon className={cn("w-4.5 h-4.5", isIncome ? "text-emerald-600" : "text-red-500")} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{tx.label}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                            {tx.date ? new Date(tx.date).toLocaleDateString() : 'No date'}
                          </span>
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                            isIncome ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"
                          )}>
                            {sourceLabels[tx.source] || tx.source}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={cn("font-display font-black text-lg whitespace-nowrap", isIncome ? "text-emerald-600" : "text-red-500")}>
                      {isIncome ? '+' : '-'}${Number(tx.amount).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Quick Links */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <a href="/expenses" className="block">
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm hover:shadow-md transition-shadow flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-black text-foreground">Manage Expenses</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Add & track costs</p>
              </div>
            </div>
          </a>
          <a href="/cash-flow" className="block">
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm hover:shadow-md transition-shadow flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-black text-foreground">Cash Flow</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Visual breakdowns</p>
              </div>
            </div>
          </a>
          <a href="/ai-insights" className="block">
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm hover:shadow-md transition-shadow flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-black text-foreground">Ask AI</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Financial insights</p>
              </div>
            </div>
          </a>
        </section>
      </div>
    </AppLayout>
  );
}
