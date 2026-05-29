import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Car, ShoppingCart, 
  BarChart3, Menu, LogOut, X, FileArchive, FileText, Receipt, Users, Settings, ShieldCheck, Brain, Shield, BadgeCheck, Megaphone, Calculator, Gavel, Bell, Plug
} from 'lucide-react';
import { useState, useCallback, memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-hooks';
import { Button } from './ui/button';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/inventory', icon: Car, label: 'Cars', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { to: '/sales', icon: ShoppingCart, label: 'Sales', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { to: '/customers', icon: Users, label: 'People', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { to: '/documents-forms', icon: FileArchive, label: 'Forms', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
] as const;

const drawerItems = [
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
  { to: '/used-vehicle-forms', icon: FileText, label: 'Used Forms', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { to: '/reports', icon: BarChart3, label: 'Reports', roles: ['ADMIN', 'MANAGER'] },
  { to: '/team-analytics', icon: Users, label: 'Team', roles: ['ADMIN'] },
  { to: '/settings', icon: Settings, label: 'Settings', roles: ['ADMIN'] },
  { to: '/super-admin', icon: ShieldCheck, label: 'Platform Admin', roles: ['SUPER_ADMIN'] },
] as const;

const MobileNav = memo(function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);

  const filteredNavItems = useMemo(
    () => navItems.filter(item => !item.roles || (user && item.roles.includes(user.role))),
    [user],
  );

  const filteredDrawerItems = useMemo(
    () => drawerItems.filter(item => !item.roles || (user && item.roles.includes(user.role))),
    [user],
  );

  return (
    <>
      {/* Top bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-sidebar border-b border-sidebar-border sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="h-7 px-2 rounded-md bg-sidebar-primary/90 flex items-center justify-center" aria-hidden="true">
            <span className="text-[9px] font-black tracking-wider text-sidebar-primary-foreground">AI</span>
          </div>
          <h1 className="text-sm font-bold text-sidebar-accent-foreground tracking-tight">
            {user?.dealership?.name || 'Synex'}
          </h1>
        </div>
        <button 
          onClick={openDrawer}
          aria-label="Open navigation menu"
          aria-expanded={isOpen}
          className="w-8 h-8 rounded-md bg-sidebar-accent flex items-center justify-center text-sidebar-foreground"
        >
          <Menu className="w-4 h-4" aria-hidden="true" />
        </button>
      </header>

      {/* Drawer overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
            onClick={closeDrawer}
            aria-hidden="true"
          />
          
          <div className="absolute top-0 right-0 h-full w-[260px] bg-sidebar border-l border-sidebar-border shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
              <span className="font-semibold text-sm text-sidebar-accent-foreground">Menu</span>
              <button onClick={closeDrawer} className="text-sidebar-muted hover:text-sidebar-accent-foreground" aria-label="Close menu">
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-0.5" aria-label="Main navigation">
              <div className="bg-sidebar-accent/40 rounded-lg p-3 mb-3">
                <p className="text-[10px] text-sidebar-muted uppercase tracking-wider font-semibold mb-0.5">Signed in as</p>
                <p className="text-sm font-medium text-sidebar-accent-foreground">{user?.name}</p>
                <p className="text-[10px] text-sidebar-primary font-semibold uppercase">{user?.role}</p>
                <p className="text-[10px] text-sidebar-muted font-medium mt-1 truncate">{user?.dealership?.name}</p>
              </div>

              {filteredDrawerItems.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={closeDrawer}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors",
                      isActive 
                        ? "bg-sidebar-primary/10 text-sidebar-primary" 
                        : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="w-[18px] h-[18px]" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                );
              })}

              <div className="pt-3 mt-3 border-t border-sidebar-border">
                <Button 
                  variant="destructive" 
                  className="w-full justify-start gap-3 h-10 rounded-lg text-[13px]"
                  onClick={logout}
                  aria-label="Sign out"
                >
                  <LogOut className="w-[18px] h-[18px]" aria-hidden="true" />
                  Sign Out
                </Button>
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* Bottom tab bar - Modern Floating Design */}
      <nav className="md:hidden fixed bottom-4 left-4 right-4 h-16 bg-sidebar/80 backdrop-blur-xl border border-sidebar-border/50 rounded-2xl shadow-2xl py-1.5 px-3 flex items-center justify-around z-[100] overflow-hidden" aria-label="Quick navigation">
        <div className="absolute inset-0 bg-gradient-to-r from-sidebar-primary/5 via-transparent to-sidebar-primary/5 pointer-events-none" aria-hidden="true" />
        {filteredNavItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 transition-all duration-300 px-4 h-full",
                isActive ? "text-sidebar-primary transform -translate-y-0.5" : "text-sidebar-muted hover:text-sidebar-foreground"
              )}
            >
              {isActive && (
                <div className="absolute -top-1 w-8 h-1 bg-sidebar-primary rounded-b-full shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-fade-in" aria-hidden="true" />
              )}
              <item.icon className={cn("w-[22px] h-[22px] transition-all duration-300", isActive && "scale-110 drop-shadow-md")} aria-hidden="true" />
              <span className={cn(
                "text-[10px] font-semibold tracking-tight transition-all duration-300",
                isActive ? "opacity-100" : "opacity-70"
              )}>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
});

export default MobileNav;
