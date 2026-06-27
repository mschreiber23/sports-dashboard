import { useState, useEffect, useCallback } from 'react';
import { getScoreboard } from '../api/espn';

export default function useLiveScores(sport, favoriteTeamId, refreshInterval = 30000) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetch = useCallback(async () => {
    try {
      const d = new Date();
      const todayStr = d.getFullYear().toString()
        + String(d.getMonth() + 1).padStart(2, '0')
        + String(d.getDate()).padStart(2, '0');
      const events = await getScoreboard(sport, todayStr);
      setGames(events);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError('Unable to load scores. ESPN API may be rate-limited.');
    } finally {
      setLoading(false);
    }
  }, [sport]);

  useEffect(() => {
    setLoading(true);
    fetch();
    const id = setInterval(fetch, refreshInterval);
    return () => clearInterval(id);
  }, [fetch, refreshInterval]);

  const myTeamGames = favoriteTeamId
    ? games.filter((g) =>
        g.competitions?.[0]?.competitors?.some(
          (c) => c.team?.id === String(favoriteTeamId)
        )
      )
    : games;

  return { games, myTeamGames, loading, error, lastUpdated, refresh: fetch };
}
