import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getScoreboard, SPORTS } from '../api/espn';
import { useFavorites } from '../context/FavoritesContext';
import { MlbPreCard, MlbLiveCard, MlbFinalCard, SportPreCard, SportLiveCard, SportFinalCard } from '../components/TeamRow';
import { normNhlAbb } from '../hooks/useNhlLiveFeed';
import { adaptColorForDarkBg } from '../utils/colorUtils';

/* ── Fetch MLB live scores for score overlays (batch, no per-game feed) ── */
async function fetchMlbScoreMap(dateStr, espnGames) {
  try {
    const isoDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
    const r = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${isoDate}&hydrate=linescore`);
    const data = await r.json();
    const mlbGames = data.dates?.[0]?.games || [];
    const norm = (s) => (s||'').toLowerCase().replace(/[^a-z]/g,'');
    const map = {};
    for (const eg of espnGames) {
      const comps = eg.competitions?.[0]?.competitors || [];
      const ea = comps.find(c=>c.homeAway==='away')?.team?.displayName;
      const eh = comps.find(c=>c.homeAway==='home')?.team?.displayName;
      const mg = mlbGames.find(g => norm(g.teams?.away?.team?.name)===norm(ea) && norm(g.teams?.home?.team?.name)===norm(eh));
      if (!mg?.linescore) continue;
      const ls = mg.linescore;
      const state = mg.status?.abstractGameState;
      map[eg.id] = {
        linescoreTotals: { away: ls.teams?.away, home: ls.teams?.home },
        inningDisplay: ls.currentInning
          ? `${ls.inningHalf === 'Bottom' ? 'BOT' : 'TOP'} ${ls.currentInning}` : '',
        raw: state === 'Live' ? {} : null,
        count: { balls: 0, strikes: 0, outs: ls.outs ?? 0 },
        onFirst: false, onSecond: false, onThird: false, outs: ls.outs ?? 0,
        matchup: {}, pitcherGameStats: {}, batterGameStats: {}, batSide: 'R',
        inningHalf: ls.inningHalf,
      };
    }
    return map;
  } catch { return {}; }
}

function toDateStr(d) {
  return d.getFullYear().toString()
    + String(d.getMonth()+1).padStart(2,'0')
    + String(d.getDate()).padStart(2,'0');
}

function formatDateLabel(date) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(date); d.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const todayMidnight = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };

const NHL_SCORE_PROXY = 'https://api.allorigins.win/raw?url=';
const nhlScoreUrl = (path) => `${NHL_SCORE_PROXY}${encodeURIComponent(`https://api-web.nhle.com${path}`)}`;

async function fetchNhlScoreMap(dateStr, espnGames) {
  try {
    const isoDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
    const r = await fetch(nhlScoreUrl(`/v1/score/${isoDate}`));
    const data = await r.json();
    const nhlGames = data.games || [];
    const map = {};
    for (const eg of espnGames) {
      const comps = eg.competitions?.[0]?.competitors || [];
      const ea = normNhlAbb(comps.find(c => c.homeAway === 'away')?.team?.abbreviation || '');
      const eh = normNhlAbb(comps.find(c => c.homeAway === 'home')?.team?.abbreviation || '');
      const ng = nhlGames.find(g => normNhlAbb(g.awayTeam?.abbrev) === ea && normNhlAbb(g.homeTeam?.abbrev) === eh);
      if (!ng) continue;
      map[eg.id] = { nhlGameId: ng.id, awayScore: ng.awayTeam?.score, homeScore: ng.homeTeam?.score, period: ng.periodDescriptor?.number || ng.period, periodType: ng.periodDescriptor?.periodType || 'REG', clock: ng.clock?.timeRemaining || '', state: ng.gameState };
    }
    return map;
  } catch { return {}; }
}

export default function ScoresPage() {
  const navigate = useNavigate();
  const { favorites, sportOrder } = useFavorites();

  const [activeSport, setActiveSport] = useState('mlb');
  const [selectedDate, setSelectedDate] = useState(todayMidnight);
  const [rawGames, setRawGames] = useState([]);
  const [mlbScoreMap, setMlbScoreMap] = useState({});
  const [nhlScoreMap, setNhlScoreMap] = useState({});
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const isToday = toDateStr(selectedDate) === toDateStr(todayMidnight());
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
    setLoading(true);
    setRawGames([]);
    setMlbScoreMap({});

    const load = () => getScoreboard(activeSport, dateStr)
      .then(async (evts) => {
        setRawGames(evts);
        if (activeSport === 'mlb') {
          const map = await fetchMlbScoreMap(dateStr, evts);
          setMlbScoreMap(map);
        }
        if (activeSport === 'nhl') {
          const map = await fetchNhlScoreMap(dateStr, evts);
          setNhlScoreMap(map);
        }
      })
      .catch(()=>{});

    load().finally(()=>setLoading(false));
    // Only poll live data for today
    if (isToday) {
      pollRef.current = setInterval(load, 30000);
    }
    return () => clearInterval(pollRef.current);
  }, [activeSport, dateStr]);

  const availableSports = ['mlb','nba','nfl','nhl'].filter(s=>
    sportOrder.includes(s) || true
  );

  return (
    <div className="page-content">
      {/* Header row: title + date nav */}
      <div className="scores-page-header">
        <h1 className="page-title" style={{margin:0}}>Scores</h1>
        <div className="sp-date-nav">
          <button className="sp-date-btn" onClick={() => shiftDate(-1)}>‹</button>
          <label className="sp-date-label">
            {formatDateLabel(selectedDate)}
            <input
              type="date"
              className="sp-date-input"
              value={selectedDate.toISOString().slice(0, 10)}
              onChange={e => setSelectedDate(new Date(e.target.value + 'T12:00:00'))}
            />
          </label>
          <button className="sp-date-btn" onClick={() => shiftDate(1)}>›</button>
          {!isToday && (
            <button className="sp-date-today" onClick={() => setSelectedDate(todayMidnight())}>↩</button>
          )}
        </div>
      </div>

      {/* Sport selector */}
      <div className="scores-sport-tabs">
        {availableSports.map((sport) => (
          <button key={sport}
            className={`ts-tab ${activeSport===sport ? 'ts-tab-active' : ''}`}
            onClick={() => setActiveSport(sport)}>
            {SPORTS[sport]?.label}
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
          <p>No {SPORTS[activeSport]?.label || activeSport.toUpperCase()} games on {formatDateLabel(selectedDate).toLowerCase()}.</p>
        </div>
      )}

      {!loading && games.length > 0 && (
        <div className="teams-grid" style={{marginTop:12}}>
          {games.map((game) => {
            const st = game.competitions?.[0]?.status?.type?.state;
            const competitors = game.competitions?.[0]?.competitors || [];
            // Find this game's team in favorites and derive accent color for gradient
            const favTeam = favorites.teams.find(ft =>
              ft.sport === activeSport &&
              competitors.some(c => c.team?.id?.toString() === ft.team.id?.toString())
            );
            const rawC = favTeam?.team?.color ? `#${favTeam.team.color}` : null;
            const rawA = favTeam?.team?.alternateColor ? `#${favTeam.team.alternateColor}` : null;
            // Always pass a fallback so favorite-team cards always get an accent color
            const accentColor = favTeam ? adaptColorForDarkBg(rawC, rawA, '#0092ff') : null;

            if (activeSport === 'mlb') {
              if (st === 'pre')  return <MlbPreCard  key={game.id} game={game} sport="mlb" navigate={navigate} accentColor={accentColor} />;
              if (st === 'post') return <MlbFinalCard key={game.id} game={game} sport="mlb" navigate={navigate} accentColor={accentColor} />;
              return <MlbLiveCard key={game.id} game={game} sport="mlb" navigate={navigate} accentColor={accentColor} />;
            }
            if (st === 'pre')  return <SportPreCard   key={game.id} game={game} sport={activeSport} navigate={navigate} accentColor={accentColor} />;
            if (st === 'post') return <SportFinalCard key={game.id} game={game} sport={activeSport} navigate={navigate} accentColor={accentColor} />;
            return <SportLiveCard key={game.id} game={game} sport={activeSport} navigate={navigate} accentColor={accentColor} nhlScore={activeSport === 'nhl' ? nhlScoreMap[game.id] : null} />;
          })}
        </div>
      )}
    </div>
  );
}

