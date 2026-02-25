import { Outlet } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';

export function Layout() {
  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden">
      {/* Background Gradient matching Whoop (Tan -> Dark) */}
      <div className="fixed top-0 left-0 right-0 h-[400px] bg-gradient-to-b from-[#B89C78]/40 via-[#B89C78]/10 to-transparent pointer-events-none z-0" />
      
      <main className="flex-1 overflow-y-auto relative px-4 pb-24 pt-safe container max-w-md mx-auto z-10">
        <Outlet />
      </main>
      
      <BottomNavigation />
    </div>
  );
}
