import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchMiLBSchedule, normalizeMiLBGame, MILB_LEVELS,
  fetchAllMiLBTeams, milbTeamLogoUrl, milbHeadshotUrl,
  searchMiLBByName, getMiLBPlayerIndex, levelShort, fetchMiLBTeam,
} from '../api/milb';
import { MiLBGameCard } from '../components/TeamRow';
import { useFavorites } from '../context/FavoritesContext';
import { PlayerGameCard } from '../pages/PlayerCardsPage';

/* ── Shared localStorage key with PlayerCardsPage ─────── */
const CARDS_KEY = 'playerCards_v1';

function toDateStr(d) {
  return d.getFullYear().toString()
    + String(d.getMonth() + 1).padStart(2, '0')
    + String(d.getDate()).padStart(2, '0');
}
function formatDateLabel(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
const todayMidnight = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const STATE_ORDER = { in: 0, post: 1, pre: 2 };

/* ── MiLB Direct Add by ID ────────────────────────────── */
function MiLBDirectAdd({ onAdd }) {
  const [mlbId, setMlbId] = useState('');
  const [adding, setAdding] = useState(false);
  return (
    <div className="milb-direct-add">
      <span className="milb-direct-label">Add by MLB Player ID</span>
      <input
        type="number"
        className="milb-direct-input"
        placeholder="e.g. 828137"
        value={mlbId}
        onChange={e => setMlbId(e.target.value)}
        onKeyDown={async e => {
          if (e.key === 'Enter' && mlbId.trim()) {
            setAdding(true);
            await onAdd({ id: mlbId.trim(), sport: 'milb', displayName: '' });
            setMlbId('');
            setAdding(false);
          }
        }}
      />
      <button
        className="btn-primary btn-sm"
        disabled={!mlbId.trim() || adding}
        onClick={async () => {
          if (!mlbId.trim()) return;
          setAdding(true);
          await onAdd({ id: mlbId.trim(), sport: 'milb', displayName: '' });
          setMlbId('');
          setAdding(false);
        }}>
        {adding ? '…' : 'Add'}
      </button>
    </div>
  );
}

export default function MiLBPage() {
  const navigate = useNavigate();
  const { favorites, addTeam, removeTeam } = useFavorites();

  // Date navigation
  const [selectedDate, setSelectedDate] = useState(todayMidnight);
  const isToday = toDateStr(selectedDate) === toDateStr(todayMidnight());
  const shiftDate = n => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate()+n); return nd; });
  const dateStr = toDateStr(selectedDate);

  // Games
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const pollRef = useRef(null);

  // Player cards (milb only from shared storage)
  const [cards, setCards] = useState(() => {
    try { return (JSON.parse(localStorage.getItem(CARDS_KEY))||[]).filter(c=>c.sport==='milb'); } catch { return []; }
  });
  const didMountRef = useRef(false);

  // Edit/customize mode
  const [editMode, setEditMode] = useState(false);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [showPlayerSearch, setShowPlayerSearch] = useState(false);

  // Team picker state
  const [milbTeams, setMilbTeams] = useState([]);
  const [teamQuery, setTeamQuery] = useState('');

  // Player search state
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerResults, setPlayerResults] = useState([]);
  const [playerSearching, setPlayerSearching] = useState(false);
  const playerDebounce = useRef(null);

  const favMiLBIds = favorites.teams.filter(ft=>ft.sport==='milb').map(ft=>ft.team.id);

  /* ── Games loading ─────────────────────────────────── */
  useEffect(() => {
    clearInterval(pollRef.current);
    setGamesLoading(true);
    setGames([]);
    const isoDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
    const load = () => fetchMiLBSchedule(isoDate)
      .then(raw => setGames(raw.map(normalizeMiLBGame)))
      .catch(() => setGames([]))
      .finally(() => setGamesLoading(false));
    load();
    if (isToday) pollRef.current = setInterval(load, 30000);
    return () => clearInterval(pollRef.current);
  }, [dateStr]);

  /* ── Sync milb cards from shared storage ───────────── */
  useEffect(() => {
    const sync = () => {
      try {
        const all = JSON.parse(localStorage.getItem(CARDS_KEY)) || [];
        setCards(all.filter(c => c.sport === 'milb'));
      } catch {}
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  /* ── Add a MiLB player card ─────────────────────────── */
  const addCard = useCallback(async (player) => {
    const all = (() => { try { return JSON.parse(localStorage.getItem(CARDS_KEY)) || []; } catch { return []; } })();
    if (all.some(c => c.id === String(player.id) && c.sport === 'milb')) return;
    try {
      const r = await fetch(`https://statsapi.mlb.com/api/v1/people/${player.id}?hydrate=currentTeam`);
      const d = await r.json();
      const p = d.people?.[0] || {};
      const team = p.currentTeam || {};
      let teamAbbr = team.abbreviation;
      if (!teamAbbr && team.id) {
        const t = await fetchMiLBTeam(team.id);
        teamAbbr = t?.abbreviation || '';
      }
      const full = {
        id: String(p.id || player.id),
        sport: 'milb',
        displayName: p.fullName || player.displayName || `Player ${player.id}`,
        headshot: milbHeadshotUrl(p.id || player.id),
        jersey: p.primaryNumber || '',
        team: {
          id: String(team.id || ''),
          abbreviation: teamAbbr || '',
          displayName: team.name || '',
          logo: milbTeamLogoUrl(team.id),
          color: null, alternateColor: null,
        },
        position: p.primaryPosition?.abbreviation || player._position || '',
        _position: p.primaryPosition?.abbreviation || player._position || '',
      };
      const updated = [full, ...all.filter(c => !(c.id === full.id && c.sport === 'milb'))];
      localStorage.setItem(CARDS_KEY, JSON.stringify(updated));
      setCards(updated.filter(c => c.sport === 'milb'));
    } catch {
      const fallback = { id: String(player.id), sport: 'milb', displayName: player.displayName || `Player ${player.id}`, headshot: milbHeadshotUrl(player.id), jersey: '', team: { id:'', abbreviation:'', displayName:'', logo:'' }, position:'', _position:'' };
      const updated = [fallback, ...all];
      localStorage.setItem(CARDS_KEY, JSON.stringify(updated));
      setCards(updated.filter(c => c.sport === 'milb'));
    }
  }, []);

  const removeCard = useCallback((id) => {
    const all = (() => { try { return JSON.parse(localStorage.getItem(CARDS_KEY)) || []; } catch { return []; } })();
    const updated = all.filter(c => !(c.id === id && c.sport === 'milb'));
    localStorage.setItem(CARDS_KEY, JSON.stringify(updated));
    setCards(updated.filter(c => c.sport === 'milb'));
  }, []);

  const updateCard = useCallback((id, patch) => {
    const all = (() => { try { return JSON.parse(localStorage.getItem(CARDS_KEY)) || []; } catch { return []; } })();
    const updated = all.map(c => (c.id === id && c.sport === 'milb') ? { ...c, ...patch } : c);
    localStorage.setItem(CARDS_KEY, JSON.stringify(updated));
    setCards(updated.filter(c => c.sport === 'milb'));
  }, []);

  /* ── Load MiLB teams for picker ─────────────────────── */
  useEffect(() => {
    if (showTeamPicker && milbTeams.length === 0) {
      fetchAllMiLBTeams().then(setMilbTeams).catch(() => {});
    }
  }, [showTeamPicker]);

  /* ── Player search ──────────────────────────────────── */
  const doPlayerSearch = useCallback(async (q) => {
    if (!q.trim()) { setPlayerResults([]); setPlayerSearching(false); return; }
    setPlayerSearching(true);
    getMiLBPlayerIndex(); // warm up cache
    const matches = await searchMiLBByName(q);
    const teamIds = [...new Set(matches.map(p => p.currentTeam?.id).filter(Boolean))];
    const teamMap = {};
    await Promise.allSettled(
      teamIds.map(id =>
        fetch(`https://statsapi.mlb.com/api/v1/teams/${id}`)
          .then(r => r.json())
          .then(d => { const t = d.teams?.[0]; if (t) teamMap[t.id] = t; })
      )
    );
    setPlayerResults(matches.map(p => {
      const team = teamMap[p.currentTeam?.id] || {};
      return {
        id: String(p.id),
        sport: 'milb',
        displayName: p.fullName || '',
        headshot: milbHeadshotUrl(p.id),
        jersey: p.primaryNumber || '',
        team: { id: String(team.id || p.currentTeam?.id || ''), abbreviation: team.abbreviation || '', displayName: team.name || '', logo: milbTeamLogoUrl(team.id || p.currentTeam?.id), color: null, alternateColor: null },
        position: p.primaryPosition?.abbreviation || '',
        _position: p.primaryPosition?.abbreviation || '',
        _levelShort: levelShort(team.sport?.id || p._sportId),
      };
    }));
    setPlayerSearching(false);
  }, []);

  const handlePlayerQuery = e => {
    const q = e.target.value;
    setPlayerQuery(q);
    clearTimeout(playerDebounce.current);
    playerDebounce.current = setTimeout(() => doPlayerSearch(q), 400);
  };

  /* ── Sort games: favorites first, then live→final→pre ─ */
  const sortedGames = [...games].sort((a, b) => {
    const tIds = g => (g.competitions?.[0]?.competitors||[]).map(c=>c.team?.id);
    const aFav = tIds(a).some(id=>favMiLBIds.includes(id)) ? 0 : 1;
    const bFav = tIds(b).some(id=>favMiLBIds.includes(id)) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    const sa = a.competitions?.[0]?.status?.type?.state||'pre';
    const sb = b.competitions?.[0]?.status?.type?.state||'pre';
    return (STATE_ORDER[sa]??2)-(STATE_ORDER[sb]??2);
  });

  const levelIds = Object.keys(MILB_LEVELS).map(Number);
  const byLevel = {};
  for (const id of levelIds) byLevel[id] = [];
  for (const g of sortedGames) {
    const sid = Number(g._sportId);
    if (byLevel[sid]) byLevel[sid].push(g);
  }

  return (
    <div className="page-content">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="scores-page-header">
        <h1 className="page-title" style={{margin:0}}>
          <span className="milb-page-title-badge">MiLB</span>
          Minor League Baseball
        </h1>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div className="sp-date-nav">
            <button className="sp-date-btn" onClick={() => shiftDate(-1)}>‹</button>
            <label className="sp-date-label">
              {formatDateLabel(selectedDate)}
              <input type="date" className="sp-date-input"
                value={selectedDate.toISOString().slice(0,10)}
                onChange={e => setSelectedDate(new Date(e.target.value+'T12:00:00'))} />
            </label>
            <button className="sp-date-btn" onClick={() => shiftDate(1)}>›</button>
            {!isToday && <button className="sp-date-today" onClick={() => setSelectedDate(todayMidnight())}>↩</button>}
          </div>
          <button
            className="mt-customize-btn"
            onClick={() => { setEditMode(v=>!v); setShowTeamPicker(false); setShowPlayerSearch(false); }}>
            {editMode ? '✓ Done' : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Customize
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Customize panel ─────────────────────────────── */}
      {editMode && (
        <div className="milb-customize-panel">
          {/* Favorite teams */}
          <div className="milb-customize-section">
            <div className="milb-customize-row">
              <span className="milb-customize-label">Favorite Teams</span>
              <button className="btn-primary btn-sm" onClick={() => setShowTeamPicker(v=>!v)}>
                {showTeamPicker ? '✕ Close' : '+ Add Team'}
              </button>
            </div>
            {favorites.teams.filter(ft=>ft.sport==='milb').map(({team}) => (
              <div key={team.id} className="milb-cust-team-row">
                <img src={team.logo} alt="" className="milb-card-logo" onError={e=>e.target.style.display='none'} />
                <span className="milb-cust-team-name">{team.displayName}</span>
                <button className="edit-remove-btn" style={{width:24,height:24,fontSize:16}} onClick={() => removeTeam(team.id,'milb')}>−</button>
              </div>
            ))}
            {favorites.teams.filter(ft=>ft.sport==='milb').length === 0 && !showTeamPicker && (
              <p style={{fontSize:12,color:'var(--text2)',padding:'4px 0'}}>No favorite teams yet.</p>
            )}
            {showTeamPicker && (
              <div style={{marginTop:8}}>
                <input className="search-input" placeholder="Filter teams…" value={teamQuery} onChange={e=>setTeamQuery(e.target.value)} />
                {milbTeams.length === 0 && <div className="loading-text" style={{padding:'8px 0'}}>Loading…</div>}
                {Object.entries(MILB_LEVELS).map(([sportId, label]) => {
                  const ts = milbTeams
                    .filter(t=>t.sport?.id===Number(sportId))
                    .filter(t=>!teamQuery||t.name.toLowerCase().includes(teamQuery.toLowerCase()))
                    .sort((a,b)=>a.name.localeCompare(b.name));
                  if (!ts.length) return null;
                  return (
                    <div key={sportId} style={{marginTop:8}}>
                      <div className="milb-level-section-header" style={{padding:'4px 0'}}>
                        <span className="milb-level-badge">{label}</span>
                      </div>
                      <div className="picker-list">
                        {ts.map(t => {
                          const already = favorites.teams.some(ft=>ft.team.id===String(t.id)&&ft.sport==='milb');
                          return (
                            <div key={t.id} className="picker-item">
                              <div className="picker-team-info">
                                <img src={milbTeamLogoUrl(t.id)} alt="" className="picker-team-logo" onError={e=>e.target.style.display='none'} />
                                <div><div className="picker-name">{t.name}</div><div style={{fontSize:10,color:'var(--text2)'}}>{t.abbreviation}</div></div>
                              </div>
                              <button className={already?'btn-ghost btn-sm':'btn-primary btn-sm'} disabled={already}
                                onClick={() => addTeam('milb', { id:String(t.id), displayName:t.name, abbreviation:t.abbreviation||'', color:null, alternateColor:null, logo:milbTeamLogoUrl(t.id), sportId:t.sport?.id })}>
                                {already?'Added':'Add'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Player cards */}
          <div className="milb-customize-section">
            <div className="milb-customize-row">
              <span className="milb-customize-label">Player Cards</span>
              <button className="btn-primary btn-sm" onClick={() => setShowPlayerSearch(v=>!v)}>
                {showPlayerSearch ? '✕ Close' : '+ Add Player'}
              </button>
            </div>
            {cards.map(c => (
              <div key={c.id} className="milb-cust-team-row">
                <img src={milbHeadshotUrl(c.id)} alt="" className="milb-cust-headshot" onError={e=>e.target.style.display='none'} />
                <span className="milb-cust-team-name">{c.displayName}</span>
                <span style={{fontSize:11,color:'var(--text2)',marginLeft:4}}>{c.team?.abbreviation}</span>
                <button className="edit-remove-btn" style={{width:24,height:24,fontSize:16,marginLeft:'auto'}} onClick={() => removeCard(c.id)}>−</button>
              </div>
            ))}
            {cards.length === 0 && !showPlayerSearch && (
              <p style={{fontSize:12,color:'var(--text2)',padding:'4px 0'}}>No MiLB players added yet.</p>
            )}
            {showPlayerSearch && (
              <div style={{marginTop:8}}>
                <input className="search-input" placeholder="Search MiLB players…" value={playerQuery} onChange={handlePlayerQuery} />
                {playerSearching && <div className="loading-text" style={{padding:'8px 0'}}>Searching…</div>}
                {!playerSearching && playerQuery && playerResults.length === 0 && (
                  <div className="loading-text" style={{padding:'8px 0',color:'var(--text2)'}}>No players found.</div>
                )}
                {playerResults.length > 0 && (
                  <div className="picker-list" style={{marginTop:8}}>
                    {playerResults.map(p => {
                      const already = cards.some(c=>c.id===p.id);
                      return (
                        <div key={p.id} className="picker-item">
                          <div className="picker-player-info">
                            <img src={p.headshot} alt="" className="picker-avatar" onError={e=>e.target.style.display='none'} />
                            <div>
                              <div className="picker-name">{p.displayName}</div>
                              <div style={{display:'flex',alignItems:'center',gap:5,marginTop:2}}>
                                {p._levelShort && <span className="milb-level-badge" style={{fontSize:8,padding:'1px 4px'}}>{p._levelShort}</span>}
                                <span style={{fontSize:10,color:'var(--text2)'}}>{p.team?.displayName}</span>
                                {p.position && <span style={{fontSize:10,color:'var(--text2)'}}>{p.position}</span>}
                              </div>
                            </div>
                          </div>
                          <button className={already?'btn-ghost btn-sm':'btn-primary btn-sm'} disabled={already} onClick={() => addCard(p)}>
                            {already?'Added':'Add'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <MiLBDirectAdd onAdd={addCard} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Scores section ──────────────────────────────── */}
      <div className="milb-section-header">
        <span className="milb-section-title">Scores</span>
      </div>

      {gamesLoading && (
        <div className="teams-grid" style={{marginTop:8}}>
          {[1,2,3,4].map(i=><div key={i} className="mlbc-card" style={{height:90}}/>)}
        </div>
      )}

      {!gamesLoading && games.length === 0 && (
        <div className="empty-state" style={{padding:'24px 0'}}>
          <div className="empty-icon">⚾</div>
          <p>No MiLB games on {formatDateLabel(selectedDate).toLowerCase()}.</p>
        </div>
      )}

      {!gamesLoading && games.length > 0 && (
        <>
          {levelIds.map(id => {
            const levelGames = byLevel[id];
            if (!levelGames.length) return null;
            return (
              <div key={id} className="milb-level-section">
                <div className="milb-level-section-header">
                  <span className="milb-level-badge">{MILB_LEVELS[id]}</span>
                  <span className="milb-level-section-name">
                    {id===11?'Triple-A':id===12?'Double-A':id===13?'High-A':'Single-A'}
                  </span>
                  <span className="milb-level-section-count">{levelGames.length} game{levelGames.length!==1?'s':''}</span>
                </div>
                <div className="teams-grid">
                  {levelGames.map(g => <MiLBGameCard key={g.id} game={g} navigate={navigate} />)}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ── Player Cards section ────────────────────────── */}
      {cards.length > 0 && (
        <>
          <div className="milb-section-header" style={{marginTop:16}}>
            <span className="milb-section-title">Player Cards</span>
          </div>
          <div className="pc-grid">
            {cards.map((player) => (
              <div key={`${player.id}-${dateStr}`}>
                <PlayerGameCard
                  player={player}
                  onRemove={removeCard}
                  dateStr={dateStr}
                  onUpdatePlayer={updateCard}
                  editMode={false}
                  isDragOver={false}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {cards.length === 0 && !editMode && (
        <div style={{padding:'16px',textAlign:'center'}}>
          <p style={{fontSize:13,color:'var(--text2)',marginBottom:8}}>Track MiLB players by adding them in Customize.</p>
          <button className="btn-primary btn-sm" onClick={() => setEditMode(true)}>+ Add Players</button>
        </div>
      )}
    </div>
  );
}
