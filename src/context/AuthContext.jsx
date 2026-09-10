import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(undefined); // undefined = still loading
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // onAuthStateChange fires INITIAL_SESSION synchronously on mount in Supabase JS v2,
    // which includes the persisted/refreshed token from localStorage.
    // It also handles TOKEN_REFRESHED, SIGNED_IN, SIGNED_OUT automatically.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Belt-and-suspenders: also call getSession in case INITIAL_SESSION was missed
    // (some environments / older browsers may not fire it reliably)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mountedRef.current) return;
      // Only update if we're still in the loading state (onAuthStateChange may have
      // already resolved it — whichever wins sets loading=false first)
      setUser(u => u === undefined ? (session?.user ?? null) : u);
      setLoading(false);
    }).catch(() => {
      if (mountedRef.current) setLoading(false);
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
