import { Flame, Snowflake, Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useState, useMemo } from 'react';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  subDays,
  addDays,
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subWeeks,
  subMonths,
  subYears,
  differenceInDays,
  isWithinInterval,
  parseISO
} from 'date-fns';

export function StatsView() {
  const [activeTab, setActiveTab] = useState<'7d' | '30d' | 'ytd'>('7d');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return null;

      // Fetch user_stats for all-time XP and global streak (O(1))
      const { data: userStats } = await supabase
        .from('user_stats')
        .select('total_xp, global_streak, global_streak_last_date, freeze_count')
        .eq('user_id', userId)
        .maybeSingle();

      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      const gsLastDate = userStats?.global_streak_last_date ?? null;

      const allTimeXp = userStats?.total_xp ?? 0;
      const streak = (gsLastDate === todayStr || gsLastDate === yesterdayStr)
        ? (userStats?.global_streak ?? 0)
        : 0;
      const freezeCount = userStats?.freeze_count ?? 0;

      // Bounded 1-year log fetch for chart and period averages
      const { data: habits } = await supabase.from('habits').select('id, base_xp').eq('user_id', userId);
      const xpMap = new Map(habits?.map(h => [h.id, h.base_xp]) || []);

      const oneYearAgo = format(subYears(new Date(), 1), 'yyyy-MM-dd');
      const { data: logs } = await supabase
        .from('habit_logs')
        .select('date, habit_id, xp_earned')
        .eq('user_id', userId)
        .gte('date', oneYearAgo)
        .order('date', { ascending: false });

      const dailyXp = new Map<string, number>();
      (logs || []).forEach(log => {
        const xp = (log.xp_earned !== undefined && log.xp_earned !== null && log.xp_earned > 0)
          ? log.xp_earned
          : (xpMap.get(log.habit_id) || 0);
        if (xp > 0) {
          dailyXp.set(log.date, (dailyXp.get(log.date) || 0) + xp);
        }
      });

      const now = new Date();

      const calculatePeriodStats = (start: Date, end: Date) => {
        let total = 0;
        const days = Math.max(1, differenceInDays(end, start) + 1);
        dailyXp.forEach((xp, dateStr) => {
          const d = parseISO(dateStr);
          if (isWithinInterval(d, { start, end })) {
            total += xp;
          }
        });
        return total / days;
      };

      const avgWeek = calculatePeriodStats(startOfWeek(now), now);
      const prevAvgWeek = calculatePeriodStats(startOfWeek(subWeeks(now, 1)), endOfWeek(subWeeks(now, 1)));

      const avgMonth = calculatePeriodStats(startOfMonth(now), now);
      const prevAvgMonth = calculatePeriodStats(startOfMonth(subMonths(now, 1)), endOfMonth(subMonths(now, 1)));

      const avgYear = calculatePeriodStats(startOfYear(now), now);
      const prevAvgYear = calculatePeriodStats(startOfYear(subYears(now, 1)), endOfYear(subYears(now, 1)));

      const calcDiff = (curr: number, prev: number) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return ((curr - prev) / prev) * 100;
      };

      return {
        allTimeXp,
        streak,
        freezeCount,
        dailyXp,
        avgWeek, diffWeek: calcDiff(avgWeek, prevAvgWeek),
        avgMonth, diffMonth: calcDiff(avgMonth, prevAvgMonth),
        avgYear, diffYear: calcDiff(avgYear, prevAvgYear)
      };
    }
  });

  // Calculate Chart Data based on activeTab
  const chartData = useMemo(() => {
    if (!stats) return [];

    const data = [];

    if (activeTab === '7d') {
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      for (let i = 0; i < 7; i++) {
        const d = addDays(weekStart, i);
        const dateStr = format(d, 'yyyy-MM-dd');
        data.push({ name: format(d, 'EEE'), xp: stats.dailyXp.get(dateStr) || 0 });
      }
    } else {
      const daysToShow = activeTab === '30d' ? 30 : 90;
      for (let i = daysToShow - 1; i >= 0; i--) {
        const d = subDays(new Date(), i);
        const dateStr = format(d, 'yyyy-MM-dd');
        data.push({ name: format(d, 'MMM d'), xp: stats.dailyXp.get(dateStr) || 0 });
      }
    }

    return data;
  }, [stats, activeTab]);


  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-3xl font-black tracking-tight mb-2">Progress</h1>

      {/* Streaks Display */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-[24px] p-4 flex items-center justify-center gap-3 shadow-sm">
          <Flame className="w-6 h-6 text-orange-500" />
          <div className="text-xl font-bold"><AnimatedNumber value={stats?.streak || 0} /></div>
        </div>
        
        <div className="bg-card border border-border rounded-[24px] p-4 flex items-center justify-center gap-3 shadow-sm relative group cursor-pointer">
          <Snowflake className="w-6 h-6 text-blue-400 group-hover:scale-110 transition-transform" />
          <div className="text-xl font-bold"><AnimatedNumber value={stats?.freezeCount ?? 0} /></div>
        </div>
      </div>

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
            Level {Math.floor((stats?.allTimeXp || 0) / 100) + 1}
          </div>
        </div>
      </div>

      {/* Advanced Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Weekly Stats */}
        <StatCard label="Daily Avg (Week)" value={stats?.avgWeek} />
        <TrendCard label="Weekly Change" diff={stats?.diffWeek} />
        
        {/* Monthly Stats */}
        <StatCard label="Daily Avg (Month)" value={stats?.avgMonth} />
        <TrendCard label="Monthly Change" diff={stats?.diffMonth} />
        
        {/* Yearly Stats */}
        <StatCard label="Daily Avg (Year)" value={stats?.avgYear} />
        <TrendCard label="Yearly Change" diff={stats?.diffYear} />
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
              <LineChart data={chartData} margin={{ left: 10, right: 10 }}>
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                  dy={10}
                  padding={{ left: 10, right: 10 }}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--secondary)', strokeWidth: 1, strokeDasharray: "4 4" }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', backgroundColor: 'var(--card)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  labelStyle={{ color: 'var(--foreground)' }}
                  itemStyle={{ color: 'var(--foreground)' }}
                />
                <Line 
                  type="monotone"
                  dataKey="xp" 
                  stroke="#60a5fa" 
                  strokeWidth={3}
                  dot={{ fill: "hsl(var(--card))", stroke: "#60a5fa", strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: "#60a5fa", stroke: "hsl(var(--card))", strokeWidth: 2 }}
                  isAnimationActive={true}
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string, value?: number }) {
  return (
    <div className="bg-card border border-border rounded-[24px] p-4 flex flex-col gap-1 shadow-sm">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="text-2xl font-black text-foreground">
        <AnimatedNumber value={Math.round(value || 0)} />
      </div>
    </div>
  );
}

function TrendCard({ label, diff }: { label: string, diff?: number }) {
  const isPositive = (diff || 0) > 0;
  const isZero = (diff || 0) === 0;
  
  return (
    <div className="bg-card border border-border rounded-[24px] p-4 flex flex-col gap-1 shadow-sm">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className={`flex items-center gap-1.5 text-lg font-black ${
        isZero ? 'text-muted-foreground' : isPositive ? 'text-emerald-500' : 'text-rose-500'
      }`}>
        {isZero ? <Minus className="w-4 h-4" /> : isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        <span>{Math.abs(Math.round(diff || 0))}%</span>
      </div>
    </div>
  );
}
