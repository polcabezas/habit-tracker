import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DateNavigator } from '@/components/DateNavigator';
import { HabitCard, type Habit } from '@/components/HabitCard';
import { addDays } from 'date-fns';
import { Confetti, type ConfettiRef } from '@/components/magicui/confetti';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { supabase } from '@/lib/supabase';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function JournalView() {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completedHabitIds, setCompletedHabitIds] = useState<Set<string>>(new Set());
  const [habitMetadata, setHabitMetadata] = useState<Record<string, Record<string, any>>>({});
  const [dailyScore, setDailyScore] = useState(0);
  const confettiRef = useRef<ConfettiRef>(null);

  // 1. Fetch data query
  const { data } = useQuery({
    queryKey: ['journal', currentDate.toISOString().split('T')[0]],
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
      
      const mappedHabits: Habit[] = (habitsData || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        base_xp: row.base_xp,
        type: row.type,
        metadataSchema: row.metadata_schema as any
      }));
      
      // Fetch logs for the 7-day window
      const startDate = addDays(currentDate, -3).toISOString().split('T')[0];
      const endDate = addDays(currentDate, 3).toISOString().split('T')[0];
      
      const { data: logs, error: logsError } = await supabase
        .from('habit_logs')
        .select('habit_id, metadata_values, date')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate);

      if (logsError) throw logsError;

      const completedIds = new Set<string>();
      const initialMetadata: Record<string, Record<string, any>> = {};
      const loggedDates = new Set<string>();

      const dateStr = currentDate.toISOString().split('T')[0];

      (logs || []).forEach((l: any) => {
        loggedDates.add(l.date as string);
        if (l.date === dateStr) {
          completedIds.add(l.habit_id as string);
          if (l.metadata_values) {
            initialMetadata[l.habit_id] = l.metadata_values;
          }
        }
      });
      
      return { habits: mappedHabits, completedIds, initialMetadata, loggedDates };
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
        if (data.completedIds.has(h.id)) score += h.base_xp;
      });
      setDailyScore(score);
    }
  }, [data]);

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
              } else if (newMeta[field.id] === undefined && field.type === 'number') {
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
        setDailyScore(prevScore => prevScore + (completed ? habit.base_xp : -habit.base_xp));
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error("Must be logged in to save.");

      const dateStr = currentDate.toISOString().split('T')[0];

      await supabase
        .from('habit_logs')
        .delete()
        .eq('user_id', userId)
        .eq('date', dateStr);

      const logsToInsert = Array.from(completedHabitIds).map(habitId => ({
        user_id: userId,
        habit_id: habitId,
        date: dateStr,
        metadata_values: habitMetadata[habitId] || {}
      }));

      if (logsToInsert.length > 0) {
         const { error } = await supabase.from('habit_logs').insert(logsToInsert);
         if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal'] });
      fireConfetti();
    },
    onError: (err) => {
      console.error("Failed to save habits:", err);
      alert("Failed to save progress: " + err.message);
    }
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  return (
    <div className="relative isolate flex flex-col min-h-screen pb-24 animate-in fade-in duration-500">
      
      {/* Background Gradient matching Whoop (Tan -> Dark) */}
      <div className="absolute top-0 left-1/2 w-[100vw] -translate-x-1/2 h-[400px] bg-gradient-to-b from-[#B89C78]/40 via-[#B89C78]/10 to-transparent pointer-events-none z-[-1]" />

      {/* Date Navigator */}
      <div className="mt-6">
        <DateNavigator 
          currentDate={currentDate} 
          onPrevDay={handlePrevDay} 
          onNextDay={handleNextDay} 
          onSelectDate={handleSelectDate}
          onBackToToday={handleBackToToday}
          loggedDates={data?.loggedDates}
        />
      </div>

      {/* Daily Score Hero */}
      <section className="flex flex-col items-center justify-center py-8 mt-4 animate-in zoom-in-95 duration-300 relative">
        <h2 className="text-foreground/60 text-xs font-bold uppercase tracking-[0.2em] mb-2">Daily Score</h2>
        <div className="text-7xl font-black text-foreground drop-shadow-sm flex items-start gap-1">
          <AnimatedNumber value={dailyScore} />
          <span className="text-2xl font-bold text-foreground/50 tracking-wider mt-2">XP</span>
        </div>
      </section>

      {/* Habit List */}
      <section className="flex flex-col pb-8">
        {habits.map(habit => (
          <HabitCard 
            key={`${habit.id}-${currentDate.toISOString().split('T')[0]}`}
            habit={habit}
            isCompleted={completedHabitIds.has(habit.id)}
            metadataValues={habitMetadata[habit.id]}
            onToggle={toggleHabit}
            onMetadataChange={handleMetadataChange}
          />
        ))}
        {habits.length === 0 && (
          <div className="text-center text-muted-foreground p-8">
            No habits active for this day.
          </div>
        )}
      </section>

      {/* Save Button */}
      <div className="fixed bottom-[80px] left-0 right-0 max-w-md mx-auto z-10">
        <div className="px-4 w-full">
          <button 
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="w-full bg-foreground text-background font-black uppercase tracking-widest py-4 rounded-[32px] shadow-lg hover:scale-[1.02] transition-transform active:scale-95 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Journal'}
          </button>
        </div>
      </div>

      {createPortal(
        <Confetti
          ref={confettiRef}
          className="pointer-events-none fixed inset-0 z-[100] h-screen w-screen"
          manualstart
        />,
        document.body
      )}
    </div>
  );
}
