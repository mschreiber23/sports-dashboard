import { useState, useEffect, useCallback } from 'react';
import { getScoreboard, getTeamSchedule } from '../api/espn';

const CACHE_TTL = 60 * 1000; // 60 seconds — show cached data instantly, refresh in background

function cacheKey(sport, teamId, dateStr) {
  return `tg_${sport}_${teamId}_${dateStr || 'today'}`;
}
function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL * 5) { localStorage.removeItem(key); return null; } // evict stale
    return data;
  } catch { return null; }
}
function writeCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

export default function useTeamGame(sport, teamId, refreshInterval = 30000, dateStr = null) {
  const todayStr = (() => {
    const d = new Date();
    return d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
  })();
  const effectiveDateStr = dateStr || todayStr;
  const ck = cacheKey(sport, teamId, effectiveDateStr);

  // Seed from cache immediately — eliminates the loading blink
  const [game, setGame] = useState(() => readCache(ck));
  const [nextGame, setNextGame] = useState(undefined);
  const [loading, setLoading] = useState(!readCache(ck)); // only show spinner if no cache
  const [error, setError] = useState(null);

  const fetchScoreboard = useCallback(async () => {
    try {
      const events = await getScoreboard(sport, effectiveDateStr);
      const found = events.find((e) =>
        e.competitions?.[0]?.competitors?.some((c) => c.team?.id === String(teamId))
      ) || null;
      setGame(found);
      writeCache(ck, found);
      setError(null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [sport, teamId, effectiveDateStr, ck]);

  useEffect(() => {
    if (!teamId || dateStr) return;
    const now = new Date();
    const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    getTeamSchedule(sport, teamId)
      .then((events) => {
        const upcoming = events.filter((e) => {
          const d = new Date(e.date);
          return d >= now && d <= weekOut;
        });
        setNextGame(upcoming[0] || null);
      })
      .catch(() => setNextGame(null));
  }, [sport, teamId, dateStr]);

  useEffect(() => {
    // Don't reset to loading if we already have cached data
    const cached = readCache(ck);
    if (!cached) setLoading(true);
    fetchScoreboard();
    if (dateStr) return;
    const id = setInterval(fetchScoreboard, refreshInterval);
    return () => clearInterval(id);
  }, [fetchScoreboard, refreshInterval, dateStr]);

  const hasUpcomingGame = nextGame === undefined ? undefined : nextGame !== null;
  return { game, loading, error, hasUpcomingGame, nextGame };
}
