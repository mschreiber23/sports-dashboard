import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getScoreboard, SPORTS } from '../api/espn';
import { useFavorites } from '../context/FavoritesContext';
import { MlbPreCard, MlbLiveCard, MlbFinalCard, SportPreCard, SportLiveCard, SportFinalCard, NhlFinalCard, NhlLiveCard } from '../components/TeamRow';
import { adaptColorForDarkBg } from '../utils/colorUtils';
import useSportsDaySelection from '../hooks/useSportsDay';
import { formatSportsDateLabel, sportsDayDate, sportsDayStr, toDateStr, toIsoDate } from '../utils/sportsDay';
const SPORT_LABELS = Object.fromEntries(Object.entries(SPORTS).map(([k,v]) => [k, v.label]));
const AVAILABLE_SPORTS = ['mlb', 'nba', 'nfl', 'nhl'];

/* ── Scoreboard cache: memory + session so a tab switch paints immediately ── */
const _sbCache = {};
const _inflight = {};
const CACHE_TTL = 60_000;
const SS_KEY = 'scores_sb_v1';
const SCORES_SPORT_KEY = 'scores_last_sport_v1';

function readSessionCache() {
  try { return JSON.parse(sessionStorage.getItem(SS_KEY) || '{}'); } catch { return {}; }
}
function writeSessionEntry(ck, entry) {
  try {
    const all = readSessionCache();
    all[ck] = { ts: entry.ts, events: entry.events };
    const keys = Object.keys(all).sort((a, b) => (all[a]?.ts || 0) - (all[b]?.ts || 0));
    for (const k of keys.slice(0, Math.max(0, keys.length - 12))) delete all[k];
    sessionStorage.setItem(SS_KEY, JSON.stringify(all));
  } catch {}
}
try {
  for (const [k, v] of Object.entries(readSessionCache())) {
    if (v?.events?.length) _sbCache[k] = { ts: v.ts || 0, events: v.events };
  }
} catch {}

function fetchScoreboardCached(sport, dateStr) {
  const ck = `${sport}-${dateStr}`;
  if (_inflight[ck]) return _inflight[ck];
  const p = getScoreboard(sport, dateStr)
    .then((events) => {
      const entry = { ts: Date.now(), events };
      _sbCache[ck] = entry;
      writeSessionEntry(ck, entry);
      return events;
    })
    .finally(() => { delete _inflight[ck]; });
  _inflight[ck] = p;
  return p;
}

export default function ScoresPage() {
  const navigate = useNavigate();
  const { favorites, sportOrder } = useFavorites();

  // Restore last-selected sport on mount
  const [activeSport, setActiveSport] = useState(() => {
    try { return localStorage.getItem(SCORES_SPORT_KEY) || 'mlb'; } catch { return 'mlb'; }
  });
  const handleSetSport = (sport) => {
    try { localStorage.setItem(SCORES_SPORT_KEY, sport); } catch {}
    setActiveSport(sport);
  };

  const { selectedDate, setSelectedDate, sportsToday, isToday } = useSportsDaySelection();
  const [rawGames, setRawGames] = useState(() => {
    const ck = `${localStorage.getItem(SCORES_SPORT_KEY)||'mlb'}-${sportsDayStr()}`;
    return _sbCache[ck]?.events || [];
  });
  const [loading, setLoading] = useState(() => {
    const ck = `${localStorage.getItem(SCORES_SPORT_KEY)||'mlb'}-${sportsDayStr()}`;
    return !_sbCache[ck]?.events?.length;
  });
  const pollRef = useRef(null);

  const shiftDate = (n) => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; });
  const dateStr = toDateStr(selectedDate);

  // myTeamIds always reflects current favorites — no stale closure
  const myTeamIds = favorites.teams
    .filter(t => t.sport === activeSport)
    .map(t => t.team.id?.toString());

  const stateOrder = { in: 0, post: 1, pre: 2 };
  // Derived sort: instantly re-sorts whenever rawGames OR favorites change
  const games = useMemo(() => [...rawGames].sort((a,b) => {
    const compsA = a.competitions?.[0]?.competitors || [];
    const compsB = b.competitions?.[0]?.competitors || [];
    const aMine = compsA.some(c => myTeamIds.includes(c.team?.id?.toString())) ? 0 : 1;
    const bMine = compsB.some(c => myTeamIds.includes(c.team?.id?.toString())) ? 0 : 1;
    if (aMine !== bMine) return aMine - bMine;
    const sa = a.competitions?.[0]?.status?.type?.state || 'pre';
    const sb = b.competitions?.[0]?.status?.type?.state || 'pre';
    return (stateOrder[sa]??2)-(stateOrder[sb]??2);
  }), [rawGames, favorites.teams, activeSport]);

  useEffect(() => {
    clearInterval(pollRef.current);
    const ck = `${activeSport}-${dateStr}`;
    const cached = _sbCache[ck];

    if (cached?.events) {
      // Paint whatever we already have, including a stale slate, then refresh.
      setRawGames(cached.events);
      setLoading(false);
    } else {
      setLoading(true);
      setRawGames([]);
    }

    let cancelled = false;
    const load = async () => {
      try {
        const evts = await fetchScoreboardCached(activeSport, dateStr);
        if (!cancelled) setRawGames(evts);
      } catch {}
      if (!cancelled) setLoading(false);
    };

    load();
    if (isToday) {
      pollRef.current = setInterval(load, 30000);
    }
    return () => { cancelled = true; clearInterval(pollRef.current); };
  }, [activeSport, dateStr, isToday]);

  // Warm the other sport tabs so switching (especially to NHL) is a cache hit.
  useEffect(() => {
    for (const sport of AVAILABLE_SPORTS) {
      if (sport === activeSport) continue;
      const ck = `${sport}-${dateStr}`;
      const cached = _sbCache[ck];
      if (cached && Date.now() - cached.ts < CACHE_TTL) continue;
      fetchScoreboardCached(sport, dateStr).catch(() => {});
    }
  }, [activeSport, dateStr]);

  return (
    <div className="page-content">
      {/* Header row: title + date nav */}
      <div className="scores-page-header">
        <h1 className="page-title" style={{margin:0}}>Scores</h1>
        <div className="sp-date-nav">
          <button className="sp-date-btn" onClick={() => shiftDate(-1)}>‹</button>
          <label className="sp-date-label">
            {formatSportsDateLabel(selectedDate, sportsToday)}
            <input
              type="date"
              className="sp-date-input"
              value={toIsoDate(selectedDate)}
              onChange={e => setSelectedDate(new Date(e.target.value + 'T12:00:00'))}
            />
          </label>
          <button className="sp-date-btn" onClick={() => shiftDate(1)}>›</button>
          {!isToday && (
            <button className="sp-date-today" onClick={() => setSelectedDate(sportsDayDate())}>↩</button>
          )}
        </div>
      </div>

      {/* Sport selector */}
      <div className="scores-sport-tabs">
        {AVAILABLE_SPORTS.map((sport) => (
          <button key={sport}
            className={`ts-tab ${activeSport===sport ? 'ts-tab-active' : ''}`}
            onClick={() => handleSetSport(sport)}>
            {SPORT_LABELS[sport] || sport.toUpperCase()}
          </button>
        ))}
      </div>

      {loading && (
        <div className="teams-grid" style={{marginTop:12}}>
          {[1,2,3,4,5,6].map(i=><div key={i} className="mlbc-card" style={{height:120}}/>)}
        </div>
      )}

      {!loading && games.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🏟</div>
          <p>No {SPORT_LABELS[activeSport] || activeSport.toUpperCase()} games on {formatSportsDateLabel(selectedDate, sportsToday).toLowerCase()}.</p>
        </div>
      )}
      {!loading && games.length > 0 && (
        <div className="teams-grid" style={{marginTop:12}}>
          {games.map((game) => {
            const st = game.competitions?.[0]?.status?.type?.state;
            const competitors = game.competitions?.[0]?.competitors || [];
            const favTeam = favorites.teams.find(ft =>
              ft.sport === activeSport &&
              competitors.some(c => c.team?.id?.toString() === ft.team.id?.toString())
            );
            const rawC = favTeam?.team?.color ? `#${favTeam.team.color}` : null;
            const rawA = favTeam?.team?.alternateColor ? `#${favTeam.team.alternateColor}` : null;
            const accentColor = favTeam ? adaptColorForDarkBg(rawC, rawA, '#0092ff') : null;

            if (activeSport === 'mlb') {
              if (st === 'pre')  return <MlbPreCard  key={game.id} game={game} sport="mlb" navigate={navigate} accentColor={accentColor} />;
              if (st === 'post') return <MlbFinalCard key={game.id} game={game} sport="mlb" navigate={navigate} accentColor={accentColor} />;
              return <MlbLiveCard key={game.id} game={game} sport="mlb" navigate={navigate} accentColor={accentColor} />;
            }
            if (activeSport === 'nhl') {
              if (st === 'post') return <NhlFinalCard key={game.id} game={game} navigate={navigate} accentColor={accentColor} />;
              if (st === 'in')   return <NhlLiveCard  key={game.id} game={game} navigate={navigate} accentColor={accentColor} />;
              return <SportPreCard key={game.id} game={game} sport="nhl" navigate={navigate} accentColor={accentColor} />;
            }
            if (st === 'pre')  return <SportPreCard   key={game.id} game={game} sport={activeSport} navigate={navigate} accentColor={accentColor} />;
            if (st === 'post') return <SportFinalCard key={game.id} game={game} sport={activeSport} navigate={navigate} accentColor={accentColor} />;
            return <SportLiveCard key={game.id} game={game} sport={activeSport} navigate={navigate} accentColor={accentColor} />;
          })}
        </div>
      )}
    </div>
  );
}

