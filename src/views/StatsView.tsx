import { Flame, Snowflake, Trophy } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useState, useMemo } from 'react';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { subDays, format, isSameDay } from 'date-fns';

export function StatsView() {
  const [activeTab, setActiveTab] = useState<'7d' | '30d' | 'ytd'>('7d');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return null;

      // 1. Fetch habits to know their XP values
      const { data: habits } = await supabase.from('habits').select('id, base_xp').eq('user_id', userId);
      const xpMap = new Map(habits?.map(h => [h.id, h.base_xp]) || []);

      // 2. Fetch all logs for this user to calculate all-time and streaks
      const { data: logs } = await supabase
        .from('habit_logs')
        .select('date, habit_id')
        .eq('user_id', userId)
        .order('date', { ascending: false });

      let allTimeXp = 0;
      const dailyXp = new Map<string, number>();
      const logSet = new Set<string>();

      (logs || []).forEach(log => {
        const xp = xpMap.get(log.habit_id) || 0;
        allTimeXp += xp;
        if (xp > 0) {
           logSet.add(log.date); // Mark this day as having at least one completed habit
           dailyXp.set(log.date, (dailyXp.get(log.date) || 0) + xp);
        }
      });

      // Simple current streak calc
      let streak = 0;
      let checkDate = new Date();
      // start checking from today
      while (true) {
        const dateStr = format(checkDate, 'yyyy-MM-dd');
        if (logSet.has(dateStr)) {
          streak++;
          checkDate = subDays(checkDate, 1);
        } else {
          // If we are checking today and missed, maybe we did it yesterday, so we are at risk but streak isn't necessarily 0 if we haven't lost it yet
           // To be forgiving, if streak is 0 and we are checking today, check yesterday
           if (streak === 0 && isSameDay(checkDate, new Date())) {
               checkDate = subDays(checkDate, 1);
               const ydayStr = format(checkDate, 'yyyy-MM-dd');
               if (logSet.has(ydayStr)) {
                   streak++;
                   checkDate = subDays(checkDate, 1);
                   continue;
               }
           }
           break;
        }
      }

      return { allTimeXp, streak, dailyXp };
    }
  });

  // Calculate Chart Data based on activeTab
  const chartData = useMemo(() => {
    if (!stats) return [];
    
    const daysToShow = activeTab === '7d' ? 7 : activeTab === '30d' ? 30 : 90;
    const data = [];
    
    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, 'yyyy-MM-dd');
      data.push({
        name: format(d, daysToShow <= 7 ? 'EEE' : 'MMM d'), // e.g., 'Mon' or 'Oct 12'
        xp: stats.dailyXp.get(dateStr) || 0,
      });
    }
    
    return data;
  }, [stats, activeTab]);


  return (
    <div className="flex flex-col gap-6 pb-8 pt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-3xl font-black tracking-tight mb-2">Progress</h1>

      {/* Hero Stat */}
      <div className="bg-card border border-border rounded-[32px] p-6 shadow-sm relative overflow-hidden h-[140px] flex flex-col justify-center">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none pr-4">
          <Trophy className="w-24 h-24 text-foreground/10" strokeWidth={1} />
        </div>
        
        <div className="relative z-10 space-y-1">
          <p className="text-muted-foreground font-bold uppercase tracking-wider text-[11px]">All-Time XP</p>
          <div className="text-[52px] font-black text-foreground leading-none tracking-tight">
            <AnimatedNumber value={stats?.allTimeXp || 0} />
          </div>
          
          <div className="inline-flex mt-2 items-center px-3 py-1 rounded-full text-xs font-bold bg-primary text-primary-foreground shadow-sm">
            Level {Math.floor((stats?.allTimeXp || 0) / 100) + 1} Tracker
          </div>
        </div>
      </div>

      {/* Streaks Display */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-[32px] p-4 flex flex-col items-center justify-center gap-2 shadow-sm">
          <Flame className="w-8 h-8 text-orange-500" />
          <div className="text-2xl font-bold"><AnimatedNumber value={stats?.streak || 0} /> Days</div>
          <div className="text-xs text-muted-foreground font-medium text-center">
            Current Streak
          </div>
        </div>
        
        <div className="bg-card border border-border rounded-[32px] p-4 flex flex-col items-center justify-center gap-2 shadow-sm relative group cursor-pointer">
          <Snowflake className="w-8 h-8 text-blue-400 group-hover:scale-110 transition-transform" />
          <div className="text-2xl font-bold"><AnimatedNumber value={2} /></div>
          <div className="text-xs text-muted-foreground font-medium text-center">
            Streak Freezers<br/>Available
          </div>
        </div>
      </div>

      {/* Trend Analytics */}
      <div className="bg-card border border-border rounded-[32px] p-5 shadow-sm mt-2">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-lg">XP Trends</h3>
          <div className="flex bg-secondary p-1 rounded-full">
            {(['7d', '30d', 'ytd'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                  activeTab === tab 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="h-48 w-full">
          {isLoading ? (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
              Loading trends...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis 
                  dataKey="name" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  dy={10}
                />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--secondary))' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Bar 
                  dataKey="xp" 
                  fill="hsl(var(--primary))" 
                  radius={[4, 4, 4, 4]} 
                  barSize={activeTab === '7d' ? 30 : activeTab === '30d' ? 8 : 4}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
