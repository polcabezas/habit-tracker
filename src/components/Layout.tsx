import { Outlet } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';

export function Layout() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-20 overflow-x-hidden">
      {/* 
        max-w-md restricts width on desktop and centers it to retain mobile-first design,
        but allows full width on smaller screens. 
      */}
      <main className="container max-w-md mx-auto min-h-screen relative px-4 pb-24 pt-safe">
        <Outlet />
      </main>
      
      <BottomNavigation />
    </div>
  );
}
