import { ReactNode, memo } from 'react';
import AppSidebar from './AppSidebar';
import MobileNav from './MobileNav';
import AIChatAssistant from './AIChatAssistantV2';
import CommandPalette from './CommandPalette';

interface AppLayoutProps {
  children: ReactNode;
}

// The layout shell is memoized — the sidebar, mobile nav, and command palette
// don't need to re-render when page content (children) changes, because
// those child components are already individually memoized
export default memo(function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex flex-col md:flex-row h-screen bg-gradient-to-br from-background via-background to-muted/30 relative overflow-hidden">
      <AppSidebar />
      <MobileNav />
      <main className="flex-1 overflow-auto pb-28 md:pb-0 scrollbar-hide" role="main">
        <div className="p-4 md:p-8 max-w-[1400px] mx-auto animate-in fade-in slide-in-from-bottom-2 duration-500">
          {children}
        </div>
      </main>
      <AIChatAssistant />
      <CommandPalette />
    </div>
  );
});
