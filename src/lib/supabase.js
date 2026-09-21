import { createClient } from '@supabase/supabase-js';
import { idbStorage } from './idbStorage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zdfocpxjsizaqhyiwsff.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_TjSr-VWFlx4GxDRYLS7Yjg_tYI2JjCm';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    // Use IndexedDB on iOS PWA — localStorage can be wiped on force-close,
    // but IndexedDB persists reliably in standalone (home screen) mode.
    storage: idbStorage,
    storageKey: 'shribely_auth',
  },
});
