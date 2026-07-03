import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adaptColorForDarkBg } from '../utils/colorUtils';
import { fetchMiLBSeasonStats, extractMiLBStats } from '../api/milb';

const STORAGE_KEY = 'playerCards_v1';

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
const ESPN_SEARCH = 'https://site.api.espn.com/apis/search/v2';
const SPORT_COLORS = { mlb:'#e74c3c', nba:'#f39c12', nfl:'#27ae60', nhl:'#3498db' };
const SLUG_TO_SPORT = {
  mlb:'mlb', nba:'nba', nfl:'nfl', nhl:'nhl',
  baseball:'mlb', basketball:'nba', football:'nfl', hockey:'nhl',
};
const SPORT_CFG = {
  mlb:  { sport:'baseball',    league:'mlb' },
  milb: { sport:'baseball',    league:'milb', isMiLB: true },
  nba:  { sport:'basketball',  league:'nba' },
  nfl:  { sport:'football',    league:'nfl' },
  nhl:  { sport:'hockey',      league:'nhl' },
};

/* ── Position helpers ─────────────────────────────────── */
const isPitcher    = (pos) => /^(SP|RP|P|CP)$/i.test(pos||'');
const isNhlGoalie  = (pos) => /^G$/i.test(pos||'');
const nflGroup     = (pos) => {
  if (/^QB$/i.test(pos)) return 'qb';
  if (/^(RB|FB|HB)$/i.test(pos)) return 'rb';
  if (/^(WR|TE)$/i.test(pos)) return 'wr';
  return null;
};

/* ── Stat display configs (ESPN label → display label) ── */
const STAT_CFGS = {
  mlb_batter: [
    {s:'H_AB',l:'AB',combo:{h:'H',ab:'AB'}},{s:'R',l:'R'},{s:'RBI',l:'RBI'},
    {s:'HR',l:'HR'},{s:'BB',l:'BB'},{s:'K',l:'K'},
    {s:'AVG',l:'AVG'},{s:'OBP',l:'OBP'},{s:'SLG',l:'SLG'},
  ],
  mlb_pitcher: [
    {s:'IP',l:'IP'},{s:'H',l:'H'},{s:'R',l:'R'},{s:'ER',l:'ER'},
    {s:'BB',l:'BB'},{s:'K',l:'K'},{s:'ERA',l:'ERA'},{s:'PC',l:'PC'},
  ],
  nfl_qb: [
    {s:'C/ATT',l:'C/ATT'},{s:'YDS',l:'PYDS'},{s:'TD',l:'PTD'},{s:'INT',l:'INT'},
    {s:'CAR',l:'CAR'},{s:'RYDS',l:'RYDS'},{s:'RTD',l:'RTD'},
  ],
  nfl_rb: [
    {s:'CAR',l:'CAR'},{s:'YDS',l:'RYDS'},{s:'TD',l:'RTD'},
    {s:'TGTS',l:'TGT'},{s:'REC',l:'REC'},{s:'RECYDS',l:'RECYDS'},{s:'RECTD',l:'RECTD'},
  ],
  nfl_wr: [
    {s:'TGTS',l:'TGT'},{s:'REC',l:'REC'},{s:'YDS',l:'RECYDS'},{s:'TD',l:'RECTD'},
    {s:'CAR',l:'CAR'},{s:'RYDS',l:'RYDS'},{s:'RTD',l:'RTD'},
  ],
  nba: [
    {s:'MIN',l:'MIN'},{s:'PTS',l:'PTS'},{s:'REB',l:'REB'},{s:'AST',l:'AST'},
    {s:'STL',l:'STL'},{s:'BLK',l:'BLK'},{s:'TO',l:'TO'},
    {s:'FG',l:'FG'},{s:'3PT',l:'3PT'},{s:'FT',l:'FT'},
  ],
  nhl_skater: [
    {s:'G',l:'G'},{s:'A',l:'A'},{s:'+/-',l:'+/-'},{s:'SOG',l:'SOG'},
    {s:'HT',l:'HIT'},{s:'BS',l:'BLK'},{s:'PIM',l:'PIM'},
    {s:'TK',l:'TKW'},{s:'GV',l:'GVW'},{s:'TOI',l:'TOI'},
  ],
  nhl_goalie: [
    {s:'SV',l:'SV'},{s:'SA',l:'SA'},{s:'GA',l:'GA'},{s:'SV%',l:'SV%'},
  ],
};

function getStatCfgKey(sport, posAbb) {
  if (sport === 'mlb' || sport === 'milb') return isPitcher(posAbb) ? 'mlb_pitcher' : 'mlb_batter';
  if (sport === 'nfl') {
    const g = nflGroup(posAbb);
    return g ? `nfl_${g}` : 'nfl_wr';
  }
  if (sport === 'nba') return 'nba';
  if (sport === 'nhl') return isNhlGoalie(posAbb) ? 'nhl_goalie' : 'nhl_skater';
  return null;
}

/* ── Data fetching ────────────────────────────────────── */
async function findGame(sport, teamId, dateStr) {
  const { sport: s, league: l } = SPORT_CFG[sport] || {};
  if (!s) return null;
  const date = dateStr || toDateStr(new Date());
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${s}/${l}/scoreboard?dates=${date}`);
  const d = await r.json();
  return (d.events || []).find(e =>
    e.competitions?.[0]?.competitors?.some(c => c.team?.id === String(teamId))
  ) || null;
}

async function fetchGameSummary(sport, gameId) {
  const { sport: s, league: l } = SPORT_CFG[sport] || {};
  const r = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/${s}/${l}/summary?event=${gameId}`);
  return r.json();
}

async function fetchSeasonStats(sport, athleteId, posAbb) {
  try {
    const year = new Date().getFullYear();
    const { sport: s, league: l } = SPORT_CFG[sport] || {};
    const r = await fetch(`https://sports.core.api.espn.com/v2/sports/${s}/leagues/${l}/seasons/${year}/types/2/athletes/${athleteId}/statistics/0?lang=en&region=us`);
    const d = await r.json();
    const cats = d?.splits?.categories || [];
    const sm = {};
    // For MLB, get batting or pitching category; for others get all
    const wantCat = sport === 'mlb' ? (isPitcher(posAbb) ? 'pitching' : 'batting') : null;
    for (const cat of cats) {
      if (!wantCat || cat.name?.toLowerCase() === wantCat) {
        for (const s of cat.stats || []) sm[s.abbreviation] = s.displayValue;
      }
    }
    return sm;
  } catch { return {}; }
}

function extractPlayerStats(summary, athleteId, sport, posAbb) {
  const isQb = nflGroup(posAbb) === 'qb';
  const isRb = nflGroup(posAbb) === 'rb';
  const isWr = nflGroup(posAbb) === 'wr';

  const statMap = {};

  for (const team of summary.boxscore?.players || []) {
    for (const grp of team.statistics || []) {
      const labels = grp.labels || [];
      const athlete = grp.athletes?.find(a => a.athlete?.id === String(athleteId));
      if (!athlete) continue;

      const stats = athlete.stats || [];
      // Build map for this group
      const groupMap = {};
      labels.forEach((lbl, i) => { groupMap[lbl] = stats[i] ?? '—'; });

      if (sport === 'nfl') {
        // For NFL, merge stats across groups based on position
        if (grp.name === 'passing' && (isQb || !nflGroup(posAbb))) {
          Object.assign(statMap, groupMap);
        } else if (grp.name === 'rushing') {
          // Rename to avoid collision with passing YDS/TD
          if (isQb) { statMap['RYDS'] = groupMap['YDS']; statMap['RTD'] = groupMap['TD']; statMap['CAR'] = groupMap['CAR']; }
          else Object.assign(statMap, groupMap);
        } else if (grp.name === 'receiving') {
          if (isRb || isWr) {
            statMap['RECYDS'] = groupMap['YDS'];
            statMap['RECTD'] = groupMap['TD'];
            statMap['TGTS'] = groupMap['TGTS'];
            statMap['REC'] = groupMap['REC'];
          }
        } else if (grp.name === 'fumbles') {
          statMap['FUM'] = groupMap['FUM'];
        }
      } else {
        Object.assign(statMap, groupMap);
      }
    }
  }
  return Object.keys(statMap).length > 0 ? statMap : null;
}

/* ── Individual player card ───────────────────────────── */
function PlayerGameCard({ player, onRemove, dateStr, onUpdatePlayer, editMode,
  onDragStart, onDragEnter, onDragEnd, onTouchStart, isDragOver }) {
  const navigate = useNavigate();
  const [gameData, setGameData] = useState(null); // { game, summary, statMap }
  const [loading, setLoading] = useState(true);
  const posAbb = player._position || player.position?.abbreviation || '';
  const cfgKey = getStatCfgKey(player.sport, posAbb);
  const statCfg = STAT_CFGS[cfgKey] || [];

  // Team color for gradient + glow
  const rawC = player.team?.color ? `#${player.team.color}` : null;
  const rawA = player.team?.alternateColor ? `#${player.team.alternateColor}` : null;
  const accentColor = rawC ? adaptColorForDarkBg(rawC, rawA, '#0092ff') : null;

  const load = useCallback(async () => {
    try {
      const isMiLB = player.sport === 'milb';

      // ── MiLB path: use MLB Stats API throughout ──────────
      if (isMiLB) {
        const isoDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
        const teamId = player.team?.id;
        let game = null;
        if (teamId) {
          try {
            const r = await fetch(
              `https://statsapi.mlb.com/api/v1/schedule?sportId=11,12,13,14` +
              `&date=${isoDate}&teamId=${teamId}&hydrate=team`
            );
            const d = await r.json();
            const g = d.dates?.[0]?.games?.[0];
            if (g) {
              const abs = g.status?.abstractGameState || '';
              const state = abs === 'Live' ? 'in' : abs === 'Final' ? 'post' : 'pre';
              game = {
                id: String(g.gamePk),
                _gamePk: g.gamePk,
                competitions: [{ status: { type: { state } }, competitors: [
                  { homeAway: 'away', team: { id: String(g.teams?.away?.team?.id || '') } },
                  { homeAway: 'home', team: { id: String(g.teams?.home?.team?.id || '') } },
                ]}],
              };
            }
          } catch {}
        }
        if (!game) {
          const seasonStats = await fetchMiLBSeasonStats(player.id, posAbb);
          setGameData({ game: null, seasonStats });
          setLoading(false);
          return;
        }
        const state = game.competitions?.[0]?.status?.type?.state;
        if (state === 'pre') {
          const seasonStats = await fetchMiLBSeasonStats(player.id, posAbb);
          setGameData({ game, seasonStats, state });
        } else {
          // Fetch live feed for game stats
          const [liveFeed, seasonStats] = await Promise.all([
            fetch(`https://statsapi.mlb.com/api/v1.1/game/${game._gamePk}/feed/live`).then(r => r.json()),
            (state === 'in' || state === 'post') ? fetchMiLBSeasonStats(player.id, posAbb) : Promise.resolve({}),
          ]);
          const statMap = extractMiLBStats(liveFeed, player.id, posAbb);
          setGameData({ game, statMap, seasonStats, state });
        }
        setLoading(false);
        return;
      }

      // ── ESPN path (mlb, nba, nfl, nhl) ──────────────────
      let teamId = player.team?.id;

      // If team.id is missing (old stored player), re-fetch athlete data to get it
      if (!teamId) {
        const { sport: s, league: l } = SPORT_CFG[player.sport] || {};
        try {
          const ar = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/${s}/${l}/athletes/${player.id}`);
          const ad = await ar.json();
          teamId = ad.athlete?.team?.id;
          if (teamId) {
            onUpdatePlayer?.(player.id, { team: { ...player.team, id: teamId } });
          }
        } catch {}
      }

      const game = await findGame(player.sport, teamId, dateStr);
      if (!game) {
        const seasonStats = await fetchSeasonStats(player.sport, player.id, posAbb);
        setGameData({ game: null, seasonStats });
        setLoading(false);
        return;
      }
      const comp = game.competitions?.[0];
      const state = comp?.status?.type?.state;
      const [summary, seasonStats] = await Promise.all([
        (state === 'in' || state === 'post') ? fetchGameSummary(player.sport, game.id) : null,
        (state === 'pre') ? fetchSeasonStats(player.sport, player.id, posAbb) : null,
      ]);
      const statMap = summary ? extractPlayerStats(summary, player.id, player.sport, posAbb) : null;
      setGameData({ game, summary, statMap, seasonStats, state });
    } catch { setGameData({ game: null }); }
    setLoading(false);
  }, [player.id, player.sport, player.team?.id, dateStr, posAbb]);

  useEffect(() => {
    setGameData(null);
    setLoading(true);
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load, dateStr]);

  const comp = gameData?.game?.competitions?.[0];
  const state = comp?.status?.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post';
  const competitors = comp?.competitors || [];
  const myTeam = competitors.find(c => c.team?.id === String(player.team?.id));
  const oppTeam = competitors.find(c => c.team?.id !== String(player.team?.id));
  const myScore  = myTeam?.score;
  const oppScore = oppTeam?.score;
  const isHome = myTeam?.homeAway === 'home';
  const shortDetail = comp?.status?.type?.shortDetail || '';
  const broadcast = comp?.broadcasts?.[0]?.names?.[0] || '';
  const headshotUrl = typeof player.headshot === 'object' ? player.headshot?.href : player.headshot;

  return editMode ? (
      <div
        className={`pc-edit-row${isDragOver ? ' pc-card-drag-over' : ''}`}
        onDragOver={e => { e.preventDefault(); onDragEnter?.(); }}
        onDrop={onDragEnd}
      >
        <div className="pc-drag-handle" draggable onDragStart={onDragStart} onTouchStart={onTouchStart}>≡</div>
        {headshotUrl && <img src={headshotUrl} alt="" className="pc-edit-headshot" onError={e=>e.target.style.display='none'}/>}
        <span className="pc-edit-name">{player.displayName}</span>
        {posAbb && <span className="pc-edit-pos">{posAbb}</span>}
        <button className="pc-ctrl-btn pc-ctrl-remove" style={{marginLeft:'auto'}} onClick={() => onRemove(player.id)}>✕</button>
      </div>
  ) : (
    <div
      className={`pc-card${isDragOver ? ' pc-card-drag-over' : ''}`}
      style={accentColor ? {
        background: `linear-gradient(135deg, color-mix(in srgb,${accentColor} 12%,var(--bg2)) 0%, var(--bg2) 60%)`,
        borderColor: `color-mix(in srgb,${accentColor} 50%,transparent)`,
        boxShadow: `0 0 14px color-mix(in srgb,${accentColor} 22%,transparent)`,
      } : undefined}
      onDragOver={e => { e.preventDefault(); onDragEnter?.(); }}
      onDrop={onDragEnd}
    >
      {/* Controls */}
      <div className="pc-controls">
        <button className="pc-ctrl-btn pc-ctrl-remove" onClick={() => onRemove(player.id)} title="Remove">✕</button>
      </div>

      {/* Game context header */}
      {gameData?.game ? (
        <div className="pc-game-header">
          <span className="pc-matchup">
            {isHome ? 'vs' : '@'} {oppTeam?.team?.abbreviation}
          </span>
          {(isLive || isFinal) && (
            <span className={`pc-score ${isLive ? 'pc-score-live' : ''}`}>
              {isLive && <span className="live-dot" style={{marginRight:3}}/>}
              {myScore}–{oppScore}
            </span>
          )}
          <span className={`pc-status ${isLive ? 'pc-status-live' : ''}`}>
            {isLive ? shortDetail : isFinal ? 'FINAL' : shortDetail}
          </span>
          {broadcast && !isFinal && <span className="pc-broadcast">{broadcast}</span>}
        </div>
      ) : (
        <div className="pc-game-header pc-no-game">
          {loading ? 'Loading…' : 'No game today'}
        </div>
      )}

      {/* Player identity */}
      <div className="pc-player-row" onClick={() => navigate(`/player/${player.sport}/${player.id}`)}>
        {headshotUrl
          ? <img src={headshotUrl} alt="" className="pc-headshot" onError={e=>e.target.style.display='none'}/>
          : <div className="pc-headshot-placeholder">{player.displayName?.[0]}</div>
        }
        <div className="pc-player-info">
          <div className="pc-player-name">{player.displayName}</div>
          <div className="pc-player-meta">
            {posAbb && <span className="pc-pos">{posAbb}</span>}
            {player.jersey && <span className="pc-jersey">#{player.jersey}</span>}
            <span className="pc-team-abbr">{player.team?.abbreviation}</span>
          </div>
        </div>
      </div>

      {/* No game today: season stats */}
      {!gameData?.game && !loading && gameData?.seasonStats && statCfg.length > 0 && (
        <>
          <div className="pc-season-label">{new Date().getFullYear()} Season Stats</div>
          <div className="pc-stats-grid">
            {statCfg.map((cfg) => {
              const { s, l, combo } = cfg;
              let val;
              if (combo) {
                const h  = gameData.seasonStats[combo.h];
                const ab = gameData.seasonStats[combo.ab];
                if (h === undefined && ab === undefined) return null;
                val = `${h ?? '0'}-${ab ?? '0'}`;
              } else {
                val = gameData.seasonStats[s];
                if (val === undefined) return null;
              }
              return (
                <div key={s} className="pc-stat-cell">
                  <div className="pc-stat-val">{val}</div>
                  <div className="pc-stat-lbl">{l}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Pre-game: matchup + season stats */}
      {state === 'pre' && (
        <>
          <div className="pc-matchup-row">
            <div className="pc-matchup-team">
              {competitors.find(c => c.homeAway === 'away')?.team?.logo
                ? <img src={competitors.find(c=>c.homeAway==='away')?.team?.logo} alt="" className="pc-team-logo" onError={e=>e.target.style.display='none'}/>
                : null}
              <span>{competitors.find(c=>c.homeAway==='away')?.team?.abbreviation}</span>
            </div>
            <div className="pc-matchup-vs">
              <div className="pc-game-time">{shortDetail.includes(' - ') ? shortDetail.split(' - ').slice(1).join(' - ') : shortDetail}</div>
            </div>
            <div className="pc-matchup-team">
              {competitors.find(c => c.homeAway === 'home')?.team?.logo
                ? <img src={competitors.find(c=>c.homeAway==='home')?.team?.logo} alt="" className="pc-team-logo" onError={e=>e.target.style.display='none'}/>
                : null}
              <span>{competitors.find(c=>c.homeAway==='home')?.team?.abbreviation}</span>
            </div>
          </div>
          {gameData?.seasonStats && statCfg.length > 0 && (
            <>
              <div className="pc-season-label">{new Date().getFullYear()} Season Stats</div>
              <div className="pc-stats-grid">
                {statCfg.map((cfg) => {
                  const { s, l, combo } = cfg;
                  let val;
                  if (combo) {
                    const h  = gameData.seasonStats[combo.h];
                    const ab = gameData.seasonStats[combo.ab];
                    if (h === undefined && ab === undefined) return null;
                    val = `${h ?? '0'}-${ab ?? '0'}`;
                  } else {
                    val = gameData.seasonStats[s];
                    if (val === undefined) return null;
                  }
                  return (
                    <div key={s} className="pc-stat-cell">
                      <div className="pc-stat-val">{val}</div>
                      <div className="pc-stat-lbl">{l}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Live / final: game stats */}
      {(state === 'in' || state === 'post') && gameData?.statMap && statCfg.length > 0 && (
        <div className="pc-stats-grid">
          {statCfg.map((cfg) => {
            const { s, l, combo } = cfg;
            let val;
            if (combo) {
              const h  = gameData.statMap[combo.h];
              const ab = gameData.statMap[combo.ab];
              if (h === undefined && ab === undefined) return null;
              val = `${h ?? '0'}-${ab ?? '0'}`;
            } else {
              val = gameData.statMap[s];
              if (val === undefined) return null;
            }
            return (
              <div key={s} className="pc-stat-cell">
                <div className="pc-stat-val">{val ?? '—'}</div>
                <div className="pc-stat-lbl">{l}</div>
              </div>
            );
          })}
        </div>
      )}
      {(state === 'in' || state === 'post') && !gameData?.statMap && (
        <div className="pc-no-stats">Stats not available</div>
      )}
    </div>
  );
}

const SPORT_BADGE_COLORS = {
  mlb_batter:'#e74c3c', mlb_pitcher:'#c0392b',
  nfl_qb:'#27ae60', nfl_rb:'#1e8449', nfl_wr:'#196f3d',
  nba:'#f39c12', nhl_skater:'#3498db', nhl_goalie:'#2980b9',
};

/* ── Main Page ────────────────────────────────────────── */
export default function PlayerCardsPage() {
  const [cards, setCards] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  });
  const [selectedDate, setSelectedDate] = useState(todayMidnight);
  const isToday = toDateStr(selectedDate) === toDateStr(todayMidnight());
  const shiftDate = (n) => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; });
  const dateStr = toDateStr(selectedDate);

  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  // Guard: skip saving on the initial render so a parse error can't overwrite stored data
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cards)); } catch {}
  }, [cards]);

  useEffect(() => {
    if (showSearch) setTimeout(() => inputRef.current?.focus(), 80);
    else { setQuery(''); setResults([]); }
  }, [showSearch]);

  const doSearch = useCallback((q) => {
    if (!q.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    fetch(`${ESPN_SEARCH}?query=${encodeURIComponent(q)}&limit=10`)
      .then(r => r.json())
      .then(d => {
        const pr = (d.results || []).find(r => r.type === 'player');
        const players = (pr?.contents || []).map(p => {
          const uidMatch = p.uid?.match(/a:(\d+)/);
          const id = uidMatch ? uidMatch[1] : null;
          const sport = SLUG_TO_SPORT[(p.defaultLeagueSlug || p.sport || '').toLowerCase()];
          if (!id || !sport) return null;
          return {
            id,
            sport,
            displayName: p.displayName,
            headshot: p.image?.default || null,
            team: { id: null, abbreviation: p.subtitle || '' },
            position: null,
            _position: '',
          };
        }).filter(Boolean);
        setResults(players);
      })
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, []);

  const handleQuery = (e) => {
    const q = e.target.value; setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 300);
  };

  const addCard = async (player) => {
    if (cards.some(c => c.id === player.id)) return;
    const { sport: s, league: l } = SPORT_CFG[player.sport] || {};
    try {
      // Use the common/v3 endpoint which works reliably for all athletes
      const r = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/${s}/${l}/athletes/${player.id}`);
      const d = await r.json();
      const ath = d.athlete || {};
      const full = {
        id: player.id,
        sport: player.sport,
        displayName: ath.displayName || player.displayName,
        headshot: typeof ath.headshot === 'object' ? ath.headshot?.href : (ath.headshot || player.headshot),
        jersey: ath.jersey || '',
        team: {
          id: ath.team?.id,
          abbreviation: ath.team?.abbreviation,
          displayName: ath.team?.displayName,
          logo: ath.team?.logos?.[0]?.href || ath.team?.logo,
          color: ath.team?.color,
          alternateColor: ath.team?.alternateColor,
        },
        position: ath.position?.abbreviation,
        _position: ath.position?.abbreviation || '',
      };
      setCards(prev => [full, ...prev]);
    } catch {
      setCards(prev => [player, ...prev]);
    }
    setShowSearch(false);
  };

  const [editMode, setEditMode] = useState(false);
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const removeCard = (id) => setCards(prev => prev.filter(c => c.id !== id));
  const updateCard = (id, patch) => setCards(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));

  const commitDrag = (fromIdx, toIdx) => {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    setCards(prev => {
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  };

  // Touch drag: track which card is being held and which we're hovering over
  const touchDragRef = useRef({ active: false, fromIdx: null });
  const cardRefs = useRef([]);

  const handleTouchStart = (idx) => (e) => {
    touchDragRef.current = { active: true, fromIdx: idx };
    setDragFrom(idx);
  };
  const handleTouchMove = (e) => {
    if (!touchDragRef.current.active) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const cardEl = el?.closest('[data-card-idx]');
    if (cardEl) {
      const toIdx = parseInt(cardEl.dataset.cardIdx);
      setDragOver(toIdx);
    }
  };
  const handleTouchEnd = () => {
    commitDrag(touchDragRef.current.fromIdx, dragOver);
    touchDragRef.current = { active: false, fromIdx: null };
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <div className="page-content">
      <div className="pc-page-header">
        <h1 className="page-title" style={{margin:0}}>Player Cards</h1>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div className="sp-date-nav">
            <button className="sp-date-btn" onClick={() => shiftDate(-1)}>‹</button>
            <label className="sp-date-label">
              {formatDateLabel(selectedDate)}
              <input
                type="date"
                className="sp-date-input"
                value={selectedDate.toISOString().slice(0,10)}
                onChange={e => setSelectedDate(new Date(e.target.value + 'T12:00:00'))}
              />
            </label>
            <button className="sp-date-btn" onClick={() => shiftDate(1)}>›</button>
            {!isToday && (
              <button className="sp-date-today" onClick={() => setSelectedDate(todayMidnight())}>↩</button>
            )}
          </div>
          <button className="mt-customize-btn" onClick={() => { setEditMode(v => !v); setShowSearch(false); }}>
            {editMode ? '✓ Done' : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit
              </>
            )}
          </button>
          <button className="btn-primary btn-sm" onClick={() => setShowSearch(v => !v)}>
            {showSearch ? '✕' : '+ Add'}
          </button>
        </div>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="pc-search-wrap">
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Search any player…"
            value={query}
            onChange={handleQuery}
          />
          {searching && <div className="loading-text" style={{padding:'8px 0'}}>Searching…</div>}
          {results.length > 0 && (
            <div className="picker-list" style={{marginTop:8}}>
              {results.map(p => {
                const already = cards.some(c => c.id === p.id);
                return (
                  <div key={p.id} className="picker-item">
                    <div className="picker-player-info">
                      {p.headshot && <img src={p.headshot} alt="" className="picker-avatar" onError={e=>e.target.style.display='none'}/>}
                      <div>
                        <div className="picker-name">{p.displayName}</div>
                        <div className="picker-pos" style={{color: SPORT_COLORS[p.sport] || '#888', fontSize:10, fontWeight:700, textTransform:'uppercase'}}>
                          {p.sport?.toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <button
                      className={already ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}
                      disabled={already}
                      onClick={() => addCard(p)}
                    >
                      {already ? 'Added' : 'Add'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Cards grid */}
      {cards.length === 0 && !showSearch && (
        <div className="empty-state">
          <div className="empty-icon">🃏</div>
          <p>Add players to track their live game stats.</p>
        </div>
      )}

      <div
        className={`pc-grid${editMode ? ' pc-grid-edit' : ''}`}
        onTouchMove={editMode ? handleTouchMove : undefined}
        onTouchEnd={editMode ? handleTouchEnd : undefined}
      >
        {cards.map((player, idx) => (
          <div key={`${player.id}-${dateStr}`} data-card-idx={idx}>
            <PlayerGameCard player={player}
              onRemove={removeCard} dateStr={dateStr} onUpdatePlayer={updateCard}
              editMode={editMode}
              isDragOver={dragOver === idx && dragFrom !== idx}
              onDragStart={() => { setDragFrom(idx); setDragOver(idx); }}
              onDragEnter={() => setDragOver(idx)}
              onDragEnd={() => { commitDrag(dragFrom, dragOver); setDragFrom(null); setDragOver(null); }}
              onTouchStart={handleTouchStart(idx)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
