import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { DateNavigator } from '@/components/DateNavigator';
import { HabitCard, type Habit } from '@/components/HabitCard';
import { addDays, format, subDays } from 'date-fns';
import { calculateHabitXP, calculateGradientMultiplier } from '@/lib/scoring';
import { Confetti, type ConfettiRef } from '@/components/magicui/confetti';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { supabase } from '@/lib/supabase';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction
} from '@/components/ui/alert-dialog';
import flameAnimationSvg     from '@/assets/flame-animation.svg?raw';
import snowflakeAnimationSvg from '@/assets/snowflake-animation.svg?raw';
import newStreakAnimationSvg from '@/assets/new-streak-animation.svg?raw';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function JournalView() {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completedHabitIds, setCompletedHabitIds] = useState<Set<string>>(new Set());
  const [habitMetadata, setHabitMetadata] = useState<Record<string, Record<string, any>>>({});
  const [dailyScore, setDailyScore] = useState(0);
  const [resetNonce, setResetNonce] = useState(0);
  const [dialogState, setDialogState] = useState<null | 'frozen' | 'lost' | 'increased'>(null);
  const confettiRef = useRef<ConfettiRef>(null);

  // 1. Fetch data query
  const { data } = useQuery({
    queryKey: ['journal', format(currentDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      
      if (!userId) {
        return { habits: [], completedIds: new Set<string>(), loggedDates: new Set<string>() };
      }

      // Fetch all habits for this user
      const { data: habitsData, error: habitsError } = await supabase
        .from('habits')
        .select('*')
        .eq('user_id', userId);
        
      if (habitsError) throw habitsError;
      
      const currentDayOfWeek = currentDate.getDay();
      
      const mappedHabits: Habit[] = (habitsData || [])
        .filter((row: any) => {
          if (!row.frequency || !Array.isArray(row.frequency)) return true;
          return row.frequency.includes(currentDayOfWeek);
        })
        .map((row: any) => ({
          id: row.id,
          name: row.name,
          base_xp: row.base_xp,
          type: row.type,
          metadataSchema: row.metadata_schema as any,
          frequency: row.frequency
        }));
      
      // Fetch all logs to accurately calculate streaks
      const { data: logs, error: logsError } = await supabase
        .from('habit_logs')
        .select('habit_id, metadata_values, date, xp_earned')
        .eq('user_id', userId)
        .order('date', { ascending: false });

      if (logsError) throw logsError;

      const completedIds = new Set<string>();
      const initialMetadata: Record<string, Record<string, any>> = {};
      const loggedDates = new Set<string>();

      const dateStr = format(currentDate, 'yyyy-MM-dd');
      const logsByHabit = new Map<string, Set<string>>();
      const savedXpToday: Record<string, number> = {};

      (logs || []).forEach((l: any) => {
        loggedDates.add(l.date as string);
        
        if (!logsByHabit.has(l.habit_id)) logsByHabit.set(l.habit_id, new Set());
        logsByHabit.get(l.habit_id)!.add(l.date as string);
        
        if (l.date === dateStr) {
          completedIds.add(l.habit_id as string);
          if (l.metadata_values) {
            initialMetadata[l.habit_id] = l.metadata_values;
          }
          if (l.xp_earned !== undefined && l.xp_earned !== null) {
            savedXpToday[l.habit_id] = l.xp_earned;
          }
        }
      });
      
      // Calculate streak as of yesterday for each habit
      const streakYesterday: Record<string, number> = {};
      mappedHabits.forEach(h => {
        let streak = 0;
        let checkDate = addDays(currentDate, -1);
        const habitLogs = logsByHabit.get(h.id);
        if (habitLogs) {
          while (true) {
            const dStr = format(checkDate, 'yyyy-MM-dd');
            if (habitLogs.has(dStr)) {
              streak++;
              checkDate = subDays(checkDate, 1);
            } else {
              break;
            }
          }
        }
        streakYesterday[h.id] = streak;
      });
      
      return { habits: mappedHabits, completedIds, initialMetadata, loggedDates, streakYesterday, savedXpToday };
    }
  });

  // Keep local state in sync to allow optimistic offline toggling before saving
  useEffect(() => {
    if (data) {
      setHabits(data.habits);
      setCompletedHabitIds(data.completedIds);
      setHabitMetadata(data.initialMetadata || {});
      
      let score = 0;
      data.habits.forEach(h => {
        if (data.completedIds.has(h.id)) {
            const streak = data.streakYesterday?.[h.id] || 0;
            const xpEarned = data.savedXpToday?.[h.id] ??
              calculateHabitXP(
                { base_xp: h.base_xp, type: h.type, metadataSchema: h.metadataSchema },
                data.initialMetadata?.[h.id] || {},
                streak
              );
            score += xpEarned;
        }
      });
      setDailyScore(score);
    }
  }, [data]);

  // Entrance streak check — once per day
  useEffect(() => {
    if (!data?.loggedDates) return;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (format(currentDate, 'yyyy-MM-dd') !== todayStr) return;
    if (localStorage.getItem('lastStreakDialogDate') === todayStr) return;

    localStorage.setItem('lastStreakDialogDate', todayStr);

    if (data.loggedDates.has(todayStr)) return;

    const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const twoDaysStr   = format(subDays(new Date(), 2), 'yyyy-MM-dd');

    if (!data.loggedDates.has(yesterdayStr) && !data.loggedDates.has(twoDaysStr)) {
      setDialogState('lost');
    } else if (!data.loggedDates.has(yesterdayStr)) {
      setDialogState('frozen');
    }
  }, [data, currentDate]);

  const handlePrevDay = () => setCurrentDate(prev => addDays(prev, -1));
  const handleNextDay = () => setCurrentDate(prev => addDays(prev, 1));
  const handleSelectDate = (date: Date) => setCurrentDate(date);
  const handleBackToToday = () => setCurrentDate(new Date());

  const handleMetadataChange = (habitId: string, fieldId: string, value: any) => {
    setHabitMetadata(prev => ({
      ...prev,
      [habitId]: {
        ...(prev[habitId] || {}),
        [fieldId]: value
      }
    }));
  };

  const toggleHabit = (id: string, completed: boolean) => {
    setCompletedHabitIds(prev => {
      const isCurrentlyCompleted = prev.has(id);
      
      // If the state isn't actually changing, do nothing
      if (isCurrentlyCompleted === completed) {
        return prev;
      }

      const newSet = new Set(prev);
      if (completed) {
        newSet.add(id);
        
        // Initialize metadata with defaults if checking
        const habit = habits.find(h => h.id === id);
        if (habit && habit.metadataSchema && habit.metadataSchema.length > 0) {
          setHabitMetadata(pm => {
            const currentHabitMeta = pm[id] || {};
            const newMeta = { ...currentHabitMeta };
            let changed = false;
            
            habit.metadataSchema?.forEach(field => {
              if (newMeta[field.id] === undefined && field.defaultValue !== undefined && field.defaultValue !== '') {
                newMeta[field.id] = field.type === 'number' ? Number(field.defaultValue) : field.defaultValue;
                changed = true;
              } else if (newMeta[field.id] === undefined && (field.type === 'number' || field.type === 'duration')) {
                newMeta[field.id] = 0;
                changed = true;
              } else if (newMeta[field.id] === undefined && field.type === 'boolean') {
                newMeta[field.id] = false;
                changed = true;
              }
            });
            
            if (changed) {
              return { ...pm, [id]: newMeta };
            }
            return pm;
          });
        }
      } else {
        newSet.delete(id);
      }
      
      const habit = habits.find(h => h.id === id);
      if (habit) {
        const streak = data?.streakYesterday?.[id] || 0;
        const signedXp = data?.savedXpToday?.[id] ??
          calculateHabitXP(
            { base_xp: habit.base_xp, type: habit.type, metadataSchema: habit.metadataSchema },
            habitMetadata[id] || {},
            streak
          );
        setDailyScore(prevScore => prevScore + (completed ? signedXp : -signedXp));
      }

      return newSet;
    });
  };

  const fireConfetti = () => {
    const duration = 2500;
    const end = Date.now() + duration;

    const frame = () => {
      confettiRef.current?.fire({
        particleCount: 4, angle: 270, spread: 90, origin: { x: 0.1, y: -0.1 },
      });
      confettiRef.current?.fire({
        particleCount: 5, angle: 270, spread: 120, origin: { x: 0.5, y: -0.1 },
      });
      confettiRef.current?.fire({
        particleCount: 4, angle: 270, spread: 90, origin: { x: 0.9, y: -0.1 },
      });

      if (Date.now() < end) requestAnimationFrame(frame);
    };
    
    frame();
  };

  const hasChanges = useMemo(() => {
    if (!data) return false;

    if (completedHabitIds.size !== data.completedIds.size) return true;
    for (const id of completedHabitIds) {
      if (!data.completedIds.has(id)) return true;
    }

    const initialMeta = data.initialMetadata || {};
    const currentMeta = habitMetadata || {};
    
    const allHabitIds = new Set([...Object.keys(initialMeta), ...Object.keys(currentMeta)]);
    for (const habitId of allHabitIds) {
      const initial = initialMeta[habitId] || {};
      const current = currentMeta[habitId] || {};
      
      const allFieldIds = new Set([...Object.keys(initial), ...Object.keys(current)]);
      for (const fieldId of allFieldIds) {
        if (initial[fieldId] !== current[fieldId]) {
          return true;
        }
      }
    }

    return false;
  }, [completedHabitIds, habitMetadata, data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error("Must be logged in to save.");

      const dateStr = format(currentDate, 'yyyy-MM-dd');

      await supabase
        .from('habit_logs')
        .delete()
        .eq('user_id', userId)
        .eq('date', dateStr);

      const logsToInsert = Array.from(completedHabitIds).map(habitId => {
        const habit = habits.find(h => h.id === habitId);
        const base_xp = habit?.base_xp || 10;
        const streak = data?.streakYesterday?.[habitId] || 0;
        const xp_earned = calculateHabitXP(
          { base_xp, type: habit?.type ?? 'positive', metadataSchema: habit?.metadataSchema },
          habitMetadata[habitId] || {},
          streak
        );

        return {
          user_id: userId,
          habit_id: habitId,
          date: dateStr,
          metadata_values: habitMetadata[habitId] || {},
          xp_earned: xp_earned
        };
      });

      if (logsToInsert.length > 0) {
         const { error } = await supabase.from('habit_logs').insert(logsToInsert);
         if (error) throw error;
      }
    },
    onSuccess: async () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      if (format(currentDate, 'yyyy-MM-dd') === todayStr) {
        const yesterdayStr = format(subDays(currentDate, 1), 'yyyy-MM-dd');
        if (data?.loggedDates.has(yesterdayStr)) {
          setDialogState('increased');
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['journal'] }),
        queryClient.invalidateQueries({ queryKey: ['stats'] }),
      ]);
      fireConfetti();
    },
    onError: (err) => {
      console.error("Failed to save habits:", err);
      alert("Failed to save progress: " + err.message);
    }
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error("Must be logged in to clear.");

      const dateStr = format(currentDate, 'yyyy-MM-dd');

      const { error } = await supabase
        .from('habit_logs')
        .delete()
        .eq('user_id', userId)
        .eq('date', dateStr);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal'] });
      setCompletedHabitIds(new Set());
      setHabitMetadata({});
      setDailyScore(0);
      setResetNonce(prev => prev + 1);
    },
    onError: (err) => {
      console.error("Failed to clear habits:", err);
      alert("Failed to clear journal: " + err.message);
    }
  });

  const handleClearDay = () => {
    clearMutation.mutate();
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleRestore = () => {
    if (data) {
      setHabits(data.habits);
      setCompletedHabitIds(data.completedIds);
      setHabitMetadata(data.initialMetadata || {});
      
      let score = 0;
      data.habits.forEach(h => {
        if (data.completedIds.has(h.id)) {
          score += data.savedXpToday?.[h.id] ??
            calculateHabitXP(
              { base_xp: h.base_xp, type: h.type, metadataSchema: h.metadataSchema },
              data.initialMetadata?.[h.id] || {},
              data.streakYesterday?.[h.id] || 0
            );
        }
      });
      setDailyScore(score);
      setResetNonce(prev => prev + 1);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Date Navigator */}
      <div className="mt-2">
        <DateNavigator 
          currentDate={currentDate} 
          onPrevDay={handlePrevDay} 
          onNextDay={handleNextDay} 
          onSelectDate={handleSelectDate}
          onBackToToday={handleBackToToday}
          onClearDay={handleClearDay}
          loggedDates={data?.loggedDates}
        />
      </div>

      {/* Daily Score Hero */}
      <section className="flex flex-col items-center justify-center pt-2 pb-6 animate-in zoom-in-95 duration-300 relative">
        <h2 className="text-foreground/60 text-xs font-bold uppercase tracking-[0.2em] mb-1">Daily Score</h2>
        <div className="text-7xl font-black text-foreground drop-shadow-sm flex items-start gap-1 -mt-2">
          <AnimatedNumber value={dailyScore} />
          <span className="text-2xl font-bold text-foreground/50 tracking-wider mt-2">XP</span>
        </div>
      </section>

      {/* Habit List */}
      <section className="flex flex-col pb-8">
        {habits.map(habit => {
          const streak = data?.streakYesterday?.[habit.id] || 0;
          const currentMeta = habitMetadata[habit.id] || {};
          const gradientMultiplier = calculateGradientMultiplier(habit.metadataSchema ?? [], currentMeta);
          const xp_earned = data?.savedXpToday?.[habit.id] ??
            calculateHabitXP(
              { base_xp: habit.base_xp, type: habit.type, metadataSchema: habit.metadataSchema },
              currentMeta,
              streak
            );
          return (
            <HabitCard
              key={`${habit.id}-${format(currentDate, 'yyyy-MM-dd')}-${resetNonce}`}
              habit={habit}
              isCompleted={completedHabitIds.has(habit.id)}
              metadataValues={currentMeta}
              onToggle={toggleHabit}
              onMetadataChange={handleMetadataChange}
              streak={streak}
              xpEarned={xp_earned}
              gradientMultiplier={gradientMultiplier}
            />
          );
        })}
        {habits.length === 0 && (
          <div className="text-center text-muted-foreground p-8">
            No habits active for this day.
          </div>
        )}
      </section>

      {/* Save Button */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-0 right-0 max-w-md mx-auto z-10"
          >
            <div className="px-4 w-full flex gap-3">
              <button 
                onClick={handleRestore}
                className="flex-shrink-0 px-4 bg-secondary text-secondary-foreground font-black uppercase tracking-widest py-4 rounded-[32px] shadow-lg hover:scale-[1.02] transition-transform active:scale-95 text-xs sm:text-sm"
              >
                Restore Values
              </button>
              <button 
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex-grow bg-foreground text-background font-black uppercase tracking-widest py-4 rounded-[32px] shadow-lg hover:scale-[1.02] transition-transform active:scale-95 disabled:opacity-50 text-xs sm:text-sm"
              >
                {saveMutation.isPending ? 'Saving...' : 'Save Journal'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {createPortal(
        <Confetti
          ref={confettiRef}
          className="pointer-events-none fixed inset-0 z-[100] h-screen w-screen"
          manualstart
        />,
        document.body
      )}

      <AlertDialog open={dialogState !== null} onOpenChange={() => setDialogState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-center sm:text-center sm:place-items-center">
            <div className="w-full flex justify-center mb-2 overflow-visible">
              {dialogState === 'increased' && <div className="h-52 overflow-visible" dangerouslySetInnerHTML={{ __html: flameAnimationSvg }} />}
              {dialogState === 'frozen'    && <div className="h-52 overflow-visible" dangerouslySetInnerHTML={{ __html: snowflakeAnimationSvg }} />}
              {dialogState === 'lost'      && <div className="h-52 overflow-visible" dangerouslySetInnerHTML={{ __html: newStreakAnimationSvg }} />}
            </div>
            <AlertDialogTitle className="text-2xl w-full text-center">
              {dialogState === 'increased' && 'Streak On Fire!'}
              {dialogState === 'frozen'    && 'Streak at Risk'}
              {dialogState === 'lost'      && 'Time to Rise'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base text-center whitespace-pre-line w-full">
              {dialogState === 'increased' && "You're on a roll!\nAnother day crushed — your streak is growing stronger.\nDon't stop now!"}
              {dialogState === 'frozen'    && "You're just one log away from keeping your streak alive.\nShow up today — that's all it takes!"}
              {dialogState === 'lost'      && "Every champion has a comeback story.\nToday is day one of your next streak.\nMake it count!"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-col">
            <AlertDialogAction className="w-full" onClick={() => setDialogState(null)}>Let's go!</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
