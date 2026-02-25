import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Check, RotateCcw, Trash2 } from 'lucide-react';
import { format, isToday, addDays, isSameDay, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useCallback } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface DateNavigatorProps {
  currentDate: Date;
  onPrevDay: () => void;
  onNextDay: () => void;
  onSelectDate: (date: Date) => void;
  onBackToToday: () => void;
  onClearDay?: () => void;
  loggedDates?: Set<string>;
}

export function DateNavigator({ currentDate, onPrevDay, onNextDay, onSelectDate, onBackToToday, onClearDay, loggedDates }: DateNavigatorProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Generate a very large range of dates for "infinite" feel
  const today = useRef(startOfDay(new Date())).current;
  const RANGE = 1000; // Increase range further
  const dateRange = useRef(
    Array.from({ length: RANGE * 2 + 1 }).map((_, i) => addDays(today, i - RANGE))
  ).current;

  const displayText = isToday(currentDate) ? 'TODAY' : format(currentDate, 'MMM d, yyyy').toUpperCase();

  // Scroll to the selected date whenever it changes
  const scrollToDate = useCallback((date: Date, smooth = true) => {
    if (!scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current;
    const items = container.querySelectorAll('.date-item');
    const index = dateRange.findIndex(d => isSameDay(d, date));
    
    if (index !== -1 && items[index]) {
      const item = items[index] as HTMLElement;
      // Calculate scroll position so the item is exactly in the center
      const scrollLeft = item.offsetLeft - (container.offsetWidth / 2) + (item.offsetWidth / 2);
      
      container.scrollTo({
        left: scrollLeft,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }, [dateRange]);

  // Initial scroll to today or currentDate
  useEffect(() => {
    scrollToDate(currentDate, false);
  }, []);

  // Sync scroll position when currentDate changes externally (e.g. arrows, "Back to Today")
  useEffect(() => {
    scrollToDate(currentDate);
  }, [currentDate, scrollToDate]);

  // Robust selection logic using scrollend
  const updateSelectedDateFromScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current!;
    const containerCenter = container.scrollLeft + container.offsetWidth / 2;
    const items = container.querySelectorAll('.date-item');
    
    let closestIndex = -1;
    let minDistance = Infinity;

    items.forEach((item, idx) => {
      const itemLeft = (item as HTMLElement).offsetLeft;
      const itemWidth = (item as HTMLElement).offsetWidth;
      const itemCenter = itemLeft + itemWidth / 2;
      const distance = Math.abs(containerCenter - itemCenter);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = idx;
      }
    });

    if (closestIndex !== -1) {
      const closestDate = dateRange[closestIndex];
      if (!isSameDay(closestDate, currentDate)) {
        onSelectDate(closestDate);
      }
    }
  }, [currentDate, dateRange, onSelectDate]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    
    const handleScrollEnd = () => {
      updateSelectedDateFromScroll();
    };

    // Fallback for browsers that don't support scrollend
    const handleScroll = () => {
      // Use scrollend-like behavior via timeout
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        handleScrollEnd();
      }, 100);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    // Use modern scrollend if available
    if ('onscrollend' in window) {
      container.addEventListener('scrollend', handleScrollEnd);
    }

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if ('onscrollend' in window) {
        container.removeEventListener('scrollend', handleScrollEnd);
      }
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [updateSelectedDateFromScroll]);

  return (
    <div className="flex flex-col items-center justify-center w-[calc(100%+2rem)] -mx-4 gap-6 pt-4 bg-transparent select-none">
      {/* Top Header */}
      <div className="relative flex items-center justify-center w-full px-4">
        {onClearDay && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button 
                className="absolute left-4 flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                CLEAR
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-[90vw] sm:max-w-md rounded-[24px]">
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete all habit logs for {isToday(currentDate) ? 'today' : format(currentDate, 'MMM d')}. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={onClearDay}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full"
                >
                  Continue
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <div className="flex items-center justify-between w-full max-w-[200px]">
          <button 
            onClick={onPrevDay}
            className="p-1 hover:bg-secondary rounded-full transition-colors text-foreground hover:text-foreground/80"
            aria-label="Previous day"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          
          <span className="font-bold text-sm tracking-widest text-foreground">
            {displayText}
          </span>
          
          <button 
            onClick={onNextDay}
            className="p-1 hover:bg-secondary rounded-full transition-colors text-foreground hover:text-foreground/80"
            aria-label="Next day"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>

        {!isToday(currentDate) && (
          <button 
            onClick={onBackToToday}
            className="absolute right-4 flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            TODAY
          </button>
        )}
      </div>

      {/* Date List Container */}
      <div className="w-full relative flex justify-center">
        <div 
          ref={scrollContainerRef}
          className="flex items-center gap-2 w-full overflow-x-auto pb-6 no-scrollbar scroll-smooth"
          style={{ 
            scrollSnapType: 'x mandatory',
            paddingLeft: 'calc(50% - 26px)', 
            paddingRight: 'calc(50% - 26px)'
          }}
        >
          {dateRange.map((date, idx) => {
            const isSelected = isSameDay(date, currentDate);
            const dateStr = date.toISOString().split('T')[0];
            const hasData = loggedDates?.has(dateStr);
            return (
              <button
                key={idx}
                onClick={() => {
                  onSelectDate(date);
                  scrollToDate(date);
                }}
                className={cn(
                  "date-item flex flex-col items-center justify-center w-[52px] h-[72px] rounded-full shrink-0 transition-all",
                  isSelected 
                    ? "border border-foreground bg-foreground/10" 
                    : "bg-foreground/5 hover:bg-foreground/10 opacity-40 scale-75"
                )}
                style={{ 
                  scrollSnapAlign: 'center',
                  scrollSnapStop: 'always'
                }}
              >
                <span className="text-[11px] font-semibold text-foreground/80 uppercase">
                  {format(date, 'eee')}
                </span>
                <span className="text-lg font-bold text-foreground leading-tight">
                  {format(date, 'd')}
                </span>
                <div className="mt-1 flex items-center justify-center min-h-[16px]">
                  {hasData ? (
                    <div className="w-4 h-4 rounded-full bg-success flex items-center justify-center">
                      <Check className="w-3 h-3 text-success-foreground" strokeWidth={4} />
                    </div>
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-foreground/20"></div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}


