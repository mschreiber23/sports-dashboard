import { useState, useEffect } from 'react';
import { getGameBoxscore } from '../api/espn';

export default function useBoxScore(sport, gameId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!gameId || !sport || sport === 'milb') return; // MiLB has no ESPN data
    setLoading(true);
    setError(null);
    setData(null);
    getGameBoxscore(sport, gameId)
      .then(setData)
      .catch(() => setError('Could not load box score.'))
      .finally(() => setLoading(false));
  }, [sport, gameId]);

  return { data, loading, error };
}
