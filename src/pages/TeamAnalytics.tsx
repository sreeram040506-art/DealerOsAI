import AppLayout from '@/components/AppLayout';
import { useTeam, TeamMember } from '@/hooks/useTeam';
import QueryErrorState from '@/components/QueryErrorState';
import { Users, Car, ShoppingCart, UserPlus, Shield, Mail, Lock, Trash2, Edit2, ChevronDown, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from 'sonner';

export default function TeamAnalytics() {
  const { team, isLoading, isError, addMember, updateMember, deleteMember } = useTeam();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'STAFF'
  });

  if (isLoading) return (
    <AppLayout>
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-profit animate-spin" />
          <p className="text-muted-foreground font-bold tracking-widest text-[10px] uppercase">Fetching Team...</p>
        </div>
      </div>
    </AppLayout>
  );

  if (isError) {
    return (
      <AppLayout>
        <QueryErrorState
          title="Could not load team data"
          description="Failed to fetch team members and analytics."
        />
      </AppLayout>
    );
  }

  const handleOpenAdd = () => {
    setEditingMember(null);
    setFormData({ name: '', email: '', password: '', role: 'STAFF' });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (member: TeamMember) => {
    setEditingMember(member);
    setFormData({ 
      name: member.name, 
      email: member.email, 
      password: '', // Don't show password
      role: member.role 
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMember) {
        await updateMember.mutateAsync({ id: editingMember.id, ...formData });
      } else {
        await addMember.mutateAsync(formData);
      }
      setIsDialogOpen(false);
    } catch (err) {
      // Error handled by mutation
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to remove this team member? This will not delete their historical activity but they will lose access.')) {
      await deleteMember.mutateAsync(id);
    }
  };

  const staffCount = team.filter(m => m.role === 'STAFF').length;
  const managerCount = team.filter(m => m.role === 'MANAGER').length;
  const adminCount = team.filter(m => m.role === 'ADMIN').length;

  return (
    <AppLayout>
      <div className="space-y-8 page-enter">
        {/* Header Section */}
        <section className="relative overflow-hidden rounded-[32px] border border-border bg-white p-8 md:p-10 shadow-xl shadow-black/[0.02]">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary shadow-sm">
                <Shield className="h-3.5 w-3.5" />
                Administrative Control Panel
              </div>
              <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight text-foreground leading-[1.1]">
                Team <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-foreground">Management</span>
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground font-medium">
                Manage your staff logins, reset passwords, and monitor performance analytics across your entire dealership.
              </p>
            </div>
            
            <div className="flex gap-4">
              <div className="bg-muted/30 p-4 rounded-2xl border border-border/60 min-w-[120px]">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Total Team</p>
                <p className="text-2xl font-black text-foreground">{team.length}</p>
              </div>
              <Button 
                onClick={handleOpenAdd}
                className="h-full px-8 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-black uppercase tracking-widest text-xs gap-3 shadow-lg shadow-primary/20"
              >
                <UserPlus className="w-5 h-5" />
                Add Member
              </Button>
            </div>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
          {/* Main List */}
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xl font-black text-foreground tracking-tight flex items-center gap-3">
                <Users className="w-6 h-6 text-primary" />
                Active Staff & Managers
              </h2>
            </div>

            {team.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-[28px] border border-border shadow-sm">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 text-muted-foreground">
                  <Users className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-foreground">No team members yet</h3>
                <p className="text-muted-foreground mt-1 mb-6">Start by adding your first staff member or manager.</p>
                <Button onClick={handleOpenAdd} variant="outline" className="rounded-xl border-border">
                  Create Member Account
                </Button>
              </div>
            ) : (
              <div className="grid gap-4">
                {team.map((member) => (
                  <div key={member.id} className="group relative bg-white border border-border rounded-[24px] p-6 shadow-sm hover:shadow-xl hover:shadow-black/[0.04] transition-all duration-300">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-center gap-5">
                        <div className={cn(
                          "w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner transition-colors",
                          member.role === 'ADMIN' ? "bg-primary/10 text-primary" : 
                          member.role === 'MANAGER' ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground"
                        )}>
                          <Users className="w-7 h-7" />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-black text-foreground tracking-tight">{member.name}</h3>
                            <span className={cn(
                              "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border",
                              member.role === 'ADMIN' ? "bg-primary/10 text-primary border-primary/20" : 
                              member.role === 'MANAGER' ? "bg-foreground/10 text-foreground border-foreground/20" : "bg-muted text-muted-foreground border-border"
                            )}>
                              {member.role}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground font-medium mt-0.5 flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5" />
                            {member.email}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-8 md:gap-12 ml-14 md:ml-0">
                        <div className="text-center">
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Activity</p>
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-foreground leading-none">{member._count?.vehiclesAdded || 0}</span>
                              <span className="text-[9px] text-muted-foreground uppercase font-bold">Added</span>
                            </div>
                            <div className="w-[1px] h-4 bg-border" />
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-primary leading-none">{member._count?.salesMade || 0}</span>
                              <span className="text-[9px] text-muted-foreground uppercase font-bold">Sold</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => handleOpenEdit(member)}
                            className="h-10 w-10 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/5"
                          >
                            <Edit2 className="w-4.5 h-4.5" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => handleDelete(member.id)}
                            className="h-10 w-10 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                          >
                            <Trash2 className="w-4.5 h-4.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Sidebar: Analytics Summary */}
          <aside className="space-y-6">
            <div className="rounded-[28px] border border-border bg-white p-6 shadow-sm overflow-hidden relative">
               <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                 <ShoppingCart className="w-24 h-24" />
               </div>
               <h3 className="text-sm font-black text-foreground uppercase tracking-widest mb-6 flex items-center gap-2">
                 <CheckCircle2 className="w-4 h-4 text-primary" />
                 Quick Statistics
               </h3>
               
               <div className="space-y-4">
                 <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border/60">
                   <span className="text-sm font-bold text-muted-foreground">Staff Members</span>
                   <span className="text-lg font-black text-foreground">{staffCount}</span>
                 </div>
                 <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border/60">
                   <span className="text-sm font-bold text-muted-foreground">Managers</span>
                   <span className="text-lg font-black text-foreground">{managerCount}</span>
                 </div>
                 <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border/60">
                   <span className="text-sm font-bold text-muted-foreground">Administrators</span>
                   <span className="text-lg font-black text-foreground">{adminCount}</span>
                 </div>
               </div>

               <div className="mt-8 pt-6 border-t border-border space-y-4">
                 <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Recent Activity Log</p>
                 <div className="space-y-3">
                   {team.slice(0, 3).flatMap(m => m.vehiclesAdded.slice(0, 1).map(v => (
                     <div key={v.id} className="flex items-start gap-3">
                       <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                       <p className="text-xs text-muted-foreground leading-relaxed">
                         <span className="font-bold text-foreground">{m.name}</span> added a new {v.year} {v.make} to inventory.
                       </p>
                     </div>
                   )))}
                 </div>
               </div>
            </div>
          </aside>
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[450px] rounded-[32px] p-8">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-black text-foreground tracking-tight">
                {editingMember ? 'Edit Team Member' : 'Add New Member'}
              </DialogTitle>
              <DialogDescription className="font-medium text-muted-foreground">
                Set up access and credentials for your dealership team.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Full Name</label>
                <div className="relative">
                  <Users className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g. John Doe"
                    className="pl-11 bg-muted/30 border-border rounded-xl h-12 text-sm font-medium focus-visible:ring-primary/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    required
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="john@dealer.com"
                    className="pl-11 bg-muted/30 border-border rounded-xl h-12 text-sm font-medium focus-visible:ring-primary/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
                  {editingMember ? 'New Password (Optional)' : 'Access Password'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    required={!editingMember}
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder="••••••••"
                    className="pl-11 bg-muted/30 border-border rounded-xl h-12 text-sm font-medium focus-visible:ring-primary/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Permissions Level</label>
                <Select 
                  value={formData.role} 
                  onValueChange={(val) => setFormData({...formData, role: val})}
                >
                  <SelectTrigger className="bg-muted/30 border-border rounded-xl h-12 text-sm font-medium focus:ring-primary/20">
                    <SelectValue placeholder="Select Role" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="STAFF">Staff (Basic Access)</SelectItem>
                    <SelectItem value="MANAGER">Manager (Sales & Expenses)</SelectItem>
                    <SelectItem value="ADMIN">Administrator (Full Control)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="mt-8 pt-4">
                <Button 
                  type="submit"
                  disabled={addMember.isPending || updateMember.isPending}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl h-12 font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20"
                >
                  {addMember.isPending || updateMember.isPending ? 'Processing...' : editingMember ? 'Update Member' : 'Create Access Account'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
