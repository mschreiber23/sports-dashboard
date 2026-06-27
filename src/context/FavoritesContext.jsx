import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

const FavoritesContext = createContext(null);

const DEFAULT_SPORT_ORDER = ['mlb', 'nba', 'nfl', 'nhl'];

export const DEFAULT_FAVORITES = {
  teams: [],
  players: [],
};

/* ── Local storage helpers (fallback when logged out) ── */
const LOCAL_KEY = 'sports_dashboard_favorites_v4';
const SPORT_ORDER_KEY = 'sports_dashboard_sport_order';

function readLocal(key, fallback) {
  try {
    const v = localStorage.getItem(key) || sessionStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

function writeLocal(key, value) {
  const json = JSON.stringify(value);
  try { localStorage.setItem(key, json); } catch {}
  try { sessionStorage.setItem(key, json); } catch {}
}

export function FavoritesProvider({ children, userId }) {
  const [favorites, setFavoritesState] = useState(() => readLocal(LOCAL_KEY, DEFAULT_FAVORITES));
  const [sportOrder, setSportOrderState] = useState(() => readLocal(SPORT_ORDER_KEY, DEFAULT_SPORT_ORDER));
  const [synced, setSynced] = useState(false);
  const saveTimer = useRef(null);

  /* ── Load from Supabase on login ── */
  useEffect(() => {
    if (!userId) {
      // Logged out — use localStorage
      setFavoritesState(readLocal(LOCAL_KEY, DEFAULT_FAVORITES));
      setSportOrderState(readLocal(SPORT_ORDER_KEY, DEFAULT_SPORT_ORDER));
      setSynced(false);
      return;
    }

    supabase
      .from('user_preferences')
      .select('preferences, sport_order')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('Load prefs error:', error); return; }
        if (data) {
          setFavoritesState(data.preferences || DEFAULT_FAVORITES);
          setSportOrderState(data.sport_order || DEFAULT_SPORT_ORDER);
        } else {
          // First time — migrate from localStorage if data exists
          const local = readLocal(LOCAL_KEY, null);
          if (local) setFavoritesState(local);
          const localOrder = readLocal(SPORT_ORDER_KEY, null);
          if (localOrder) setSportOrderState(localOrder);
        }
        setSynced(true);
      });
  }, [userId]);

  /* ── Save to Supabase (debounced 1s) ── */
  const scheduleSave = useCallback((newFavs, newOrder) => {
    if (!userId || !synced) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase
        .from('user_preferences')
        .upsert({ user_id: userId, preferences: newFavs, sport_order: newOrder, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        .then(({ error }) => { if (error) console.error('Save prefs error:', error); });
    }, 1000);
  }, [userId, synced]);

  const setFavorites = useCallback((updater) => {
    setFavoritesState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      writeLocal(LOCAL_KEY, next);
      scheduleSave(next, sportOrder);
      return next;
    });
  }, [scheduleSave, sportOrder]);

  const setSportOrder = useCallback((updater) => {
    setSportOrderState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      writeLocal(SPORT_ORDER_KEY, next);
      scheduleSave(favorites, next);
      return next;
    });
  }, [scheduleSave, favorites]);

  /* ── CRUD helpers ── */
  const reorderSport = (from, to) => setSportOrder((prev) => {
    const next = [...prev];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    return next;
  });

  const addTeam = (sport, team) =>
    setFavorites((f) => {
      if (f.teams.some((t) => t.team.id === team.id && t.sport === sport)) return f;
      return { ...f, teams: [...f.teams, { sport, team }] };
    });

  const removeTeam = (teamId, sport) =>
    setFavorites((f) => ({ ...f, teams: f.teams.filter((t) => !(t.team.id === teamId && t.sport === sport)) }));

  const reorderTeam = (from, to) =>
    setFavorites((f) => {
      const teams = [...f.teams];
      const [m] = teams.splice(from, 1);
      teams.splice(to, 0, m);
      return { ...f, teams };
    });

  const addPlayer = (player) =>
    setFavorites((f) => {
      if (f.players.some((p) => p.id === player.id)) return f;
      return { ...f, players: [...f.players, player] };
    });

  const removePlayer = (playerId) =>
    setFavorites((f) => ({ ...f, players: f.players.filter((p) => p.id !== playerId) }));

  const reorderPlayer = (from, to) =>
    setFavorites((f) => {
      const players = [...f.players];
      const [m] = players.splice(from, 1);
      players.splice(to, 0, m);
      return { ...f, players };
    });

  const togglePlayerVisibility = (playerId) =>
    setFavorites((f) => ({
      ...f,
      players: f.players.map((p) =>
        p.id === playerId ? { ...p, hidden: !p.hidden } : p
      ),
    }));

  return (
    <FavoritesContext.Provider value={{
      favorites, sportOrder,
      addTeam, removeTeam, reorderTeam,
      addPlayer, removePlayer, reorderPlayer, togglePlayerVisibility,
      reorderSport,
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export const useFavorites = () => useContext(FavoritesContext);
