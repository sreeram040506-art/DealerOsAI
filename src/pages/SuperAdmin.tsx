import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { 
  Building2, Users, Car, Plus, ShieldCheck, 
  Search, Power, LayoutGrid, List, MoreVertical,
  ArrowUpRight, Globe, CheckCircle2, XCircle, TrendingUp, PieChart as PieChartIcon,
  Activity, Settings2, HardDrive, MapPin, Phone, Mail
} from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { toast } from '@/components/ui/toast-utils';
import { 
  Dialog, DialogContent, DialogHeader, 
  DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DealershipStats {
  dealershipsCount: number;
  usersCount: number;
  vehiclesCount: number;
}

interface Analytics {
  growth: { name: string, value: number }[];
  statusBreakdown: { name: string, value: number }[];
}

interface Dealership {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  address?: string;
  phone?: string;
  email?: string;
  createdAt: string;
  _count: {
    users: number;
    vehicles: number;
    sales: number;
  }
}

const COLORS = ['#6366f1', '#f43f5e', '#fbbf24', '#10b981'];

const SuperAdmin = () => {
  const { token } = useAuth();
  const [stats, setStats] = useState<DealershipStats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // New Dealership Form
  const [formData, setFormData] = useState({
    dealershipName: '',
    adminName: '',
    email: '',
    password: ''
  });

  const fetchData = async () => {
    try {
      const [statsRes, dealsRes, analyticsRes] = await Promise.all([
        fetch(apiUrl('/super-admin/stats'), { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(apiUrl('/super-admin/dealerships'), { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(apiUrl('/super-admin/analytics'), { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      if (statsRes.ok && dealsRes.ok && analyticsRes.ok) {
        setStats(await statsRes.json());
        setDealerships(await dealsRes.json());
        setAnalytics(await analyticsRes.json());
      }
    } catch (error) {
      toast.error('Failed to load super admin data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchData();
  }, [token]);

  const handleCreateDealership = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(apiUrl('/super-admin/dealerships'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        toast.success('Dealership and Admin created successfully');
        setIsCreateOpen(false);
        setFormData({ dealershipName: '', adminName: '', email: '', password: '' });
        fetchData();
      } else {
        const error = await res.json();
        toast.error(error.message || 'Creation failed');
      }
    } catch (error) {
      toast.error('Connection error');
    }
  };

  const toggleStatus = async (id: string) => {
    try {
      const res = await fetch(apiUrl(`/super-admin/dealerships/${id}/toggle`), {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Status updated');
        fetchData();
      }
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const filteredDealerships = dealerships.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#070709] text-slate-200 p-4 md:p-8 space-y-8">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-8">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 mb-2">
            <div className="p-1.5 bg-indigo-500/10 rounded-lg">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Platform Control Center</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Super Admin Dashboard</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-4 px-4 py-2 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-medium text-slate-400">System Status: <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px]">Optimal</span></span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-medium text-slate-400">Platform Version: <span className="text-indigo-400 font-bold tracking-wider text-[10px]">v2.4.0</span></span>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="analytics" className="space-y-8">
        <TabsList className="bg-white/5 border border-white/10 p-1 h-12 rounded-xl">
          <TabsTrigger value="analytics" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-lg px-6 gap-2">
            <LayoutGrid className="w-4 h-4" />
            Platform Analytics
          </TabsTrigger>
          <TabsTrigger value="manage" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-lg px-6 gap-2">
            <Settings2 className="w-4 h-4" />
            Manage Dealerships
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { label: 'Active Dealerships', value: stats?.dealershipsCount || 0, icon: Building2, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
              { label: 'Platform Users', value: stats?.usersCount || 0, icon: Users, color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
            ].map((stat, i) => (
              <Card key={i} className="bg-[#111115] border-white/5 shadow-2xl shadow-black/50 group overflow-hidden">
                <CardContent className="pt-6 relative">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-all duration-500" />
                  <div className="flex items-center justify-between mb-4">
                    <div className={cn("p-3 rounded-xl", stat.bg)}>
                      <stat.icon className={cn("w-6 h-6", stat.color)} />
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/5 px-2 py-1 rounded">Live Data</div>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm font-medium">{stat.label}</p>
                    <h3 className="text-3xl font-black text-white mt-1 tracking-tight">{stat.value}</h3>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Analytics Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-[#111115] border-white/5 shadow-2xl overflow-hidden group">
              <CardHeader className="flex flex-row items-center justify-between pb-8">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                    Dealership Growth Trend
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">Monthly instance deployments across the platform</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics?.growth || []}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                      <XAxis dataKey="name" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#111115', border: '1px solid #ffffff10', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Area type="monotone" dataKey="value" stroke="#6366f1" fillOpacity={1} fill="url(#colorValue)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#111115] border-white/5 shadow-2xl overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-8">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
                    <PieChartIcon className="w-4 h-4 text-rose-400" />
                    Instance Health Distribution
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">Breakdown of active vs suspended tenants</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics?.statusBreakdown || []}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={8}
                        dataKey="value"
                      >
                        {(analytics?.statusBreakdown || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#111115', border: '1px solid #ffffff10', borderRadius: '12px' }}
                        itemStyle={{ color: '#fff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex gap-8 mt-4">
                  {analytics?.statusBreakdown.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full ring-4 ring-white/5" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-white">{entry.name}</span>
                        <span className="text-[10px] text-slate-500 font-medium">{entry.value} Instances</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="manage" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input 
                placeholder="Search by name, ID or slug..." 
                className="pl-12 bg-white/5 border-white/10 text-sm h-12 rounded-xl focus:ring-indigo-500/50"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 px-8 h-12 rounded-xl shadow-xl shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95">
                  <Plus className="w-5 h-5" />
                  Assign New Dealership
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#111115] border-white/10 text-white max-w-md p-8 rounded-2xl shadow-3xl">
                <DialogHeader>
                  <DialogTitle className="text-3xl font-black tracking-tight">Deploy New Instance</DialogTitle>
                  <CardDescription className="text-slate-400">Initialize a new dealership and its primary admin user.</CardDescription>
                </DialogHeader>
                <form onSubmit={handleCreateDealership} className="space-y-6 pt-6">
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Company Details</Label>
                      <Input 
                        placeholder="Dealership Name" 
                        className="bg-black/40 border-white/10 h-12 rounded-xl" 
                        value={formData.dealershipName}
                        onChange={e => setFormData({...formData, dealershipName: e.target.value})}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Admin Credentials</Label>
                      <div className="grid grid-cols-1 gap-4">
                        <Input 
                          placeholder="Admin Full Name" 
                          className="bg-black/40 border-white/10 h-12 rounded-xl"
                          value={formData.adminName}
                          onChange={e => setFormData({...formData, adminName: e.target.value})}
                          required
                        />
                        <Input 
                          type="email" 
                          placeholder="Admin Email Address" 
                          className="bg-black/40 border-white/10 h-12 rounded-xl"
                          value={formData.email}
                          onChange={e => setFormData({...formData, email: e.target.value})}
                          required
                        />
                        <Input 
                          type="password" 
                          placeholder="Initial Access Password"
                          className="bg-black/40 border-white/10 h-12 rounded-xl"
                          value={formData.password}
                          onChange={e => setFormData({...formData, password: e.target.value})}
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter className="pt-4">
                    <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 h-14 text-lg font-black rounded-xl shadow-2xl shadow-indigo-500/20">
                      Provision Dealership
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="bg-[#111115] border-white/5 shadow-3xl overflow-hidden rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02] text-slate-500 text-[10px] uppercase tracking-[0.2em] font-black">
                    <th className="px-8 py-5">Instance Identity</th>
                    <th className="px-8 py-5 text-center">Lifecycle Status</th>
                    <th className="px-8 py-5 text-center">Utilization</th>
                    <th className="px-8 py-5 text-right">Management</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredDealerships.map((deal) => (
                    <tr key={deal.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <span className="text-white font-black text-lg group-hover:text-indigo-400 transition-colors">{deal.name}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-mono text-slate-600">ID: {deal.id}</span>
                            <span className="text-[10px] font-bold text-indigo-500/60 bg-indigo-500/5 px-1.5 py-0.5 rounded tracking-wider uppercase">/{deal.slug}</span>
                          </div>
                          {(deal.address || deal.phone || deal.email) && (
                            <div className="mt-3 flex flex-col gap-1.5 border-t border-white/5 pt-3">
                              {deal.address && (
                                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                  <MapPin className="w-3 h-3 text-indigo-500" />
                                  {deal.address}
                                </div>
                              )}
                              <div className="flex items-center gap-4">
                                {deal.phone && (
                                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                    <Phone className="w-3 h-3 text-emerald-500" />
                                    {deal.phone}
                                  </div>
                                )}
                                {deal.email && (
                                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                    <Mail className="w-3 h-3 text-rose-500" />
                                    {deal.email}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <div className="flex justify-center">
                          {deal.isActive ? (
                            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Operational
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-black uppercase tracking-widest border border-rose-500/20">
                              <XCircle className="w-3.5 h-3.5" />
                              Suspended
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <div className="flex items-center justify-center gap-6">
                          <div className="flex flex-col">
                            <span className="text-white font-bold text-sm">{deal._count.users}</span>
                            <span className="text-[9px] uppercase font-black text-slate-600 tracking-tighter">Users</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-white font-bold text-sm">{deal._count.vehicles}</span>
                            <span className="text-[9px] uppercase font-black text-slate-600 tracking-tighter">Units</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-white font-bold text-sm">{deal._count.sales}</span>
                            <span className="text-[9px] uppercase font-black text-slate-600 tracking-tighter">Sales</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex justify-end gap-3">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className={cn(
                              "h-10 px-4 rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all",
                              deal.isActive 
                                ? "bg-rose-500/5 hover:bg-rose-500/20 text-rose-500 border border-rose-500/10" 
                                : "bg-emerald-500/5 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/10"
                            )}
                            onClick={() => toggleStatus(deal.id)}
                          >
                            {deal.isActive ? 'Suspend' : 'Reactivate'}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 border border-white/5">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredDealerships.length === 0 && (
                <div className="py-24 text-center">
                  <div className="inline-flex p-6 bg-white/5 rounded-3xl mb-4">
                    <Globe className="w-12 h-12 text-slate-700" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">No instances found</h3>
                  <p className="text-slate-500 text-sm max-w-xs mx-auto">Try refining your search terms or assign a new dealership to get started.</p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SuperAdmin;
