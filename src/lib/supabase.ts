import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseApiKey = import.meta.env.VITE_SUPABASE_API_KEY || 'placeholder_key_to_prevent_crash';

if (supabaseUrl === 'http://127.0.0.1:54321' || supabaseApiKey === 'placeholder_key_to_prevent_crash') {
  console.warn('Supabase URL or API Key is missing. Check your .env variables. Using placeholder values to prevent app crash.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseApiKey);
