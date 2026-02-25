-- Create custom types
CREATE TYPE habit_type AS ENUM ('positive', 'negative');

-- Create habits table
CREATE TABLE IF NOT EXISTS public.habits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type habit_type NOT NULL DEFAULT 'positive',
    base_xp INTEGER NOT NULL DEFAULT 10,
    metadata_schema JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create habit records (logs for daily completions)
CREATE TABLE IF NOT EXISTS public.habit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    habit_id UUID NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    date DATE NOT NULL, -- The specific day the habit was recorded for
    metadata_values JSONB DEFAULT '{}'::jsonb,
    
    -- Ensure a habit can only be logged once per day per user (unless it's quantifiable, but we'll enforce that via app logic or relax this later if needed)
    UNIQUE(habit_id, date, user_id)
);

-- Set up Row Level Security (RLS)
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;

-- Create Policies for Habits
CREATE POLICY "Users can view their own habits"
    ON public.habits FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own habits"
    ON public.habits FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own habits"
    ON public.habits FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own habits"
    ON public.habits FOR DELETE
    USING (auth.uid() = user_id);

-- Create Policies for Habit Logs
CREATE POLICY "Users can view their own habit logs"
    ON public.habit_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own habit logs"
    ON public.habit_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own habit logs"
    ON public.habit_logs FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own habit logs"
    ON public.habit_logs FOR DELETE
    USING (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger to habits table
CREATE TRIGGER handle_habits_updated_at
    BEFORE UPDATE ON public.habits
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_updated_at();
