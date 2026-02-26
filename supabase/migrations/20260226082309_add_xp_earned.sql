-- Add xp_earned to habit_logs
ALTER TABLE public.habit_logs
ADD COLUMN xp_earned INTEGER NOT NULL DEFAULT 0;
