import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

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
  mlb: { sport:'baseball', league:'mlb' },
  nba: { sport:'basketball', league:'nba' },
  nfl: { sport:'football', league:'nfl' },
  nhl: { sport:'hockey', league:'nhl' },
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
    {s:'AB',l:'AB'},{s:'R',l:'R'},{s:'H',l:'H'},{s:'RBI',l:'RBI'},
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
  if (sport === 'mlb') return isPitcher(posAbb) ? 'mlb_pitcher' : 'mlb_batter';
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
function PlayerGameCard({ player, onRemove, dateStr }) {
  const navigate = useNavigate();
  const [gameData, setGameData] = useState(null); // { game, summary, statMap }
  const [loading, setLoading] = useState(true);
  const posAbb = player._position || player.position?.abbreviation || '';
  const cfgKey = getStatCfgKey(player.sport, posAbb);
  const statCfg = STAT_CFGS[cfgKey] || [];

  const load = useCallback(async () => {
    try {
      const game = await findGame(player.sport, player.team?.id, dateStr);
      if (!game) { setGameData({ game: null }); setLoading(false); return; }
      const comp = game.competitions?.[0];
      const state = comp?.status?.type?.state;
      const summary = (state === 'in' || state === 'post')
        ? await fetchGameSummary(player.sport, game.id) : null;
      const statMap = summary ? extractPlayerStats(summary, player.id, player.sport, posAbb) : null;
      setGameData({ game, summary, statMap, state });
    } catch { setGameData({ game: null }); }
    setLoading(false);
  }, [player.id, player.sport, player.team?.id]);

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

  return (
    <div className="pc-card">
      {/* Remove button */}
      <button className="pc-remove" onClick={() => onRemove(player.id)} title="Remove">✕</button>

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
            <span className="pc-sport-badge" style={{background: SPORT_BADGE_COLORS[cfgKey] || SPORT_COLORS[player.sport] || '#555'}}>
              {cfgKey?.replace('_',' ').toUpperCase() || player.sport?.toUpperCase()}
            </span>
            {posAbb && <span className="pc-pos">{posAbb}</span>}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      {gameData?.statMap && statCfg.length > 0 ? (
        <div className="pc-stats-grid">
          {statCfg.map(({ s, l }) => {
            const val = gameData.statMap[s];
            if (val === undefined) return null;
            return (
              <div key={s} className="pc-stat-cell">
                <div className="pc-stat-val">{val ?? '—'}</div>
                <div className="pc-stat-lbl">{l}</div>
              </div>
            );
          })}
        </div>
      ) : gameData?.game && (state === 'in' || state === 'post') ? (
        <div className="pc-no-stats">Stats not available</div>
      ) : gameData?.game && state === 'pre' ? (
        <div className="pc-no-stats">Game hasn't started</div>
      ) : null}
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
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
    // Fetch full player data to get team ID and position
    const { sport: s, league: l } = SPORT_CFG[player.sport] || {};
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${s}/${l}/athletes/${player.id}`);
      const d = await r.json();
      const ath = d.athlete || {};
      const full = {
        id: player.id,
        sport: player.sport,
        displayName: ath.displayName || player.displayName,
        headshot: ath.headshot?.href || player.headshot,
        team: { id: ath.team?.id, abbreviation: ath.team?.abbreviation, displayName: ath.team?.displayName },
        position: ath.position?.abbreviation,
        _position: ath.position?.abbreviation || '',
      };
      setCards(prev => [full, ...prev]);
    } catch {
      setCards(prev => [player, ...prev]);
    }
    setShowSearch(false);
  };

  const removeCard = (id) => setCards(prev => prev.filter(c => c.id !== id));

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

      <div className="pc-grid">
        {cards.map(player => (
          <PlayerGameCard key={`${player.id}-${dateStr}`} player={player} onRemove={removeCard} dateStr={dateStr} />
        ))}
      </div>
    </div>
  );
}
