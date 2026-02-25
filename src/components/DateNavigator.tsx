import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Check, RotateCcw } from 'lucide-react';
import { format, isToday, addDays, isSameDay, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState, useCallback } from 'react';

interface DateNavigatorProps {
  currentDate: Date;
  onPrevDay: () => void;
  onNextDay: () => void;
  onSelectDate: (date: Date) => void;
  onBackToToday: () => void;
  loggedDates?: Set<string>;
}

export function DateNavigator({ currentDate, onPrevDay, onNextDay, onSelectDate, onBackToToday, loggedDates }: DateNavigatorProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Generate a large range of dates (e.g., +/- 100 days from today) for "infinite" feel
  const today = useRef(startOfDay(new Date())).current;
  const RANGE = 365;
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
    if (!isScrolling) {
      scrollToDate(currentDate);
    }
  }, [currentDate, isScrolling, scrollToDate]);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    setIsScrolling(true);

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
      
      // Calculate which item is closest to the center
      const container = scrollContainerRef.current!;
      const containerCenter = container.scrollLeft + container.offsetWidth / 2;
      const items = container.querySelectorAll('.date-item');
      
      let closestDate = dateRange[0];
      let minDistance = Infinity;

      items.forEach((item, idx) => {
        const itemCenter = (item as HTMLElement).offsetLeft + (item as HTMLElement).offsetWidth / 2;
        const distance = Math.abs(containerCenter - itemCenter);
        
        if (distance < minDistance) {
          minDistance = distance;
          closestDate = dateRange[idx];
        }
      });

      if (!isSameDay(closestDate, currentDate)) {
        onSelectDate(closestDate);
      }
    }, 150); // Debounce to allow snapping to finish
  }, [currentDate, dateRange, onSelectDate]);

  return (
    <div className="flex flex-col items-center justify-center w-full gap-6 pt-4 bg-transparent">
      {/* Top Header */}
      <div className="relative flex items-center justify-center w-full px-4">
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

      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex items-center gap-2 w-full overflow-x-auto pb-4 px-4 no-scrollbar scroll-smooth"
        style={{ 
          scrollSnapType: 'x mandatory',
          paddingLeft: 'calc(50% - 26px)', // Center the first item
          paddingRight: 'calc(50% - 26px)' // Center the last item
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
                "date-item flex flex-col items-center justify-center w-[52px] h-[72px] rounded-full shrink-0 transition-all scroll-snap-align-center",
                isSelected 
                  ? "border border-foreground bg-foreground/10" 
                  : "bg-foreground/5 hover:bg-foreground/10 opacity-40 scale-90"
              )}
              style={{ scrollSnapAlign: 'center' }}
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
  );
}
