import { Outlet } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';

export function Layout() {
  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden">
      {/* 
        max-w-md restricts width on desktop and centers it to retain mobile-first design,
        but allows full width on smaller screens. 
      */}
      <main className="flex-1 overflow-y-auto relative px-4 pb-24 pt-safe container max-w-md mx-auto">
        <Outlet />
      </main>
      
      <BottomNavigation />
    </div>
  );
}
