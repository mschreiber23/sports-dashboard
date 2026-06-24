import { useState, useEffect, useCallback } from 'react';
import { getScoreboard, getTeamSchedule } from '../api/espn';

export default function useTeamGame(sport, teamId, refreshInterval = 30000) {
  const [game, setGame] = useState(null);
  const [nextGame, setNextGame] = useState(undefined); // undefined = not yet checked
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchScoreboard = useCallback(async () => {
    try {
      const events = await getScoreboard(sport);
      const found = events.find((e) =>
        e.competitions?.[0]?.competitors?.some((c) => c.team?.id === String(teamId))
      );
      setGame(found || null);
      setError(null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [sport, teamId]);

  // Check for any game in the next 7 days (runs once on mount)
  useEffect(() => {
    if (!teamId) return;
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
  }, [sport, teamId]);

  useEffect(() => {
    setLoading(true);
    setGame(null);
    fetchScoreboard();
    const id = setInterval(fetchScoreboard, refreshInterval);
    return () => clearInterval(id);
  }, [fetchScoreboard, refreshInterval]);

  // hasUpcomingGame: true = yes, false = no games this week, undefined = still loading
  const hasUpcomingGame = nextGame === undefined ? undefined : nextGame !== null;

  return { game, loading, error, hasUpcomingGame, nextGame };
}
