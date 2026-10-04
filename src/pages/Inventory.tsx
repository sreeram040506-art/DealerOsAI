import AppLayout from '@/components/AppLayout';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/context/auth-hooks';
import { Vehicle } from '@/types/inventory';
import { cn } from '@/lib/utils';
// Consolidated icon imports — avoids duplicate module references
import { Search, Plus, ChevronRight, Pencil, Trash2, AlertTriangle, FileText, ShoppingCart, LayoutGrid, List, Receipt, Download, ArrowUpDown, Kanban } from 'lucide-react';
import { useState, useMemo, useDeferredValue } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AddVehicleDialog from '@/components/AddVehicleDialog';
import QueryErrorState from '@/components/QueryErrorState';
import VehicleDetailDialog from '@/components/VehicleDetailDialog';
import DocumentViewerDialog from '@/components/DocumentViewerDialog';
import VinDecoderDialog from '@/components/VinDecoderDialog';
import ReconKanbanBoard from '@/components/ReconKanbanBoard';
import { apiUrl, downloadFile } from '@/lib/api';
import AgingBadge from '@/components/AgingBadge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { agingBand, vehicleName } from '@/lib/vehicleAging';
import { toast } from '@/components/ui/toast-utils';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

const SORT_LABELS = {
  newest: 'Newest purchase',
  oldest: 'Oldest purchase',
  status: 'Status',
} as const;

const formatDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const statusStyles: Record<string, string> = {
  Available: 'bg-primary/10 text-primary border-primary/20',
  Reserved: 'bg-warning/10 text-warning border-warning/20',
  Sold: 'bg-foreground/10 text-foreground border-foreground/20',
  Returned: 'bg-destructive/10 text-destructive border-destructive/20',
};

export default function Inventory() {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const { vehicles, isLoading, isError, deleteVehicle, updateVehicle } = useInventory();
  const { token, user } = useAuth();
  const [vinDecoderOpen, setVinDecoderOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<{ base64: string; name: string; type: string } | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'board'>('list');
  const [sortBy, setSortBy] = useState<keyof typeof SORT_LABELS>('newest');
  // Purchase-date range (either end optional).
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const isStaff = user?.role === 'STAFF';

  // useDeferredValue keeps the search input responsive while filtering is deferred
  const deferredSearch = useDeferredValue(search);

  // useMemo prevents recalculating the filter on unrelated state changes
  // (e.g., opening a dialog, changing view mode)
  const filtered = useMemo(() => {
    let result = vehicles;
    if (deferredSearch) {
      const term = deferredSearch.toLowerCase();
      result = result.filter(v =>
        `${v.stockNumber || ''} ${v.year} ${v.make} ${v.model} ${v.vin} ${v.status}`.toLowerCase().includes(term)
      );
    }

    // Date range applies to the purchase date (when the car came onto the lot).
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;
    if (from !== null || to !== null) {
      result = result.filter(v => {
        const t = new Date(v.purchaseDate).getTime();
        if (Number.isNaN(t)) return false;
        return (from === null || t >= from) && (to === null || t <= to);
      });
    }
    
    const purchased = (v: Vehicle) => new Date(v.purchaseDate || v.createdAt || 0).getTime();
    return [...result].sort((a, b) => {
      if (sortBy === 'status') {
        const order: Record<string, number> = { 'Available': 0, 'Reserved': 1, 'Returned': 2, 'Sold': 3 };
        const orderA = order[a.status] ?? 99;
        const orderB = order[b.status] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
      }
      return sortBy === 'oldest' ? purchased(a) - purchased(b) : purchased(b) - purchased(a);
    });
  }, [vehicles, deferredSearch, sortBy, fromDate, toDate]);

  const rangeLabel = fromDate && toDate ? `${formatDay(fromDate)} – ${formatDay(toDate)}`
    : fromDate ? `from ${formatDay(fromDate)}`
    : toDate ? `until ${formatDay(toDate)}` : '';

  // Aging counts only cover cars still for sale.
  const unsold = vehicles.filter(v => v.status !== 'Sold');
  const agingCounts = {
    '30': unsold.filter(v => agingBand(v.daysInInventory ?? 0) === '30').length,
    '60': unsold.filter(v => agingBand(v.daysInInventory ?? 0) === '60').length,
    '90': unsold.filter(v => agingBand(v.daysInInventory ?? 0) === '90').length,
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-muted-foreground">Loading inventory...</div>
      </AppLayout>
    );
  }
  if (isError) {
    return (
      <AppLayout>
        <QueryErrorState
          title="Could not load inventory"
          description="The inventory API request failed, so the page is not showing fallback zero values."
        />
      </AppLayout>
    );
  }

  const handleViewDocument = async (vehicle: Vehicle, type: 'report' | 'source' | 'bill_of_sale') => {
    if (!token) return;
    try {
      const resp = await fetch(apiUrl(`/vehicles/${vehicle.id}/data`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error('Failed to fetch document');
      const data = await resp.json();
      
      let base64 = '';
      let label = '';
      
      if (type === 'report') {
        base64 = data.documentBase64;
        label = 'Used Vehicle Record';
      } else if (type === 'source') {
        base64 = data.sourceDocumentBase64;
        label = 'Original Source';
      } else if (type === 'bill_of_sale') {
        base64 = data.billOfSaleBase64;
        label = 'Bill of Sale';
      }

      if (base64) {
        setViewerDoc({ 
          base64, 
          name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          type: label
        });
        setViewerOpen(true);
      } else {
        toast.error(`No ${label} available for this vehicle.`);
      }
    } catch (e) {
      toast.error('Error loading document.');
    }
  };

  const handleDownloadDocument = (vehicle: Vehicle, type: 'report' | 'source' | 'bill_of_sale' = 'report') => {
    if (!token) return;
    let typeParam = '';
    if (type === 'source') typeParam = '&type=source';
    else if (type === 'bill_of_sale') typeParam = '&type=bill_of_sale';
    
    // Using a different endpoint for direct vehicle download if available, 
    // or leveraging the registry endpoint if that's how the backend is structured.
    // Assuming /vehicles/:id/download exists based on naming conventions
    toast.success(`Downloading ${type.replace('_', ' ')} for ${vehicle.make} ${vehicle.model}...`);
    downloadFile(`/vehicles/${vehicle.id}/document?${typeParam.slice(1)}`, token).catch((err) => toast.error(err.message));
  };



  return (
    <AppLayout>
      <div className="space-y-5 page-enter">
        {/* Header & Search */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">Inventory</h1>
              <p className="text-muted-foreground text-sm font-medium mt-1">
                <span className="text-primary font-bold">{vehicles.length}</span> total vehicles <span className="text-border mx-2">|</span> <span className="text-primary font-bold">{vehicles.filter(v => v.status === 'Available').length}</span> ready for sale
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex gap-2 h-9 px-3 rounded-xl border-border/50 font-medium text-sm text-foreground bg-card shadow-sm hover:bg-muted/50"
                  >
                    <ArrowUpDown className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    Sort: {SORT_LABELS[sortBy]}
                    {(fromDate || toDate) && <span className="text-primary">· {rangeLabel}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sort by</p>
                    {(Object.keys(SORT_LABELS) as (keyof typeof SORT_LABELS)[]).map((key) => (
                      <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="inventory-sort" checked={sortBy === key} onChange={() => setSortBy(key)} />
                        {SORT_LABELS[key]}
                      </label>
                    ))}
                  </div>
                  <div className="space-y-1.5 border-t border-border pt-3" role="group" aria-label="Purchase date range">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Purchased</p>
                    <div className="grid grid-cols-[2.5rem_1fr] items-center gap-2 text-sm">
                      <span className="text-muted-foreground">From</span>
                      <Input type="date" aria-label="Purchased from" value={fromDate} max={toDate || undefined}
                        onChange={(e) => setFromDate(e.target.value)} className="h-9" />
                      <span className="text-muted-foreground">To</span>
                      <Input type="date" aria-label="Purchased to" value={toDate} min={fromDate || undefined}
                        onChange={(e) => setToDate(e.target.value)} className="h-9" />
                    </div>
                    {(fromDate || toDate) && (
                      <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => { setFromDate(''); setToDate(''); }}>
                        Clear dates
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <div className="flex bg-muted p-1 rounded-xl border border-border/50 mr-2">
                <button 
                  onClick={() => setViewMode('list')}
                  className={cn("p-2 rounded-lg transition-all", viewMode === 'list' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setViewMode('grid')}
                  className={cn("p-2 rounded-lg transition-all", viewMode === 'grid' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setViewMode('board')}
                  className={cn("p-2 rounded-lg transition-all", viewMode === 'board' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  title="Recon Board"
                >
                  <Kanban className="w-4 h-4" />
                </button>
              </div>
              <Button 
                variant="secondary"
                onClick={() => setVinDecoderOpen(true)} 
                className="gap-2 h-11 px-4 rounded-xl text-sm font-bold shadow-sm transition-all bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                <Search className="w-4 h-4" /> VIN Lookup
              </Button>
              <Button 
                onClick={() => setDialogOpen(true)} 
                className="gap-2 h-11 px-6 rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
              >
                <Plus className="w-5 h-5" /> Add New Vehicle
              </Button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative w-full max-w-xl group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search by stock #, year, make, model, VIN or status..."
                className="pl-12 h-12 bg-card border-border shadow-sm rounded-2xl text-base focus-visible:ring-primary/20 focus-visible:border-primary transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {(fromDate || toDate || search) && (
              <span className="text-xs text-muted-foreground">{filtered.length} of {vehicles.length} vehicles</span>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 md:mx-0 md:px-0 scrollbar-hide">
          {!isStaff && (
            <>
              <div className="stat-card min-w-[160px] md:min-w-0 flex-shrink-0 py-3 px-4">
                <p className="text-[11px] text-muted-foreground font-medium">Total Investment</p>
                <p className="text-lg font-semibold text-foreground mt-0.5 tabular-nums">${vehicles.filter(v => v.status !== 'Sold').reduce((s, v) => s + ((v.totalPurchaseCost || v.purchase?.totalPurchaseCost || 0)) + ((v.repairCost || v.repairs?.reduce((s,r)=>s+(r.partsCost||0)+(r.laborCost||0),0) || 0)), 0).toLocaleString()}</p>
              </div>
              <div className="stat-card min-w-[160px] md:min-w-0 flex-shrink-0 py-3 px-4">
                <p className="text-[11px] text-muted-foreground font-medium">Avg Purchase</p>
                <p className="text-lg font-semibold text-foreground mt-0.5 tabular-nums">${vehicles.length > 0 ? Math.round(vehicles.reduce((s, v) => s + (v.purchasePrice || 0), 0) / vehicles.length).toLocaleString() : 0}</p>
              </div>
            </>
          )}
          <div className="stat-card min-w-[120px] md:min-w-0 flex-shrink-0 py-3 px-4">
            <p className="text-[11px] text-muted-foreground font-medium">Available</p>
            <p className="text-lg font-semibold text-primary mt-0.5">{vehicles.filter(v => v.status === 'Available').length}</p>
          </div>
          <div className="stat-card min-w-[100px] md:min-w-0 flex-shrink-0 py-3 px-4">
            <p className="text-[11px] text-green-700 dark:text-green-400 font-medium">30–59 days</p>
            <p className="text-lg font-semibold text-green-700 dark:text-green-400 mt-0.5">{agingCounts['30']}</p>
          </div>
          <div className="stat-card min-w-[100px] md:min-w-0 flex-shrink-0 py-3 px-4">
            <p className="text-[11px] text-warning font-medium">60–89 days</p>
            <p className="text-lg font-semibold text-warning mt-0.5">{agingCounts['60']}</p>
          </div>
          <div className="stat-card min-w-[100px] md:min-w-0 flex-shrink-0 py-3 px-4">
            <p className="text-[11px] text-destructive font-medium">90+ days</p>
            <p className="text-lg font-semibold text-destructive mt-0.5">{agingCounts['90']}</p>
          </div>
        </div>

        {/* Mobile View: Cards - Premium Design */}
        <div className="grid grid-cols-1 gap-4 md:hidden pb-6">
          {viewMode === 'board' ? (
            <ReconKanbanBoard 
              vehicles={filtered} 
              updateVehicle={updateVehicle} 
              onSelectVehicle={setSelectedVehicle} 
            />
          ) : filtered.length > 0 ? (
            filtered.map((vehicle) => (
              <div 
                key={vehicle.id} 
                onClick={() => setSelectedVehicle(vehicle)}
                className="relative p-4 rounded-2xl bg-card/60 backdrop-blur-md border border-border shadow-lg shadow-black/5 active:scale-[0.98] transition-all duration-300 cursor-pointer overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="relative z-10 flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-lg text-foreground leading-tight tracking-tight">{vehicleName(vehicle)}</h3>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {vehicle.stockNumber && <span className="font-semibold text-foreground">#{vehicle.stockNumber} · </span>}{vehicle.vin}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(vehicle.hasDocument || vehicle.hasSourceDocument) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button 
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30 shadow-sm active:scale-95 transition-transform"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white border-border min-w-[200px]">
                          <div className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/50 mb-1">Preview Documents</div>
                          {vehicle.hasDocument && (
                            <DropdownMenuItem onClick={() => handleViewDocument(vehicle, 'report')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                              <FileText className="w-3.5 h-3.5 mr-2" /> Used Vehicle Record
                            </DropdownMenuItem>
                          )}
                          {vehicle.hasSourceDocument && (
                            <DropdownMenuItem onClick={() => handleViewDocument(vehicle, 'source')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                              <Receipt className="w-3.5 h-3.5 mr-2" /> Original Source
                            </DropdownMenuItem>
                          )}
                          {vehicle.hasBillOfSale && (
                            <DropdownMenuItem onClick={() => handleViewDocument(vehicle, 'bill_of_sale')} className="text-[10px] font-black uppercase py-2 text-foreground cursor-pointer hover:bg-muted/50">
                              <ShoppingCart className="w-3.5 h-3.5 mr-2" /> Bill of Sale
                            </DropdownMenuItem>
                          )}
                          
                          <div className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b border-t border-border/50 my-1">Download Files</div>
                          {vehicle.hasDocument && (
                            <DropdownMenuItem onClick={() => handleDownloadDocument(vehicle, 'report')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                              <Download className="w-3.5 h-3.5 mr-2 text-primary" /> Download Record
                            </DropdownMenuItem>
                          )}
                          {vehicle.hasSourceDocument && (
                            <DropdownMenuItem onClick={() => handleDownloadDocument(vehicle, 'source')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                              <Download className="w-3.5 h-3.5 mr-2 text-primary" /> Download Source
                            </DropdownMenuItem>
                          )}
                          {vehicle.hasBillOfSale && (
                            <DropdownMenuItem onClick={() => handleDownloadDocument(vehicle, 'bill_of_sale')} className="text-[10px] font-black uppercase py-2 text-foreground cursor-pointer hover:bg-muted/50">
                              <Download className="w-3.5 h-3.5 mr-2" /> Download Bill of Sale
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border shadow-sm", statusStyles[vehicle.status])}>
                      {vehicle.status}
                    </span>
                  </div>
                </div>
                
                <div className="relative z-10 grid grid-cols-2 gap-4 py-3 border-y border-border/50 my-3 bg-muted/10 rounded-xl px-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Miles</p>
                    <p className="text-sm font-bold text-foreground">{vehicle.mileage.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">On lot</p>
                    <AgingBadge days={vehicle.daysInInventory ?? 0} sold={vehicle.status === 'Sold'} />
                  </div>
                </div>

                {!isStaff && (
                  <div className="relative z-10 flex justify-between items-center mt-1">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Total Investment</p>
                      <p className="text-xl font-bold text-primary tabular-nums">${(((vehicle.totalPurchaseCost || vehicle.purchase?.totalPurchaseCost || 0)) + ((vehicle.repairCost || vehicle.repairs?.reduce((s,r)=>s+(r.partsCost||0)+(r.laborCost||0),0) || 0))).toLocaleString()}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <ChevronRight className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="py-16 text-center bg-card/40 rounded-2xl border border-dashed border-border">
              <p className="text-muted-foreground text-sm font-medium">No vehicles match your search.</p>
            </div>
          )}
        </div>

        {/* Desktop View: Table or Grid */}
        <div className="hidden md:block">
          {viewMode === 'list' ? (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full" role="table" aria-label="Vehicle inventory">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Stock #</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Vehicle</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">VIN</th>
                      {!isStaff && (
                        <>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Purchase</th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Cost</th>
                        </>
                      )}
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">On lot</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((vehicle) => (
                      <tr 
                        key={vehicle.id} 
                        onClick={() => setSelectedVehicle(vehicle)}
                        className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer group"
                      >
                        <td className="px-4 py-3 text-sm font-mono font-semibold text-foreground whitespace-nowrap">{vehicle.stockNumber || '—'}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground text-sm">{vehicleName(vehicle)}</p>
                          <p className="text-[11px] text-muted-foreground">{vehicle.color} · {vehicle.mileage.toLocaleString()} mi</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{vehicle.vin.slice(-8)}</td>
                        {!isStaff && (
                          <>
                            <td className="px-4 py-3 text-sm font-medium text-foreground tabular-nums">${vehicle.purchasePrice.toLocaleString()}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-primary tabular-nums">${(((vehicle.totalPurchaseCost || vehicle.purchase?.totalPurchaseCost || 0)) + ((vehicle.repairCost || vehicle.repairs?.reduce((s,r)=>s+(r.partsCost||0)+(r.laborCost||0),0) || 0))).toLocaleString()}</td>
                          </>
                        )}
                        <td className="px-4 py-3">
                          <AgingBadge days={vehicle.daysInInventory ?? 0} sold={vehicle.status === 'Sold'} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold border", statusStyles[vehicle.status])}>
                              {vehicle.status}
                            </span>
                            {(vehicle.hasDocument || vehicle.hasSourceDocument || vehicle.hasBillOfSale) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 w-7 p-0 text-primary/60 hover:text-primary hover:bg-primary/10"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-white border-border min-w-[200px]">
                                    <div className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/50 mb-1">Preview Documents</div>
                                    {vehicle.hasDocument && (
                                      <DropdownMenuItem onClick={() => handleViewDocument(vehicle, 'report')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                                        <FileText className="w-3.5 h-3.5 mr-2" /> Used Vehicle Record
                                      </DropdownMenuItem>
                                    )}
                                    {vehicle.hasSourceDocument && (
                                      <DropdownMenuItem onClick={() => handleViewDocument(vehicle, 'source')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                                        <Receipt className="w-3.5 h-3.5 mr-2" /> Original Source
                                      </DropdownMenuItem>
                                    )}
                                    {vehicle.hasBillOfSale && (
                                      <DropdownMenuItem onClick={() => handleViewDocument(vehicle, 'bill_of_sale')} className="text-[10px] font-black uppercase py-2 text-foreground cursor-pointer hover:bg-muted/50">
                                        <ShoppingCart className="w-3.5 h-3.5 mr-2" /> Bill of Sale
                                      </DropdownMenuItem>
                                    )}
                                    
                                    <div className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b border-t border-border/50 my-1">Download Files</div>
                                    {vehicle.hasDocument && (
                                      <DropdownMenuItem onClick={() => handleDownloadDocument(vehicle, 'report')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                                        <Download className="w-3.5 h-3.5 mr-2 text-primary" /> Download Record
                                      </DropdownMenuItem>
                                    )}
                                    {vehicle.hasSourceDocument && (
                                      <DropdownMenuItem onClick={() => handleDownloadDocument(vehicle, 'source')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                                        <Download className="w-3.5 h-3.5 mr-2 text-primary" /> Download Source
                                      </DropdownMenuItem>
                                    )}
                                    {vehicle.hasBillOfSale && (
                                      <DropdownMenuItem onClick={() => handleDownloadDocument(vehicle, 'bill_of_sale')} className="text-[10px] font-black uppercase py-2 text-foreground cursor-pointer hover:bg-muted/50">
                                        <Download className="w-3.5 h-3.5 mr-2" /> Download Bill of Sale
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedVehicle(vehicle)}>
                               <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 w-7 p-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setVehicleToDelete(vehicle)}
                            >
                               <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map((vehicle) => (
                <div 
                  key={vehicle.id}
                  onClick={() => setSelectedVehicle(vehicle)}
                  className="group relative flex flex-col bg-card/60 backdrop-blur-xl border border-border/50 rounded-3xl overflow-hidden cursor-pointer hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500 hover:-translate-y-2"
                >
                  {/* Vehicle "Cover" Image/Gradient */}
                  <div className="relative h-32 overflow-hidden bg-gradient-to-br from-primary/20 via-primary/5 to-card">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent)]" />
                    <div className="absolute bottom-3 left-4">
                       <span className={cn("px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border backdrop-blur-md shadow-sm", statusStyles[vehicle.status])}>
                         {vehicle.status}
                       </span>
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-display font-black text-lg text-foreground tracking-tight group-hover:text-primary transition-colors leading-tight">
                          {vehicleName(vehicle)}
                        </h3>
                        {vehicle.stockNumber && <p className="text-muted-foreground text-xs font-mono font-semibold">Stock #{vehicle.stockNumber}</p>}
                      </div>
                      <div className="p-2 bg-muted/50 rounded-xl group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-5 py-3 border-y border-border/30">
                      <div>
                        <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest mb-1">Mileage</p>
                        <p className="text-xs font-bold text-foreground tabular-nums">{vehicle.mileage.toLocaleString()} mi</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest mb-1">On lot</p>
                        <AgingBadge days={vehicle.daysInInventory ?? 0} sold={vehicle.status === 'Sold'} />
                      </div>
                    </div>

                    {!isStaff && (
                      <div className="mt-auto">
                        <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest mb-1">Total Investment</p>
                        <p className="text-2xl font-black text-primary tabular-nums tracking-tighter">
                          ${(((vehicle.totalPurchaseCost || vehicle.purchase?.totalPurchaseCost || 0)) + ((vehicle.repairCost || vehicle.repairs?.reduce((s,r)=>s+(r.partsCost||0)+(r.laborCost||0),0) || 0))).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ReconKanbanBoard 
              vehicles={filtered} 
              updateVehicle={updateVehicle} 
              onSelectVehicle={setSelectedVehicle} 
            />
          )}

          <AlertDialog open={!!vehicleToDelete} onOpenChange={(open) => !open && setVehicleToDelete(null)}>
            <AlertDialogContent className="bg-card border-border">
              <AlertDialogHeader>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                  </div>
                  <AlertDialogTitle className="text-lg font-bold text-foreground">Delete Vehicle</AlertDialogTitle>
                </div>
                <AlertDialogDescription className="text-muted-foreground text-sm">
                  Are you sure you want to delete <span className="text-foreground font-medium">{vehicleToDelete?.year} {vehicleToDelete?.make} {vehicleToDelete?.model}</span>? 
                  This will permanently remove all associated records. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-4 gap-2">
                <AlertDialogCancel className="h-9 text-sm">Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  className="bg-destructive text-foreground hover:bg-destructive/90 h-9 text-sm"
                  onClick={async () => {
                    if (vehicleToDelete) {
                      await deleteVehicle(vehicleToDelete.id);
                      setVehicleToDelete(null);
                    }
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <AddVehicleDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen} 
        onViewExisting={(id) => {
          setDialogOpen(false);
          const existing = vehicles.find(v => v.id === id);
          if (existing) {
            setSelectedVehicle(existing);
          }
        }}
      />
      <VehicleDetailDialog 
        vehicle={selectedVehicle} 
        open={!!selectedVehicle} 
        onOpenChange={(open) => !open && setSelectedVehicle(null)} 
      />
      <DocumentViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        documentBase64={viewerDoc?.base64 || null}
        vehicleName={viewerDoc?.name || ''}
        documentType={viewerDoc?.type || ''}
      />
      <VinDecoderDialog 
        open={vinDecoderOpen} 
        onOpenChange={setVinDecoderOpen} 
      />
    </AppLayout>
  );
}
