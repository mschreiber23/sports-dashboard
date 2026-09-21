import { useState, useEffect, useRef } from 'react';

const POLL_MS = 10000;
const DEMO_GAME_ID = 2025030416;

// NHL API has no CORS headers so browser requests are blocked.
// For the demo game, serve bundled static JSON.
// For live games (when NHL season is active), we use a CORS-enabled proxy.
const NHL_PROXY = 'https://api.allorigins.win/raw?url=';

function nhlUrl(path) {
  const base = `https://api-web.nhle.com${path}`;
  return `${NHL_PROXY}${encodeURIComponent(base)}`;
}

async function nhlFetch(path) {
  const r = await fetch(nhlUrl(path));
  return r.json();
}

// Some ESPN abbreviations differ from NHL API
const ESPN_TO_NHL = {
  'TB': 'TBL', 'SJ': 'SJS', 'NJ': 'NJD', 'LA': 'LAK',
  'CLB': 'CBJ', 'VEG': 'VGK', 'WPG': 'WPG',
};
export const normNhlAbb = (a) => ESPN_TO_NHL[a] || a;

// situationCode: "1551" = [awayGoalie][awaySkaters][homeSkaters][homeGoalie]
export function parseSitCode(code = '') {
  if (!code || code.length < 4) return null;
  return {
    awayGoalie:  code[0] === '1',
    awaySkaters: parseInt(code[1]),
    homeSkaters: parseInt(code[2]),
    homeGoalie:  code[3] === '1',
  };
}

export function strengthLabel(code, awayFirst = true) {
  const s = parseSitCode(code);
  if (!s) return 'EV';
  const { awaySkaters: a, homeSkaters: h, awayGoalie, homeGoalie } = s;
  if (!awayGoalie || !homeGoalie) return `EN`;
  if (a === h) return a === 5 ? 'EV' : `${a}v${h}`;
  return `${Math.max(a, h)}v${Math.min(a, h)} PP`;
}

export function periodLabel(period, periodType) {
  if (periodType === 'OT') return period > 4 ? `OT${period - 3}` : 'OT';
  if (periodType === 'SO') return 'SO';
  return period === 1 ? '1st' : period === 2 ? '2nd' : period === 3 ? '3rd' : `P${period}`;
}

/** Find NHL game ID from an ESPN game object */
export async function findNhlGameId(espnGame) {
  const comp = espnGame?.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find(c => c.homeAway === 'away');
  const home = competitors.find(c => c.homeAway === 'home');
  const awayAbb = normNhlAbb(away?.team?.abbreviation || '');
  const homeAbb = normNhlAbb(home?.team?.abbreviation || '');
  if (!awayAbb || !homeAbb) return null;

  const d0 = new Date(espnGame.date || comp?.date);
  const d1 = new Date(d0); d1.setDate(d1.getDate() - 1);

  for (const d of [d0, d1]) {
    const dateStr = d.toISOString().slice(0, 10);
    try {
      const data = await nhlFetch(`/v1/score/${dateStr}`);
      const match = (data.games || []).find(g =>
        normNhlAbb(g.awayTeam?.abbrev) === awayAbb &&
        normNhlAbb(g.homeTeam?.abbrev) === homeAbb
      );
      if (match?.id) return match.id;
    } catch {}
  }
  return null;
}

export default function useNhlLiveFeed(nhlGameId) {
  const [data, setData] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!nhlGameId) { setData(null); return; }
    let cancelled = false;

    const poll = () => {
      // Demo game: serve from bundled static JSON (no CORS issues)
      const url = nhlGameId === DEMO_GAME_ID
        ? `${import.meta.env.BASE_URL}demo/nhl-demo-game.json`
        : nhlUrl(`/v1/gamecenter/${nhlGameId}/play-by-play`);

      return fetch(url)
        .then(r => r.json())
        .then(d => { if (!cancelled) setData(d); })
        .catch(() => {});
    };

    poll();
    // Only poll for live games, not the demo
    if (nhlGameId !== DEMO_GAME_ID) {
      timerRef.current = setInterval(poll, POLL_MS);
    }
    return () => { cancelled = true; clearInterval(timerRef.current); };
  }, [nhlGameId]);

  if (!data) return null;

  const away = data.awayTeam || {};
  const home = data.homeTeam || {};
  const period = data.periodDescriptor?.number || 0;
  const pType  = data.periodDescriptor?.periodType || 'REG';
  const clock  = data.clock || {};
  const plays  = data.plays || [];
  const roster = data.rosterSpots || [];

  // Player lookup
  const playerMap = {};
  for (const p of roster) playerMap[p.playerId] = p;
  const getPlayer = (id) => playerMap[id] || null;
  const playerName = (id) => {
    const p = playerMap[id];
    return p ? `${p.firstName?.default || ''} ${p.lastName?.default || ''}`.trim() : '';
  };

  const gameState = data.gameState; // LIVE CRIT OFF FUT PRE
  const isLive   = gameState === 'LIVE' || gameState === 'CRIT';
  const isFinal  = gameState === 'OFF';
  const isPre    = gameState === 'FUT' || gameState === 'PRE';

  // Current game situation
  const sit = data.situation;
  const sitCode = sit?.awayTeam?.situationCode || sit?.homeTeam?.situationCode || '1551';
  const ppTeam  = (() => {
    const s = parseSitCode(sitCode);
    if (!s) return null;
    if (s.awaySkaters > s.homeSkaters) return away.abbrev; // away PP
    if (s.homeSkaters > s.awaySkaters) return home.abbrev; // home PP
    return null;
  })();
  const ppTimeRemaining = sit?.awayTeam?.timeRemaining || sit?.homeTeam?.timeRemaining || '';
  const emptyNet = (() => {
    const s = parseSitCode(sitCode);
    if (!s) return null;
    if (!s.awayGoalie) return away.abbrev;
    if (!s.homeGoalie) return home.abbrev;
    return null;
  })();

  // Goals with player names resolved
  const goals = plays
    .filter(p => p.typeDescKey === 'goal')
    .map(p => ({
      ...p,
      scorerName:   playerName(p.details?.scoringPlayerId),
      scorer:       getPlayer(p.details?.scoringPlayerId),
      assist1Name:  playerName(p.details?.assist1PlayerId),
      assist2Name:  playerName(p.details?.assist2PlayerId),
      scorerTotal:  p.details?.scoringPlayerTotal,
      teamId:       p.details?.eventOwnerTeamId,
      strength:     p.situationCode,
    }));

  // Penalties with player names
  const penalties = plays
    .filter(p => p.typeDescKey === 'penalty')
    .map(p => ({
      ...p,
      playerName: playerName(p.details?.committedByPlayerId),
      servedBy:   playerName(p.details?.servedByPlayerId),
      desc:       p.details?.descKey || '',
      duration:   p.details?.duration || 0,
      teamId:     p.details?.eventOwnerTeamId,
    }));

  // Shots with coordinates for shot map (shots + goals)
  const shots = plays
    .filter(p => ['shot-on-goal', 'goal', 'missed-shot', 'blocked-shot'].includes(p.typeDescKey))
    .filter(p => p.details?.xCoord != null)
    .map(p => ({
      x:      p.details.xCoord,
      y:      p.details.yCoord,
      type:   p.typeDescKey,
      teamId: p.details.eventOwnerTeamId,
      period: p.periodDescriptor?.number,
    }));

  // All events reversed (most recent first) for feed
  const events = [...plays].reverse();

  // Broadcast
  const broadcast = (data.tvBroadcasts || [])
    .filter(b => b.countryCode === 'US' || b.countryCode === 'CA')
    .slice(0, 2)
    .map(b => b.network).join('/');

  return {
    raw: data, nhlGameId,
    away, home,
    period, periodType: pType,
    periodLabel: periodLabel(period, pType),
    clock,
    gameState, isLive, isFinal, isPre,
    sitCode, ppTeam, ppTimeRemaining, emptyNet,
    strengthLabel: strengthLabel(sitCode),
    goals, penalties, shots, events, plays,
    playerMap, getPlayer, playerName,
    broadcast,
    venue: data.venue?.default || '',
    seriesStatus: data.seriesStatus || null,
  };
}
