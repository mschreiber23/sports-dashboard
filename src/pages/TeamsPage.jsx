import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchTeams } from '../api/espn';

const VIEWED_KEY = 'shribely_viewed_teams';
const MAX_VIEWED = 16;

const SPORTS = [
  { key: 'mlb', label: 'MLB', color: '#e74c3c' },
  { key: 'nba', label: 'NBA', color: '#f39c12' },
  { key: 'nfl', label: 'NFL', color: '#27ae60' },
  { key: 'nhl', label: 'NHL', color: '#3498db' },
];

/* ── localStorage helpers ────────────────────────────────────────────── */
function loadViewed() {
  try { return JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]'); }
  catch { return []; }
}

export function recordTeamView(team) {
  try {
    let arr = loadViewed();
    arr = arr.filter((t) => !(t.id === team.id && t.sport === team.sport));
    arr.unshift({ ...team, viewedAt: Date.now() });
    arr = arr.slice(0, MAX_VIEWED);
    localStorage.setItem(VIEWED_KEY, JSON.stringify(arr));
  } catch {}
}

/* ── Team card ────────────────────────────────────────────────────────── */
function TeamCard({ team, onClick }) {
  // searchTeams returns ESPN team objects with logo field (single URL) or logos array
  const origLogo = team.logos?.[0]?.href || team.logo || null;
  const darkLogo = origLogo?.replace(/\/(\d+)\//, '/$1-dark/');
  return (
    <button className="teams-team-card" onClick={onClick}>
      <div className="teams-team-logo-wrap">
        {origLogo && (
          <img src={darkLogo || origLogo} alt=""
            onError={(e) => { if (origLogo && e.target.src !== origLogo) { e.target.onerror = null; e.target.src = origLogo; } else { e.target.style.display='none'; } }}
            className="teams-team-logo" />
        )}
      </div>
      <div className="teams-team-name">{team.shortDisplayName || team.displayName}</div>
    </button>
  );
}

/* ── Recently viewed row ─────────────────────────────────────────────── */
function ViewedTeams({ teams, onClear }) {
  const navigate = useNavigate();
  if (!teams.length) return null;
  return (
    <div className="teams-viewed-section">
      <div className="teams-viewed-header">
        <span className="teams-viewed-title">Recently Viewed</span>
        <button className="player-viewed-clear" onClick={onClear}>Clear</button>
      </div>
      <div className="teams-viewed-grid">
        {teams.map((t) => {
          const sp = SPORTS.find((s) => s.key === t.sport);
          const darkLogo = t.logo?.replace('/500/', '/500-dark/') || t.logo;
          return (
            <button
              key={`${t.sport}-${t.id}`}
              className="teams-viewed-card"
              onClick={() => navigate(`/team/${t.sport}/${t.id}`)}
            >
              {darkLogo && (
                <img src={darkLogo} alt="" className="teams-viewed-logo"
                  onError={(e) => { e.target.style.display='none'; }} />
              )}
              <div className="teams-viewed-abbr">{t.abbreviation}</div>
              <span className="player-viewed-badge"
                style={{ background: `${sp?.color || '#7c3aed'}22`, color: sp?.color || '#7c3aed' }}>
                {sp?.label || t.sport?.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Teams Page ─────────────────────────────────────────────────── */
export default function TeamsPage() {
  const navigate = useNavigate();
  const [activeSport, setActiveSport] = useState('mlb');
  const [teams, setTeams]             = useState({});  // sport → team[]
  const [query, setQuery]             = useState('');
  const [viewed, setViewed]           = useState(loadViewed);
  const inputRef = useRef(null);

  const sp = SPORTS.find((s) => s.key === activeSport);

  // Fetch teams using the CORS-friendly standings-based searchTeams function
  useEffect(() => {
    if (teams[activeSport]) return;
    searchTeams(activeSport, '')
      .then((list) => {
        setTeams((prev) => ({ ...prev, [activeSport]: list }));
      })
      .catch(() => {});
  }, [activeSport]);

  const handleTeamClick = (team) => {
    const logo = team.logos?.[0]?.href || null;
    recordTeamView({
      id: team.id,
      sport: activeSport,
      name: team.displayName,
      abbreviation: team.abbreviation,
      logo,
    });
    setViewed(loadViewed());
    navigate(`/team/${activeSport}/${team.id}`);
  };

  const filteredTeams = (teams[activeSport] || []).filter((t) =>
    !query || t.displayName.toLowerCase().includes(query.toLowerCase())
      || t.abbreviation.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="teams-page">
      {/* Header */}
      <div className="players-header">
        <div className="players-title">Teams</div>
        <div className="players-subtitle">Browse all MLB · NBA · NFL · NHL teams</div>
      </div>

      {/* Sport tabs */}
      <div className="teams-sport-tabs">
        {SPORTS.map((s) => (
          <button
            key={s.key}
            className={`teams-sport-tab ${activeSport === s.key ? 'teams-sport-tab-active' : ''}`}
            style={activeSport === s.key ? { borderBottomColor: s.color, color: s.color } : {}}
            onClick={() => { setActiveSport(s.key); setQuery(''); }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Search within sport */}
      <div className="teams-search-wrap">
        <div className="players-search-box">
          <span className="players-search-icon">🔍</span>
          <input
            ref={inputRef}
            className="players-search-input"
            placeholder={`Search ${sp?.label} teams…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="players-search-clear" onClick={() => setQuery('')}>✕</button>
          )}
        </div>
      </div>

      {/* Team grid */}
          {teams[activeSport] ? (
            <div className="teams-grid">
              {filteredTeams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  onClick={() => handleTeamClick(team)}
                />
          ))}
          {filteredTeams.length === 0 && (
            <div className="players-no-results" style={{ gridColumn: '1/-1' }}>
              No teams found for "{query}"
            </div>
          )}
        </div>
      ) : (
        <div className="players-loading"><div className="auth-spinner" /><span>Loading teams…</span></div>
      )}

      {/* Recently viewed teams intentionally omitted */}
    </div>
  );
}
