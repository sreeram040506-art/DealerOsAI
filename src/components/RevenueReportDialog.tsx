import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileDown, DollarSign } from 'lucide-react';
import { Sale } from '@/types/inventory';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { vehicleName } from '@/lib/vehicleAging';

const money = (n: number | null | undefined) => `$${(Number(n) || 0).toLocaleString()}`;
// Missing parts are skipped so a sale whose vehicle lacks a year never prints "undefined".
const saleVehicleLabel = (s: Sale) => (s.vehicle ? vehicleName(s.vehicle) : '') || 'Unknown vehicle';

interface RevenueReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sales: Sale[];
}

export default function RevenueReportDialog({ open, onOpenChange, sales }: RevenueReportDialogProps) {
  const [filter, setFilter] = useState<'monthly' | 'yearly' | 'all'>('monthly');

  // Aggregation Logic
  const getAggregatedData = () => {
    // Keyed by a sortable value ("2026-03") with a separate display label ("Mar 2026"):
    // sorting the labels as text put April before March and August before January.
    const map = new Map<string, { period: string, count: number, revenue: number, profit: number }>();
    
    sales.forEach(s => {
      const date = new Date(s.saleDate);
      if (Number.isNaN(date.getTime())) return;
      let key = 'all';
      let period = 'All Time';
      
      if (filter === 'monthly') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        period = date.toLocaleString('default', { month: 'short', year: 'numeric' });
      } else if (filter === 'yearly') {
        key = String(date.getFullYear());
        period = key;
      }
      
      const existing = map.get(key) || { period, count: 0, revenue: 0, profit: 0 };
      map.set(key, { 
        period,
        count: existing.count + 1, 
        revenue: existing.revenue + (Number(s.salePrice) || 0), 
        profit: existing.profit + (Number(s.profit) || 0) 
      });
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, data]) => data);
  };

  const aggregatedData = getAggregatedData();
  const totalRev = aggregatedData.reduce((s, d) => s + d.revenue, 0);
  const totalProf = aggregatedData.reduce((s, d) => s + d.profit, 0);

  const generatePDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.text("Total Revenue Report", 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.text(`Filter View: ${filter.toUpperCase()}`, 14, 36);

    const tableColumn = ["Period", "Units Sold", "Gross Revenue", "Net Profit"];
    const tableRows = aggregatedData.map(data => [
      data.period,
      data.count.toString(),
      money(data.revenue),
      money(data.profit)
    ]);

    // Add totals row
    tableRows.push([
      "TOTAL",
      aggregatedData.reduce((n, d) => n + d.count, 0).toString(),
      money(totalRev),
      money(totalProf)
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 45,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] }, // Profit green
      footStyles: { fillColor: [30, 30, 35] },
    });

    // Vehicle breakdown section
    const finalY = (doc as any).lastAutoTable.finalY || 45;
    doc.setFontSize(16);
    doc.text("Recent Transactions Details", 14, finalY + 14);

    const detailColumns = ["Date", "Vehicle", "Price", "Profit", "Buyer"];
    const detailRows = [...sales]
      .sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime())
      .slice(0, 50) // limit to 50 for brief
      .map(s => [
        new Date(s.saleDate).toLocaleDateString(),
        saleVehicleLabel(s),
        money(s.salePrice),
        money(s.profit),
        s.customerName || '—'
      ]);

    autoTable(doc, {
      head: [detailColumns],
      body: detailRows,
      startY: finalY + 20,
      theme: 'striped',
      headStyles: { fillColor: [40, 40, 45] }
    });

    doc.save(`Revenue_Report_${filter}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] bg-card border-border text-foreground">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
              <DollarSign className="w-6 h-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-display">Revenue Analysis</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Breakdown of your historical gross revenue and net profit.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <div className="flex justify-between items-center bg-muted/50 p-3 rounded-lg border border-border">
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-widest text-[10px]">Grouping Filter</span>
            <Select value={filter} onValueChange={(val: any) => setFilter(val)}>
              <SelectTrigger className="w-[180px] bg-card border-border h-8 text-xs">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent className="bg-muted border-border text-foreground">
                <SelectItem value="all">All Time Aggregate</SelectItem>
                <SelectItem value="yearly">Yearly Breakdown</SelectItem>
                <SelectItem value="monthly">Monthly Breakdown</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
            {aggregatedData.map((item, idx) => (
              <div key={idx} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/50 transition-colors gap-4">
                <div className="flex-1">
                  <p className="font-bold text-foreground uppercase tracking-wider text-sm">{item.period}</p>
                  <p className="text-xs text-muted-foreground">{item.count} unit{item.count !== 1 ? 's' : ''} sold</p>
                </div>
                <div className="flex gap-4 md:gap-8 items-center text-right">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Revenue</p>
                    <p className="font-display font-medium text-foreground">{money(item.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-primary uppercase font-bold tracking-widest">Profit</p>
                    <p className="font-display font-bold text-primary">{money(item.profit)}</p>
                  </div>
                </div>
              </div>
            ))}
            
            {aggregatedData.length === 0 && (
              <div className="text-center p-8 text-muted-foreground text-sm">No sales data found to generate revenue report.</div>
            )}
          </div>
          
        </div>

        <DialogFooter className="sm:justify-between items-center border-t border-border/50 pt-4 mt-2">
          <div className="flex flex-col text-sm">
            <span className="text-muted-foreground text-xs uppercase tracking-widest font-bold">Total Gross</span>
            <span className="text-xl font-display font-bold">{money(totalRev)}</span>
          </div>
          <Button onClick={generatePDF} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide">
            <FileDown className="w-4 h-4 mr-2" />
            Download PDF Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
