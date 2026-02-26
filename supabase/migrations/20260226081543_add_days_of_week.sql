-- Add frequency column to habits table to store selected days of the week (0 = Sunday, 1 = Monday, etc.)
ALTER TABLE public.habits 
ADD COLUMN IF NOT EXISTS frequency INTEGER[] DEFAULT '{0,1,2,3,4,5,6}';
