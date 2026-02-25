import { Outlet } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { BackgroundGradient } from './BackgroundGradient';

export function Layout() {
  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden relative">
      {/* Background Gradient matching Whoop (Tan -> Dark) */}
      <BackgroundGradient />
      
      <main className="flex-1 overflow-y-auto relative px-4 pb-24 pt-safe container max-w-md mx-auto z-10">
        <Outlet />
      </main>
      
      <BottomNavigation />
    </div>
  );
}
