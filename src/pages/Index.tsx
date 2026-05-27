import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
import { useDashboard } from '@/hooks/useDashboard';
import { useAuth } from '@/context/auth-hooks';
import { Car, ShoppingCart, DollarSign, TrendingUp, Package, Megaphone, Users } from 'lucide-react';
import QueryErrorState from '@/components/QueryErrorState';
import { lazy, Suspense, useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import RevenueReportDialog from '@/components/RevenueReportDialog';

// Lazy load charts — recharts is ~200KB and only shown for non-staff users
const ChartsSection = lazy(() => import('./ChartsSection'));

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444'];

export default function Dashboard() {
  const { data, isLoading, isError } = useDashboard();
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const isAdmin = user?.role === 'ADMIN';
  const isStaff = user?.role === 'STAFF';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (isSuperAdmin) {
      navigate('/super-admin', { replace: true });
    }
  }, [isSuperAdmin, navigate]);

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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" role="region" aria-label="Key metrics">
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
        </div>

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
    </AppLayout>
  );
}
