import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Car, ShoppingCart, 
  Receipt, ChevronLeft, ChevronRight,
  LogOut, User as UserIcon, BarChart3, FileCheck2, FileArchive, Users, Settings, ShieldCheck, Brain, FileText, Shield, BadgeCheck, Megaphone, Calculator, Gavel, Bell, Plug
} from 'lucide-react';
import { useState, memo, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-hooks';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/inventory', icon: Car, label: 'Inventory', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { to: '/sales', icon: ShoppingCart, label: 'Sales', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { to: '/customers', icon: Users, label: 'Customers', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { to: '/documents-forms', icon: FileText, label: 'Documents & Forms', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { to: '/rmv-compliance', icon: Shield, label: 'Compliance & Coverage', roles: ['ADMIN', 'MANAGER'] },
  { to: '/registry', icon: FileArchive, label: 'Registry', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { to: '/marketing', icon: Megaphone, label: 'Marketing', roles: ['ADMIN', 'MANAGER'] },
  { to: '/ai-insights', icon: Brain, label: 'AI Insights / Ask', roles: ['ADMIN', 'MANAGER'] },
  { to: '/accounting', icon: Calculator, label: 'Accounting', roles: ['ADMIN'] },
  { to: '/employees', icon: BadgeCheck, label: 'Attendance', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { to: '/auctions', icon: Gavel, label: 'Auctions', roles: ['ADMIN', 'MANAGER'] },
  { to: '/notifications', icon: Bell, label: 'Notifications', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { to: '/api-integrations', icon: Plug, label: 'API Integrations', roles: ['ADMIN'] },
  { to: '/expenses', icon: Receipt, label: 'Expenses', roles: ['ADMIN'] },
  { to: '/used-vehicle-forms', icon: FileCheck2, label: 'Used Forms', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { to: '/reports', icon: BarChart3, label: 'Reports', roles: ['ADMIN', 'MANAGER'] },
  { to: '/team-analytics', icon: Users, label: 'Team', roles: ['ADMIN'] },
  { to: '/settings', icon: Settings, label: 'Settings', roles: ['ADMIN'] },
  { to: '/super-admin', icon: ShieldCheck, label: 'Platform Admin', roles: ['SUPER_ADMIN'] },
] as const;

// Memoized to prevent re-renders when page content changes but sidebar state hasn't
const AppSidebar = memo(function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

  const toggleCollapsed = useCallback(() => setCollapsed(prev => !prev), []);

  const filteredNavItems = useMemo(
    () => navItems.filter(item => !item.roles || (user && item.roles.includes(user.role))),
    [user],
  );

  return (
    <aside 
      className={cn(
        "hidden md:flex flex-col bg-sidebar/80 backdrop-blur-xl border-r border-sidebar-border shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-200 h-screen sticky top-0 shrink-0 z-40",
        collapsed ? "w-[68px]" : "w-[240px]"
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="h-8 px-2 rounded-md bg-sidebar-primary/90 flex items-center justify-center shrink-0" aria-hidden="true">
          <span className="text-[10px] font-black tracking-wider text-sidebar-primary-foreground">AI</span>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-sidebar-accent-foreground truncate">
              {user?.dealership?.name || 'Synex'}
            </h1>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-1.5" aria-label="Primary">
        {filteredNavItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 relative",
                isActive
                  ? "bg-sidebar-primary/10 text-sidebar-primary shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-sidebar-primary rounded-r-full shadow-[0_0_8px_rgba(16,185,129,0.4)]" aria-hidden="true" />
              )}
              <item.icon className={cn("w-[18px] h-[18px] shrink-0 transition-transform group-hover:scale-110", isActive && "text-sidebar-primary")} aria-hidden="true" />
              {!collapsed && <span className="truncate tracking-tight">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* User & Collapse */}
      <div className="mt-auto px-2 py-3 border-t border-sidebar-border space-y-0.5">
        <div className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-sidebar-muted",
          collapsed && "justify-center"
        )}>
          <UserIcon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-sidebar-accent-foreground truncate">{user?.name}</span>
              <span className="text-[10px] uppercase font-semibold text-sidebar-primary tracking-wide">{user?.role}</span>
            </div>
          )}
        </div>
        
        <button
          onClick={logout}
          aria-label="Sign out"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-destructive/80 hover:bg-destructive/10 hover:text-destructive w-full transition-colors",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
          {!collapsed && <span>Sign Out</span>}
        </button>

        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground hover:bg-sidebar-accent/60 w-full transition-colors",
            collapsed && "justify-center"
          )}
        >
          {collapsed ? <ChevronRight className="w-[18px] h-[18px]" aria-hidden="true" /> : <ChevronLeft className="w-[18px] h-[18px]" aria-hidden="true" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
});

export default AppSidebar;
