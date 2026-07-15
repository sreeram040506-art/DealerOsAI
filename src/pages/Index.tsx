import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
import { useDashboard } from '@/hooks/useDashboard';
import { useAuth } from '@/context/auth-hooks';
import { Car, ShoppingCart, DollarSign, TrendingUp, Package, Megaphone, Users, CalendarDays, Sparkles, Clock, AlertTriangle, ArrowLeftRight, FileText, Receipt, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import QueryErrorState from '@/components/QueryErrorState';
import { lazy, Suspense, useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import RevenueReportDialog from '@/components/RevenueReportDialog';
import SwapNetworkDialog from '@/components/SwapNetworkDialog';
import VehicleDetailDialog from '@/components/VehicleDetailDialog';
import DocumentViewerDialog from '@/components/DocumentViewerDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { apiUrl, apiFetch, handleApiResponse } from '@/lib/api';
import { toast } from '@/components/ui/toast-utils';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

// Lazy load charts — recharts is ~200KB and only shown for non-staff users
const ChartsSection = lazy(() => import('./ChartsSection'));

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444'];

export default function Dashboard() {
  const { data, isLoading, isError } = useDashboard();
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [swapNetworkOpen, setSwapNetworkOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<{ base64: string; name: string; type: string } | null>(null);
  const { user, token } = useAuth();
  const navigate = useNavigate();
  
  const isAdmin = user?.role === 'ADMIN';
  const isStaff = user?.role === 'STAFF';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const { data: insightsData } = useQuery({
    queryKey: ["ai-insights-dashboard"],
    enabled: Boolean(token && !isSuperAdmin),
    queryFn: async () => {
      const res = await apiFetch("/ai-insights", token);
      return handleApiResponse<{ agingRecommendations: Record<string, string> }>(res, logout);
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (isSuperAdmin) {
      navigate('/super-admin', { replace: true });
    }
  }, [isSuperAdmin, navigate]);

  const handleViewDocument = async (vehicle: any, type: 'report' | 'source' | 'bill_of_sale') => {
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

  const handleDownloadDocument = (vehicle: any, type: 'report' | 'source' | 'bill_of_sale' = 'report') => {
    if (!token) return;
    let typeParam = '';
    if (type === 'source') typeParam = '&type=source';
    else if (type === 'bill_of_sale') typeParam = '&type=bill_of_sale';
    
    const downloadUrl = apiUrl(`/vehicles/${vehicle.id}/document?token=${encodeURIComponent(token)}${typeParam}`);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);
    setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe); }, 60000);
    toast.success(`Downloading ${type.replace('_', ' ')} for ${vehicle.make} ${vehicle.model}...`);
  };

  // Map data with fallbacks
  const vehicles = data?.vehicles || [];
  const sales = data?.sales || [];
  const ads = data?.advertising || [];
  const expenses = data?.expenses || [];
  const team = data?.team || [];

  // Memoize all derived computations
  const inventoryStatusData = useMemo(() => [
    { name: 'Available', value: vehicles.filter(v => v.status === 'Available').length },
    { name: 'Reserved', value: vehicles.filter(v => v.status === 'Reserved').length },
    { name: 'Sold', value: vehicles.filter(v => v.status === 'Sold').length },
  ], [vehicles]);

  const profitData = useMemo(() => sales.slice(0, 5).map(s => ({
    vehicle: s.vehicle ? `${s.vehicle.make} ${s.vehicle.model}` : 'Unknown',
    profit: s.profit,
  })), [sales]);

  const { totalRevenue, totalProfit, totalAdSpend, totalExpenses, inventoryValue } = useMemo(() => ({
    totalRevenue: sales.reduce((sum, s) => sum + s.salePrice, 0),
    totalProfit: sales.reduce((sum, s) => sum + s.profit, 0),
    totalAdSpend: ads.reduce((sum, a) => sum + a.amountSpent, 0),
    totalExpenses: expenses.reduce((sum, e) => sum + e.amount, 0),
    inventoryValue: vehicles.filter(v => v.status !== 'Sold').reduce((sum, v) => sum + ((v.totalPurchaseCost || v.purchase?.totalPurchaseCost || 0)) + ((v.repairCost || v.repairs?.reduce((s,r)=>s+(r.partsCost||0)+(r.laborCost||0),0) || 0)), 0),
  }), [sales, ads, expenses, vehicles]);
  
  const salesHistory = useMemo(() => sales.slice(0, 7).reverse().map(s => ({
    date: new Date(s.saleDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    revenue: s.salePrice,
    profit: s.profit
  })), [sales]);

  const agingVehicles = useMemo(() => {
    return vehicles
      .filter(v => v.status !== 'Sold' && v.status !== 'Returned')
      .map(v => {
        const days = v.daysInInventory || Math.max(0, Math.floor((Date.now() - new Date(v.purchaseDate).getTime()) / (1000 * 60 * 60 * 24)));
        return { ...v, calculatedDays: days };
      })
      .filter(v => v.calculatedDays >= 45)
      .sort((a, b) => b.calculatedDays - a.calculatedDays);
  }, [vehicles]);

  if (isSuperAdmin) return null;

  if (isError) {
    return (
      <AppLayout>
        <QueryErrorState
          title="Could not load dashboard data"
          description="The unified dashboard query failed, likely due to a network issue or session timeout."
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 page-enter">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground text-sm font-medium mt-1">Overview of your dealership performance</p>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <div className="hidden sm:flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20 shadow-sm">
                <div className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </div>
                <span className="text-[10px] text-primary font-bold uppercase tracking-wider">Live Sync</span>
              </div>
            )}
            <button 
              onClick={() => window.location.href = '/inventory'}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
            >
              <Car className="w-4 h-4" aria-hidden="true" />
              Manage Inventory
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3" role="region" aria-label="Key metrics">
          <StatCard label="Inventory" value={isLoading ? "..." : String(vehicles.length)} icon={Car} />
          <StatCard label="Units Sold" value={isLoading ? "..." : String(sales.length)} icon={ShoppingCart} />
          {!isStaff && (
            <>
              <StatCard label="Inventory Value" value={isLoading ? "..." : `$${inventoryValue.toLocaleString()}`} icon={Package} />
              <StatCard 
                label="Total Revenue" 
                value={isLoading ? "..." : `$${totalRevenue.toLocaleString()}`} 
                icon={DollarSign} 
                iconClassName="bg-foreground/15 text-foreground" 
                onClick={() => setReportModalOpen(true)}
              />
            </>
          )}
          {isAdmin && (
            <>
              <StatCard label="Ad Spend" value={isLoading ? "..." : `$${totalAdSpend.toLocaleString()}`} icon={Megaphone} iconClassName="bg-warning/15 text-warning" />
              <StatCard label="Net Profit" value={isLoading ? "..." : `$${totalProfit.toLocaleString()}`} icon={TrendingUp} iconClassName="bg-primary/15 text-primary" />
            </>
          )}
          <StatCard 
            label="Attendance" 
            value="Open Log" 
            icon={CalendarDays} 
            iconClassName="bg-primary/10 text-primary border border-primary/20" 
            onClick={() => navigate('/attendance')}
            className="cursor-pointer transition-all hover:scale-105 active:scale-95"
          />
        </div>

        {/* Aging Inventory Alert System */}
        <section className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-warning animate-pulse" />
                <h2 className="text-lg font-black text-foreground tracking-tight">Aging Inventory & Holding Costs</h2>
              </div>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Vehicles sitting on lot for 45+ days incurring daily holding costs ($35/day)</p>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {!isStaff && agingVehicles.length > 0 && (
                <div className="flex items-center gap-2 bg-warning/10 border border-warning/20 px-3.5 py-1.5 rounded-xl">
                  <span className="text-[10px] font-black uppercase text-warning tracking-wider">Accumulated Cost:</span>
                  <span className="text-sm font-bold text-warning tabular-nums">
                    ${agingVehicles.reduce((sum, v) => sum + (v.calculatedDays * 35), 0).toLocaleString()}
                  </span>
                </div>
              )}
              <Button
                onClick={() => setSwapNetworkOpen(true)}
                className="rounded-xl h-10 px-4 text-xs font-bold gap-1.5 shadow-sm border-border/50 bg-card hover:bg-muted/50"
                variant="outline"
              >
                <ArrowLeftRight className="w-4 h-4 text-muted-foreground" /> Browse Partner Swaps
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-44 bg-muted/30 border border-border/40 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : agingVehicles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agingVehicles.map((vehicle) => {
                const days = vehicle.calculatedDays;
                const holdingCost = days * 35;
                
                let badgeClass = "bg-warning/10 text-warning border-warning/20";
                let badgeLabel = `Warning (${days} Days)`;
                
                if (days >= 90) {
                  badgeClass = "bg-destructive/10 text-destructive border-destructive/20";
                  badgeLabel = `Critical (${days} Days)`;
                } else if (days >= 60) {
                  badgeClass = "bg-orange-500/10 text-orange-500 border-orange-500/20";
                  badgeLabel = `High Risk (${days} Days)`;
                }

                const recommendation = insightsData?.agingRecommendations?.[vehicle.vin] || 
                  (days >= 90 
                    ? "Critical age reached. Suggest moving to auction or dropping price by 10% immediately to free up cash flow."
                    : days >= 60
                    ? "This vehicle is at 60 days. Suggest dropping price by 5% or launching a targeted Facebook ad campaign."
                    : "Suggest launching a targeted Facebook ad or offering a test-drive promotion.");

                return (
                  <div 
                    key={vehicle.id} 
                    className="p-4 rounded-xl border border-border/60 bg-card hover:border-primary/20 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer group"
                    onClick={() => setSelectedVehicle(vehicle)}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <span className={cn("px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border", badgeClass)}>
                          {badgeLabel}
                        </span>
                        <div className="flex items-center gap-2">
                          {(vehicle.hasDocument || vehicle.hasSourceDocument || vehicle.hasBillOfSale) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button 
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 shadow-sm active:scale-95 transition-transform opacity-0 group-hover:opacity-100"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-white border-border min-w-[200px]" onClick={(e) => e.stopPropagation()}>
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
                          {!isStaff && (
                            <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                              Holding: ${holdingCost.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <h3 className="font-bold text-sm text-foreground leading-tight tracking-tight">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </h3>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{vehicle.vin}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border/40 bg-muted/10 p-3 rounded-lg flex gap-2 items-start">
                      <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-[11px] font-medium text-muted-foreground leading-normal">
                        {recommendation}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 bg-muted/10 border border-dashed border-border/60 rounded-xl text-center">
              <AlertTriangle className="w-8 h-8 text-profit/70 mb-2" />
              <h3 className="font-bold text-sm text-foreground">Lot Turnover is Healthy!</h3>
              <p className="text-muted-foreground text-xs max-w-xs mt-1">
                Zero aging vehicles detected. All available inventory has been in stock for under 45 days.
              </p>
            </div>
          )}
        </section>

        {/* Charts */}
        {!isStaff && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Suspense fallback={
              <div className="lg:col-span-3 flex items-center justify-center h-72 bg-card rounded-xl border border-border/60" role="status">
                <div className="text-muted-foreground text-sm">Loading charts...</div>
              </div>
            }>
              <ChartsSection
                salesHistory={salesHistory}
                inventoryStatusData={inventoryStatusData}
                profitData={profitData}
                COLORS={COLORS}
              />
            </Suspense>
          </div>
        )}

        {/* Admin sections: Expenses + Team */}
        {isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Expenses */}
            <section className="stat-card" aria-labelledby="expenses-heading">
              <div className="flex items-center justify-between mb-4">
                <h3 id="expenses-heading" className="font-semibold text-foreground">Recent Expenses</h3>
                <span className="text-[11px] text-muted-foreground">Last 30 Days</span>
              </div>
              <div className="space-y-2">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-12 w-full animate-pulse bg-muted/50 rounded-lg" />
                  ))
                ) : expenses.length > 0 ? expenses.slice(0, 5).map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground" aria-hidden="true">
                        <DollarSign className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{exp.category}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(exp.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <span className="font-semibold text-foreground tabular-nums">${exp.amount.toLocaleString()}</span>
                  </div>
                )) : (
                  <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">No recent expenses.</div>
                )}
              </div>
            </section>

            {/* Team Performance */}
            <section className="stat-card" aria-labelledby="team-heading">
              <div className="flex items-center justify-between mb-4">
                <h3 id="team-heading" className="font-semibold text-foreground">Team Performance</h3>
                <span className="text-[11px] text-muted-foreground">Staff & Managers</span>
              </div>
              <div className="space-y-2">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-12 w-full animate-pulse bg-muted/50 rounded-lg" />
                  ))
                ) : team.length > 0 ? team.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground" aria-hidden="true">
                        <Users className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{member.name}</p>
                        <p className="text-[11px] text-muted-foreground">{member.role}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground tabular-nums">{member._count?.salesMade || 0} sales</p>
                      <p className="text-[11px] text-muted-foreground">{member._count?.vehiclesAdded || 0} added</p>
                    </div>
                  </div>
                )) : (
                  <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">No team members found.</div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
      
      <RevenueReportDialog 
        open={reportModalOpen} 
        onOpenChange={setReportModalOpen} 
        sales={sales} 
      />
      <SwapNetworkDialog
        open={swapNetworkOpen}
        onOpenChange={setSwapNetworkOpen}
        myVehicles={vehicles}
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
    </AppLayout>
  );
}
