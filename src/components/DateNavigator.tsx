import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Check, RotateCcw } from 'lucide-react';
import { format, isToday, addDays, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';

interface DateNavigatorProps {
  currentDate: Date;
  onPrevDay: () => void;
  onNextDay: () => void;
  onSelectDate: (date: Date) => void;
  onBackToToday: () => void;
  loggedDates?: Set<string>;
}

export function DateNavigator({ currentDate, onPrevDay, onNextDay, onSelectDate, onBackToToday, loggedDates }: DateNavigatorProps) {
  const displayText = isToday(currentDate) ? 'TODAY' : format(currentDate, 'MMM d, yyyy').toUpperCase();

  // Generate an array of dates around the current date (e.g. 3 days before, today, 3 days after)
  const dateRange = Array.from({ length: 7 }).map((_, i) => addDays(currentDate, i - 3));

  return (
    <div className="flex flex-col items-center justify-center w-full gap-6 pt-4">
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

    <div className="flex items-center justify-center gap-2 w-full overflow-x-auto pb-2 px-4 no-scrollbar">
      {dateRange.map((date, idx) => {
        const isSelected = isSameDay(date, currentDate);
        const dateStr = date.toISOString().split('T')[0];
        const hasData = loggedDates?.has(dateStr);
        return (
            <button
            key={idx}
            onClick={() => onSelectDate(date)}
            className={cn(
              "flex flex-col items-center justify-center w-[52px] h-[72px] rounded-full shrink-0 transition-all",
              isSelected 
                ? "border border-foreground bg-foreground/10" 
                : "bg-foreground/5 hover:bg-foreground/10"
            )}
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
