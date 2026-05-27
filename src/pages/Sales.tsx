import AppLayout from '@/components/AppLayout';
import { useSales } from '@/hooks/useSales';
import { useInventory } from '@/hooks/useInventory';
import { cn } from '@/lib/utils';
import QueryErrorState from '@/components/QueryErrorState';
import { useState, useEffect } from 'react';
import { formatSafeDate } from '@/lib/dateUtils';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth-hooks';
import VehicleDetailDialog from '@/components/VehicleDetailDialog';
import DocumentViewerDialog from '@/components/DocumentViewerDialog';
import EditSaleDialog from '@/components/EditSaleDialog';
import { Vehicle } from '@/types/inventory';
import { FileText, Trash2, Loader2, Receipt, ShoppingCart, Download, Upload, Pencil, CreditCard, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiUrl } from '@/lib/api';
import { toast } from '@/components/ui/toast-utils';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

export default function Sales() {
  const { sales, isLoading: salesLoading, isError: salesError, deleteSale } = useSales();
  const { vehicles, isLoading: vehiclesLoading, isError: vehiclesError } = useInventory();
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<{ base64: string; name: string; type: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [saleToEdit, setSaleToEdit] = useState<any | null>(null);
  const isStaff = user?.role === 'STAFF';
  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      toast.success('Stripe Payment completed successfully! Deposit received.');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('payment') === 'cancelled') {
      toast.error('Payment checkout session was cancelled.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleProcessPayment = async (saleId: string, amount: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) return;
    setPayingId(saleId);
    try {
      const resp = await fetch(apiUrl('/payments/create-checkout-session'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ dealId: saleId, amount })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || 'Failed to create checkout session');
      
      toast.success('Redirecting to Stripe payment checkout...');
      window.location.href = data.url;
    } catch (err: any) {
      toast.error(err.message || 'Error starting checkout session.');
    } finally {
      setPayingId(null);
    }
  };

  if (salesLoading || vehiclesLoading) return <div className="p-8 text-center text-muted-foreground">Loading sales...</div>;
  if (salesError || vehiclesError) {
    return (
      <AppLayout>
        <QueryErrorState
          title="Could not load sales"
          description="At least one sales-related API request failed."
        />
      </AppLayout>
    );
  }

  const totalRevenue = sales.reduce((s, sale) => s + sale.salePrice, 0);
  const totalProfit = sales.reduce((s, sale) => s + sale.profit, 0);
  const avgProfit = sales.length > 0 ? Math.round(totalProfit / sales.length) : 0;

  const handleVehicleClick = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (vehicle) setSelectedVehicle(vehicle);
  };

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

  const handleDownloadDocument = (vehicle: Vehicle, type: 'report' | 'source' | 'sale' = 'report') => {
    if (!token) return;
    let typeParam = '';
    if (type === 'source') typeParam = '&type=source';
    else if (type === 'sale') typeParam = '&type=sale';
    
    const downloadUrl = apiUrl(`/vehicles/${vehicle.id}/document?token=${encodeURIComponent(token)}${typeParam}`);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);
    setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe); }, 60000);
    toast.success(`Downloading ${type.replace('_', ' ')} for ${vehicle.make} ${vehicle.model}...`);
  };

  const handleUploadBillOfSale = (vin?: string) => {
    const url = vin ? `/used-vehicle-forms?mode=bill&vin=${encodeURIComponent(vin)}` : '/used-vehicle-forms?mode=bill';
    navigate(url);
  };
  const handleDeleteSale = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this sale record? The vehicle will be returned to inventory as "Available".')) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteSale(id);
      toast.success('Sale deleted and vehicle reverted to Available.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete sale.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-5 page-enter">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Sales</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{sales.length} units finalized</p>
        </div>

        {/* Stats */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 md:mx-0 md:px-0 scrollbar-hide">
          <div className="stat-card min-w-[160px] md:min-w-0 flex-shrink-0 py-3 px-4">
            <p className="text-[11px] text-muted-foreground font-medium">Total Revenue</p>
            <p className="text-lg font-semibold text-foreground mt-0.5 tabular-nums">${totalRevenue.toLocaleString()}</p>
          </div>
          {!isStaff && (
            <>
              <div className="stat-card min-w-[160px] md:min-w-0 flex-shrink-0 py-3 px-4">
                <p className="text-[11px] text-muted-foreground font-medium">Total Profit</p>
                <p className="text-lg font-semibold text-primary mt-0.5 tabular-nums">${totalProfit.toLocaleString()}</p>
              </div>
              <div className="stat-card min-w-[160px] md:min-w-0 flex-shrink-0 py-3 px-4">
                <p className="text-[11px] text-foreground font-medium">Avg Profit / Unit</p>
                <p className="text-lg font-semibold text-foreground mt-0.5 tabular-nums">${avgProfit.toLocaleString()}</p>
              </div>
            </>
          )}
        </div>

        {/* Mobile View: Cards - Premium Design */}
        <div className="grid grid-cols-1 gap-4 md:hidden pb-6">
          {sales.length > 0 ? (
            sales.map((sale) => {
              const vehicle = vehicles.find(v => v.id === sale.vehicleId);
              return (
                <div 
                  key={sale.id} 
                  onClick={() => handleVehicleClick(sale.vehicleId)}
                  className="relative p-5 rounded-2xl bg-card border border-border shadow-md active:scale-[0.98] transition-all duration-300 cursor-pointer overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="relative z-10 flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-lg text-foreground leading-tight tracking-tight">
                        {vehicle ? `${vehicle.make} ${vehicle.model}` : `ID: ${sale.vehicleId.slice(-8)}`}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Sold to <span className="font-medium text-foreground">{sale.customerName}</span></p>
                    </div>
                    <div className="flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button 
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              "p-1.5 rounded-lg border shadow-sm active:scale-95 transition-transform",
                              (vehicle?.hasBillOfSale || sale.hasBillOfSale) 
                                ? "bg-primary/20 text-primary border-primary/30" 
                                : "bg-muted text-muted-foreground border-border"
                            )}
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white border-border min-w-[200px]">
                          <div className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/50 mb-1">Preview Documents</div>
                          {vehicle?.hasDocument && (
                            <DropdownMenuItem onClick={() => handleViewDocument(vehicle, 'report')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                              <FileText className="w-3.5 h-3.5 mr-2" /> Used Vehicle Record
                            </DropdownMenuItem>
                          )}
                          {vehicle?.hasSourceDocument && (
                            <DropdownMenuItem onClick={() => handleViewDocument(vehicle, 'source')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                              <Receipt className="w-3.5 h-3.5 mr-2" /> Original Source
                            </DropdownMenuItem>
                          )}
                          
                          {(vehicle?.hasBillOfSale || sale.hasBillOfSale) ? (
                            <DropdownMenuItem onClick={() => handleViewDocument(vehicle || { id: sale.vehicleId, year: 0, make: 'Vehicle', model: 'Record' } as any, 'bill_of_sale')} className="text-[10px] font-black uppercase py-2 text-foreground cursor-pointer hover:bg-muted/50">
                              <ShoppingCart className="w-3.5 h-3.5 mr-2" /> Bill of Sale
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleUploadBillOfSale(vehicle?.vin)} className="text-[10px] font-black uppercase py-2 text-muted-foreground italic cursor-pointer hover:bg-muted/50">
                              <Upload className="w-3.5 h-3.5 mr-2" /> Upload Bill of Sale
                            </DropdownMenuItem>
                          )}
                          
                          <div className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b border-t border-border/50 my-1">Download Files</div>
                          {vehicle?.hasDocument && (
                            <DropdownMenuItem onClick={() => handleDownloadDocument(vehicle, 'report')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                              <Download className="w-3.5 h-3.5 mr-2 text-primary" /> Download Record
                            </DropdownMenuItem>
                          )}
                          {vehicle?.hasSourceDocument && (
                            <DropdownMenuItem onClick={() => handleDownloadDocument(vehicle, 'source')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                              <Download className="w-3.5 h-3.5 mr-2 text-primary" /> Download Source
                            </DropdownMenuItem>
                          )}
                          {(vehicle?.hasBillOfSale || sale.hasBillOfSale) && (
                            <DropdownMenuItem onClick={() => handleDownloadDocument(vehicle || { id: sale.vehicleId, make: 'Vehicle', model: 'Record' } as any, 'sale')} className="text-[10px] font-black uppercase py-2 text-foreground cursor-pointer hover:bg-muted/50">
                              <Download className="w-3.5 h-3.5 mr-2" /> Download Bill of Sale
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {isManagerOrAdmin && (
                        <>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSaleToEdit(sale); }}
                            className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 shadow-sm active:scale-95 transition-transform"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => handleDeleteSale(sale.id, e)}
                            disabled={deletingId === sale.id}
                            className="p-1.5 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 shadow-sm active:scale-95 transition-transform disabled:opacity-50"
                          >
                            {deletingId === sale.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </>
                      )}
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border shadow-sm",
                        sale.paymentMethod === 'Cash' ? 'bg-primary/10 text-primary border-primary/20' :
                        sale.paymentMethod === 'Loan' ? 'bg-foreground/10 text-foreground border-foreground/20' :
                        'bg-muted text-muted-foreground border-border'
                      )}>
                        {sale.paymentMethod}
                      </span>
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border shadow-sm flex items-center gap-1",
                        sale.paymentStatus === 'PAID' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                        'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                      )}>
                        {sale.paymentStatus === 'PAID' ? 'Paid' : 'Pending'}
                      </span>
                      {sale.paymentStatus !== 'PAID' && (
                        <button
                          onClick={(e) => handleProcessPayment(sale.id, sale.downPayment || 500, e)}
                          disabled={payingId === sale.id}
                          className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase border border-primary/30 text-primary bg-primary/5 active:scale-95 transition-transform flex items-center gap-1"
                        >
                          {payingId === sale.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Pay Deposit'}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="relative z-10 flex items-center justify-between py-4 border-y border-border my-4 bg-muted/10 rounded-xl px-4">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Sale Date</p>
                      <p className="text-sm font-bold text-foreground">{formatSafeDate(sale.saleDate)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Sale Price</p>
                      <p className="text-sm font-bold text-foreground tabular-nums">${sale.salePrice.toLocaleString()}</p>
                    </div>
                  </div>

                  {!isStaff && (
                    <div className="relative z-10 flex justify-between items-center mt-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Completed</span>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Net Profit</p>
                        <p className={cn("text-xl font-bold tabular-nums", sale.profit >= 0 ? "text-primary" : "text-foreground")}>
                          ${sale.profit.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-16 text-center bg-card/40 rounded-2xl border border-dashed border-border">
              <p className="text-muted-foreground text-sm font-medium">No sales recorded yet.</p>
            </div>
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Vehicle</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Customer</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Price</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Payment</th>
                  {!isStaff && <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Profit</th>}
                  {isManagerOrAdmin && <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => {
                  const vehicle = vehicles.find(v => v.id === sale.vehicleId);
                  return (
                    <tr 
                      key={sale.id} 
                      onClick={() => handleVehicleClick(sale.vehicleId)}
                      className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground text-sm">{vehicle ? `${vehicle.make} ${vehicle.model}` : sale.vehicleId}</p>
                        <p className="text-[11px] text-muted-foreground">{vehicle?.year} · {vehicle?.color}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-foreground">{sale.customerName}</p>
                        <p className="text-[11px] text-muted-foreground">{sale.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{formatSafeDate(sale.saleDate)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground tabular-nums">${sale.salePrice.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-semibold border",
                            sale.paymentMethod === 'Cash' ? 'bg-primary/10 text-primary border-primary/20' :
                            sale.paymentMethod === 'Loan' ? 'bg-foreground/10 text-foreground border-foreground/20' :
                            'bg-muted text-muted-foreground border-border'
                          )}>
                            {sale.paymentMethod}
                          </span>
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1",
                            sale.paymentStatus === 'PAID' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                            'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                          )}>
                            {sale.paymentStatus === 'PAID' ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" /> Paid
                              </>
                            ) : (
                              'Pending'
                            )}
                          </span>
                          {sale.paymentStatus !== 'PAID' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => handleProcessPayment(sale.id, sale.downPayment || 500, e)}
                              disabled={payingId === sale.id}
                              className="h-7 px-2 text-[10px] font-black uppercase flex items-center gap-1 border-primary/30 text-primary hover:bg-primary/5"
                            >
                              {payingId === sale.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <>
                                  <CreditCard className="w-3 h-3" /> Pay Deposit
                                </>
                              )}
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button 
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                  "p-1 rounded-md transition-colors",
                                  (vehicle?.hasBillOfSale || sale.hasBillOfSale)
                                    ? "text-primary/60 hover:text-primary hover:bg-primary/10"
                                    : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted"
                                )}
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-white border-border min-w-[200px]">
                              <div className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/50 mb-1">Preview Documents</div>
                              {vehicle?.hasDocument && (
                                <DropdownMenuItem onClick={() => handleViewDocument(vehicle, 'report')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                                  <FileText className="w-3.5 h-3.5 mr-2" /> Used Vehicle Record
                                </DropdownMenuItem>
                              )}
                              {vehicle?.hasSourceDocument && (
                                <DropdownMenuItem onClick={() => handleViewDocument(vehicle, 'source')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                                  <Receipt className="w-3.5 h-3.5 mr-2" /> Original Source
                                </DropdownMenuItem>
                              )}
                              
                              {(vehicle?.hasBillOfSale || sale.hasBillOfSale) ? (
                                <DropdownMenuItem onClick={() => handleViewDocument(vehicle || { id: sale.vehicleId, year: 0, make: 'Vehicle', model: 'Record' } as any, 'bill_of_sale')} className="text-[10px] font-black uppercase py-2 text-foreground cursor-pointer hover:bg-muted/50">
                                  <ShoppingCart className="w-3.5 h-3.5 mr-2" /> Bill of Sale
                                </DropdownMenuItem>
                              ) : (
                                    <DropdownMenuItem onClick={() => handleUploadBillOfSale(vehicle?.vin)} className="text-[10px] font-black uppercase py-2 text-muted-foreground italic cursor-pointer hover:bg-muted/50">
                                      <Upload className="w-3.5 h-3.5 mr-2" /> Upload Bill of Sale
                                </DropdownMenuItem>
                              )}
                              
                              <div className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b border-t border-border/50 my-1">Download Files</div>
                              {vehicle?.hasDocument && (
                                <DropdownMenuItem onClick={() => handleDownloadDocument(vehicle, 'report')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                                  <Download className="w-3.5 h-3.5 mr-2 text-primary" /> Download Record
                                </DropdownMenuItem>
                              )}
                              {vehicle?.hasSourceDocument && (
                                <DropdownMenuItem onClick={() => handleDownloadDocument(vehicle, 'source')} className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50">
                                  <Download className="w-3.5 h-3.5 mr-2 text-primary" /> Download Source
                                </DropdownMenuItem>
                              )}
                              {(vehicle?.hasBillOfSale || sale.hasBillOfSale) && (
                                <DropdownMenuItem onClick={() => handleDownloadDocument(vehicle || { id: sale.vehicleId, make: 'Vehicle', model: 'Record' } as any, 'sale')} className="text-[10px] font-black uppercase py-2 text-foreground cursor-pointer hover:bg-muted/50">
                                  <Download className="w-3.5 h-3.5 mr-2" /> Download Bill of Sale
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                      {!isStaff && (
                        <td className="px-4 py-3">
                          <span className={cn("font-semibold text-sm tabular-nums", sale.profit >= 0 ? "text-primary" : "text-foreground")}>
                            ${sale.profit.toLocaleString()}
                          </span>
                        </td>
                      )}
                      {isManagerOrAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); setSaleToEdit(sale); }}
                              className="h-8 w-8 text-primary hover:bg-primary/10"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => handleDeleteSale(sale.id, e)}
                              disabled={deletingId === sale.id}
                              className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                            >
                              {deletingId === sale.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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
      <EditSaleDialog 
        sale={saleToEdit}
        open={!!saleToEdit}
        onOpenChange={(open) => !open && setSaleToEdit(null)}
        token={token}
      />
    </AppLayout>
  );
}
