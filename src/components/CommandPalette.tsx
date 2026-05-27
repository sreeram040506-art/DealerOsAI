import React, { useEffect, useState, useCallback } from 'react';
import { Command } from 'cmdk';
import { 
  Search, 
  FileText, 
  TrendingUp, 
  Car,
  ShoppingCart,
  User,
  LogOut
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth-hooks';

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  // Toggle the menu when ⌘K is pressed
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  // Early return AFTER hooks — this is the key optimization.
  // Previously, useInventory() was called above this line, triggering
  // a full /vehicles API fetch even when the palette was closed.
  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="w-full max-w-[640px] bg-card border border-border shadow-2xl rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <Command label="Global Command Palette" className="flex flex-col h-full max-h-[450px]">
          <div className="flex items-center border-b border-border px-4">
            <Search className="w-5 h-5 text-muted-foreground mr-3" aria-hidden="true" />
            <Command.Input
              autoFocus
              placeholder="Search actions or pages..."
              className="w-full h-14 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none text-base"
            />
            <kbd className="px-2 py-1 rounded bg-muted text-[10px] font-black text-muted-foreground uppercase tracking-widest border border-border">
              ESC
            </kbd>
          </div>

          <Command.List className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            <Command.Empty className="p-8 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            <Command.Group heading="Navigation" className="px-2 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <Command.Item 
                onSelect={() => runCommand(() => navigate('/'))}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold hover:bg-primary/10 hover:text-primary cursor-pointer transition-colors aria-selected:bg-primary/10 aria-selected:text-primary"
              >
                <TrendingUp className="w-4 h-4" aria-hidden="true" /> Dashboard
              </Command.Item>
              <Command.Item 
                onSelect={() => runCommand(() => navigate('/inventory'))}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold hover:bg-primary/10 hover:text-primary cursor-pointer transition-colors aria-selected:bg-primary/10 aria-selected:text-primary"
              >
                <Car className="w-4 h-4" aria-hidden="true" /> Inventory
              </Command.Item>
              <Command.Item 
                onSelect={() => runCommand(() => navigate('/sales'))}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold hover:bg-primary/10 hover:text-primary cursor-pointer transition-colors aria-selected:bg-primary/10 aria-selected:text-primary"
              >
                <ShoppingCart className="w-4 h-4" aria-hidden="true" /> Sales Registry
              </Command.Item>
              <Command.Item 
                onSelect={() => runCommand(() => navigate('/reports'))}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold hover:bg-primary/10 hover:text-primary cursor-pointer transition-colors aria-selected:bg-primary/10 aria-selected:text-primary"
              >
                <FileText className="w-4 h-4" aria-hidden="true" /> Financial Reports
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Account" className="px-2 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-t border-border mt-2 pt-4">
              <Command.Item 
                onSelect={() => runCommand(() => {})}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-muted-foreground cursor-not-allowed"
              >
                <User className="w-4 h-4" aria-hidden="true" /> {user?.email}
              </Command.Item>
              <Command.Item 
                onSelect={() => runCommand(() => logout())}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-destructive hover:bg-destructive/10 cursor-pointer transition-colors aria-selected:bg-destructive/10"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" /> Sign Out
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
