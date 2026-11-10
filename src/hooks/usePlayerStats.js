import { useState, useEffect } from 'react';
import { activeSeasonYear, getPlayerGameLog, getPlayerStats } from '../api/espn';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes for player stats
const REFRESH_MS = 30 * 1000;

function readStatsCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

export default function usePlayerStats(sport, playerId) {
  const year = activeSeasonYear(sport);
  const ck = `ps2_${sport}_${playerId}_${year}`;
  const [stats, setStats] = useState(() => readStatsCache(ck));
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(!readStatsCache(ck));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!playerId) return undefined;
    let cancelled = false;
    let pending = false;
    const cached = readStatsCache(ck);
    setStats(cached);
    setLog(null);
    setError(null);
    setLoading(!cached);

    const load = (initial) => {
      if (pending) return undefined;
      pending = true;
      return Promise.all([
        getPlayerStats(sport, playerId),
        getPlayerGameLog(sport, playerId).catch(() => null),
      ]).then(([data, gameLog]) => {
        if (cancelled) return;
        setStats(data);
        if (gameLog) setLog(gameLog);
        setError(null);
        try { localStorage.setItem(ck, JSON.stringify({ ts: Date.now(), data })); } catch { /* ignore quota */ }
      }).catch(() => {
        if (!cancelled && initial && !cached) setError('Could not load player stats.');
      }).finally(() => {
        pending = false;
        if (!cancelled && initial) setLoading(false);
      });
    };

    load(true);
    const timer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') load(false);
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sport, playerId, ck]);

  return { stats, log, loading, error };
}
