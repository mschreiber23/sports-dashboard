import { useState, useEffect, useRef } from 'react';
import { getGameBoxscore } from '../api/espn';

export default function useLiveSituation(sport, game) {
  const [summary, setSummary] = useState(null);
  const intervalRef = useRef(null);
  const isLive = game?.competitions?.[0]?.status?.type?.state === 'in';

  useEffect(() => {
    if (!game?.id || !isLive) {
      setSummary(null);
      return;
    }

    const fetch = () =>
      getGameBoxscore(sport, game.id)
        .then(setSummary)
        .catch(() => {});

    fetch();
    intervalRef.current = setInterval(fetch, 20000);
    return () => clearInterval(intervalRef.current);
  }, [sport, game?.id, isLive]);

  if (!summary) return null;

  const comp = summary.header?.competitions?.[0];
  const sit = summary.situation || {};
  const rosters = summary.rosters || [];
  const bs = summary.boxscore || {};

  // Build player lookup map from rosters
  const playerMap = {};
  rosters.forEach((r) => {
    (r.roster || []).forEach((entry) => {
      const a = entry.athlete || {};
      playerMap[String(a.id)] = { ...a, jersey: entry.jersey };
    });
  });

  // Also add all pitching athletes from boxscore (rosters only have batters)
  for (const group of bs.players || []) {
    for (const sg of group.statistics || []) {
      if ((sg.type || sg.name || '') === 'pitching') {
        for (const ath of sg.athletes || []) {
          const a = ath.athlete || {};
          if (a.id && !playerMap[String(a.id)]) {
            playerMap[String(a.id)] = { ...a };
          }
        }
      }
    }
  }

  // Get pitcher stats from boxscore
  const getPitcherStats = (pitcherId) => {
    for (const group of bs.players || []) {
      for (const sg of group.statistics || []) {
        if ((sg.type || sg.name || '') === 'pitching') {
          const labels = sg.labels || [];
          const found = (sg.athletes || []).find(
            (a) => String(a.athlete?.id) === String(pitcherId)
          );
          if (found) {
            const stats = found.stats || [];
            const get = (l) => { const i = labels.indexOf(l); return i !== -1 ? stats[i] : null; };
            return { IP: get('IP'), ER: get('ER'), H: get('H'), K: get('K'), BB: get('BB') };
          }
        }
      }
    }
    return null;
  };

  const pitcher = playerMap[String(sit.pitcher?.playerId)];
  const batter = playerMap[String(sit.batter?.playerId)];
  const pitcherStats = getPitcherStats(sit.pitcher?.playerId);

  // Get batter's current game stats from boxscore batting
  const getBatterStats = (batterId) => {
    for (const group of bs.players || []) {
      for (const sg of group.statistics || []) {
        if ((sg.type || sg.name || '') === 'batting') {
          const labels = sg.labels || [];
          const found = (sg.athletes || []).find(
            (a) => String(a.athlete?.id) === String(batterId)
          );
          if (found) {
            const stats = found.stats || [];
            const get = (l) => { const i = labels.indexOf(l); return i !== -1 ? stats[i] : null; };
            return { 'H-AB': get('H-AB'), K: get('K'), HR: get('HR'), RBI: get('RBI') };
          }
        }
      }
    }
    return { 'H-AB': '0-0' };
  };
  const batterStats = getBatterStats(sit.batter?.playerId);

  // Get last play from plays array
  const plays = summary.plays || [];
  const lastPlay = plays.length > 0 ? plays[plays.length - 1]?.text : null;

  return {
    competitors: comp?.competitors || [],
    status: comp?.status,
    situation: sit,
    pitcher,
    pitcherStats,
    batter,
    batterStats,
    lastPlay,
  };
}
