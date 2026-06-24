import { useState, useEffect } from 'react';
import { getPlayerStats } from '../api/espn';

export default function usePlayerStats(sport, playerId) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!playerId) return;
    setLoading(true);
    setError(null);

    getPlayerStats(sport, playerId)
      .then((data) => setStats(data))
      .catch(() => setError('Could not load player stats.'))
      .finally(() => setLoading(false));
  }, [sport, playerId]);

  return { stats, loading, error };
}
