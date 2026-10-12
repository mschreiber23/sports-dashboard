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
  const dirtyRef = useRef(false);

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
        // A reorder started before this response came back. Keep that order;
        // the save effect persists it once synced flips on.
        if (dirtyRef.current) {
          setSynced(true);
          return;
        }
        if (data && Array.isArray(data.preferences?.teams)) {
          const prefs = data.preferences;
          setFavoritesState({
            teams: prefs.teams,
            players: Array.isArray(prefs.players) ? prefs.players : [],
          });
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
        .select('preferences')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) { console.error('Save prefs error:', error); return null; }
          const prev = data?.preferences && typeof data.preferences === 'object' ? data.preferences : {};
          const preferences = {
            ...prev,
            teams: newFavs.teams || [],
            players: newFavs.players || [],
          };
          return supabase
            .from('user_preferences')
            .upsert({ user_id: userId, preferences, sport_order: newOrder, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        })
        .then((result) => { if (result?.error) console.error('Save prefs error:', result.error); });
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

  // A reorder that happened before the server prefs loaded still needs to be saved.
  useEffect(() => {
    if (!userId || !synced || !dirtyRef.current) return;
    scheduleSave(favorites, sportOrder);
  }, [userId, synced, scheduleSave, favorites, sportOrder]);

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

  // Patch color/alternateColor for a stored team (used when game data has fresher colors)
  const updateTeamColor = (teamId, sport, color, alternateColor) =>
    setFavorites((f) => ({
      ...f,
      teams: f.teams.map((t) =>
        t.team.id === teamId && t.sport === sport
          ? { ...t, team: { ...t.team, color, alternateColor } }
          : t
      ),
    }));

  // Move a team among the homepage list (MiLB entries stay put and don't steal the slot).
  const reorderTeam = (teamId, sport, dir) => {
    dirtyRef.current = true;
    setFavorites((f) => {
      const teams = [...f.teams];
      const visibleIdxs = teams
        .map((t, i) => (t.sport !== 'milb' ? i : -1))
        .filter((i) => i >= 0);
      const pos = visibleIdxs.findIndex((i) => String(teams[i].team.id) === String(teamId) && teams[i].sport === sport);
      const targetPos = pos + dir;
      if (pos < 0 || targetPos < 0 || targetPos >= visibleIdxs.length) return f;
      const a = visibleIdxs[pos];
      const b = visibleIdxs[targetPos];
      const next = [...teams];
      [next[a], next[b]] = [next[b], next[a]];
      return { ...f, teams: next };
    });
  };

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
      addTeam, removeTeam, reorderTeam, updateTeamColor,
      addPlayer, removePlayer, reorderPlayer, togglePlayerVisibility,
      reorderSport,
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export const useFavorites = () => useContext(FavoritesContext);
