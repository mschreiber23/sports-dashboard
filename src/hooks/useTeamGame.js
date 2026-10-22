import { useState, useEffect, useCallback } from 'react';
import { getScoreboard, getTeamSchedule } from '../api/espn';
import { getNflWeekGames, getNflWeekInfo } from '../api/nfl';
import { sportsDayStr } from '../utils/sportsDay';
import { gameOnDay, selectUpcomingGames } from '../utils/upcomingGames';

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

function ymdToLocalDate(ymd) {
  return new Date(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(4, 6)) - 1,
    Number(ymd.slice(6, 8)),
    12, 0, 0, 0,
  );
}

export default function useTeamGame(sport, teamId, refreshInterval = 30000, dateStr = null) {
  // Null date means the today view: previous slate until noon Eastern.
  const todayStr = sportsDayStr();
  const effectiveDateStr = dateStr || todayStr;

  // For NFL the week slate is fetched, then narrowed to the selected day.
  const isNfl = sport === 'nfl';
  const nflWeekInfo = isNfl ? getNflWeekInfo(ymdToLocalDate(effectiveDateStr)) : null;
  const ck = cacheKey(sport, teamId, effectiveDateStr);

  // Seed from cache immediately — eliminates the loading blink
  const [game, setGame] = useState(() => readCache(ck));
  const [upcoming, setUpcoming] = useState(undefined);
  const [loading, setLoading] = useState(!readCache(ck)); // only show spinner if no cache
  const [error, setError] = useState(null);

  const fetchScoreboard = useCallback(async () => {
    try {
      let events;
      if (isNfl && nflWeekInfo) {
        // NFL: fetch the entire week's games
        events = await getNflWeekGames(ymdToLocalDate(effectiveDateStr));
      } else {
        events = await getScoreboard(sport, effectiveDateStr);
      }
      const found = events.find((e) =>
        e.competitions?.[0]?.competitors?.some((c) => c.team?.id === String(teamId))
      ) || null;
      const onDay = gameOnDay(found, effectiveDateStr);
      setGame(onDay);
      writeCache(ck, onDay);
      setError(null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [sport, teamId, effectiveDateStr, ck, isNfl, nflWeekInfo?.week, nflWeekInfo?.seasontype]);

  useEffect(() => {
    if (!teamId) return undefined;
    let cancelled = false;
    setUpcoming(undefined);
    getTeamSchedule(sport, teamId)
      .then((events) => {
        if (!cancelled) setUpcoming(selectUpcomingGames(events, effectiveDateStr, new Date()));
      })
      .catch(() => { if (!cancelled) setUpcoming([]); });
    return () => { cancelled = true; };
  }, [sport, teamId, effectiveDateStr]);

  useEffect(() => {
    // Don't reset to loading if we already have cached data
    const cached = readCache(ck);
    if (!cached) setLoading(true);
    fetchScoreboard();
    if (dateStr) return;
    const id = setInterval(fetchScoreboard, refreshInterval);
    return () => clearInterval(id);
  }, [fetchScoreboard, refreshInterval, dateStr]);

  const nextGame = upcoming === undefined ? undefined : (upcoming[0] || null);
  // NFL stays visible through a bye week. Other sports hide once the schedule
  // has no games left.
  const hasUpcomingGame = upcoming === undefined
    ? undefined
    : (upcoming.length > 0 || (isNfl && nflWeekInfo !== null));
  return { game, loading, error, hasUpcomingGame, nextGame, upcoming };
}
