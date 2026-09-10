import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zdfocpxjsizaqhyiwsff.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_TjSr-VWFlx4GxDRYLS7Yjg_tYI2JjCm';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,      // store session in localStorage
    autoRefreshToken: true,    // refresh JWT before it expires
    detectSessionInUrl: false, // not using magic links / OAuth redirects
    storageKey: 'shribely_auth', // fixed key — immune to Supabase URL format changes
  },
});
