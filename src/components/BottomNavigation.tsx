import { NavLink } from 'react-router-dom';
import { BookOpen, LineChart, User } from 'lucide-react';

export function BottomNavigation() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-lg border-t border-border pb-safe z-50">
      <div className="container max-w-md mx-auto h-16 flex items-center justify-around px-4">
        <NavLink
          to="/journal"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-20 h-full transition-colors ${
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-primary/70'
            }`
          }
        >
          <BookOpen className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-medium tracking-wide">Journal</span>
        </NavLink>
        
        <NavLink
          to="/stats"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-20 h-full transition-colors ${
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-primary/70'
            }`
          }
        >
          <LineChart className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-medium tracking-wide">Progress</span>
        </NavLink>

        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-20 h-full transition-colors ${
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-primary/70'
            }`
          }
        >
          <User className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-medium tracking-wide">Profile</span>
        </NavLink>
      </div>
    </nav>
  );
}
