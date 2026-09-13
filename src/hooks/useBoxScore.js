import { useState, useEffect, useRef } from 'react';
import { getGameBoxscore } from '../api/espn';

const LIVE_POLL_MS = 15_000; // 15 s — refresh live NFL/NHL/NBA box scores

export default function useBoxScore(sport, gameId) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!gameId || !sport || sport === 'milb') return;

    const stopPolling = () => {
      clearInterval(timerRef.current);
      timerRef.current = null;
    };

    const poll = () =>
      getGameBoxscore(sport, gameId)
        .then(d => {
          if (!mountedRef.current) return;
          setData(d);
          setError(null);

          // Stop polling once game is final
          const state = d?.header?.competitions?.[0]?.status?.type?.state;
          if (state === 'post') stopPolling();
        })
        .catch(() => {
          // Silent background-poll failure — keep timer running
        });

    // Initial fetch (with loading indicator)
    setLoading(true);
    setData(null);
    setError(null);
    getGameBoxscore(sport, gameId)
      .then(d => {
        if (!mountedRef.current) return;
        setData(d);
        setLoading(false);

        const state = d?.header?.competitions?.[0]?.status?.type?.state;
        if (state === 'in') {
          // Game is live → start polling
          timerRef.current = setInterval(poll, LIVE_POLL_MS);
        }
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setError('Could not load box score.');
        setLoading(false);
      });

    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [sport, gameId]);

  return { data, loading, error };
}
