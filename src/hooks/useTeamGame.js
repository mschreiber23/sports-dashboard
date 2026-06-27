import { useState, useEffect, useCallback } from 'react';
import { getScoreboard, getTeamSchedule } from '../api/espn';

export default function useTeamGame(sport, teamId, refreshInterval = 30000, dateStr = null) {
  const [game, setGame] = useState(null);
  const [nextGame, setNextGame] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchScoreboard = useCallback(async () => {
    try {
      // Always pass an explicit date so ESPN doesn't return yesterday's finals
      const today = new Date();
      const todayStr = today.getFullYear().toString()
        + String(today.getMonth() + 1).padStart(2, '0')
        + String(today.getDate()).padStart(2, '0');
      const effectiveDateStr = dateStr || todayStr;

      const events = await getScoreboard(sport, effectiveDateStr);
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
  }, [sport, teamId, dateStr]);

  // Only check upcoming games when viewing today (no dateStr)
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
    setLoading(true);
    setGame(null);
    fetchScoreboard();
    // Only auto-refresh when viewing today
    if (dateStr) return;
    const id = setInterval(fetchScoreboard, refreshInterval);
    return () => clearInterval(id);
  }, [fetchScoreboard, refreshInterval, dateStr]);

  const hasUpcomingGame = nextGame === undefined ? undefined : nextGame !== null;
  return { game, loading, error, hasUpcomingGame, nextGame };
}
