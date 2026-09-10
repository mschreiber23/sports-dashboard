import { useState, useEffect } from 'react';
import { getPlayerStats } from '../api/espn';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes for player stats

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
  const ck = `ps_${sport}_${playerId}`;
  const [stats, setStats] = useState(() => readStatsCache(ck));
  const [loading, setLoading] = useState(!readStatsCache(ck));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!playerId) return;
    const cached = readStatsCache(ck);
    if (!cached) { setLoading(true); setError(null); }

    getPlayerStats(sport, playerId)
      .then((data) => {
        setStats(data);
        try { localStorage.setItem(ck, JSON.stringify({ ts: Date.now(), data })); } catch {}
      })
      .catch(() => setError('Could not load player stats.'))
      .finally(() => setLoading(false));
  }, [sport, playerId]);

  return { stats, loading, error };
}
