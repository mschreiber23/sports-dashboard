import { useState, useEffect } from 'react';
import { recordTeamView } from './TeamsPage';
import { useParams, useNavigate } from 'react-router-dom';
import { getTeamInfo, getTeamSchedule, getTeamNews, getStandings, SPORTS } from '../api/espn';

/* ─── Schedule Tab ─────────────────────────────────── */

function ScheduleTab({ sport, teamId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTeamSchedule(sport, teamId)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [sport, teamId]);

  if (loading) return <div className="tp-loading">Loading schedule…</div>;

  const now = new Date();
  const recent = events.filter((e) => new Date(e.date) < now).slice(-10).reverse();
  const upcoming = events.filter((e) => new Date(e.date) >= now).slice(0, 15);

  return (
    <div className="tp-schedule">
      {upcoming.length > 0 && (
        <div className="tp-schedule-section">
          <div className="tp-schedule-label">Upcoming</div>
          {upcoming.map((e) => <ScheduleRow key={e.id} event={e} teamId={teamId} />)}
        </div>
      )}
      {recent.length > 0 && (
        <div className="tp-schedule-section">
          <div className="tp-schedule-label">Recent Results</div>
          {recent.map((e) => <ScheduleRow key={e.id} event={e} teamId={teamId} />)}
        </div>
      )}
    </div>
  );
}

function ScheduleRow({ event, teamId }) {
  const comp = event.competitions?.[0];
  const competitors = comp?.competitors || [];
  const myTeam = competitors.find((c) => c.team?.id === String(teamId));
  const opponent = competitors.find((c) => c.team?.id !== String(teamId));
  const isHome = myTeam?.homeAway === 'home';
  const status = comp?.status;
  const state = status?.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post';
  const date = new Date(event.date);
  const won = myTeam?.winner;

  // Score can be a plain value or an object { displayValue }
  const getScore = (c) => {
    const s = c?.score;
    if (s == null) return null;
    return typeof s === 'object' ? s.displayValue : String(s);
  };
  const myScore = getScore(myTeam);
  const oppScore = getScore(opponent);

  return (
    <div className={`tp-schedule-row ${isLive ? 'tp-row-live' : ''}`}>
      <div className="tp-row-date">
        {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
      </div>
      <div className="tp-row-opponent">
        <span className="tp-row-ha">{isHome ? 'vs' : '@'}</span>
        {opponent?.team?.logo && (
          <DLogo url={opponent.team.logo} className="tp-row-logo" />
        )}
        <span className="tp-row-opp-name">{opponent?.team?.shortDisplayName || opponent?.team?.displayName}</span>
      </div>
      <div className="tp-row-result">
        {isLive && (
          <span className="badge badge-live" style={{ fontSize: 11 }}>
            <span className="live-dot" /> {status?.type?.shortDetail}
          </span>
        )}
        {isFinal && (
          <>
            <span className={`tp-row-wl ${won ? 'tp-win' : 'tp-loss'}`}>{won ? 'W' : 'L'}</span>
            <span className="tp-row-score">{myScore}–{oppScore}</span>
          </>
        )}
        {!isLive && !isFinal && (
          <span className="tp-row-time">
            {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Standings config per sport ───────────────────── */
const STANDINGS_COLS = {
  mlb: [
    { key: 'W', label: 'W', hl: true }, { key: 'L', label: 'L' },
    { key: 'PCT', label: 'PCT', hl: true }, { key: 'GB', label: 'GB' },
    { key: 'Home', label: 'HOME' }, { key: 'AWAY', label: 'AWAY' },
    { key: 'RS', label: 'RS' }, { key: 'RA', label: 'RA' },
    { key: 'DIFF', label: 'DIFF' }, { key: 'STRK', label: 'STRK' },
  ],
  nba: [
    { key: 'W', label: 'W', hl: true }, { key: 'L', label: 'L' },
    { key: 'PCT', label: 'PCT', hl: true }, { key: 'GB', label: 'GB' },
    { key: 'Home', label: 'HOME' }, { key: 'Road', label: 'AWAY' },
    { key: 'vs. Div.', label: 'DIV' }, { key: 'Last Ten Games', label: 'L10' },
    { key: 'STRK', label: 'STRK' },
  ],
  nfl: [
    { key: 'W', label: 'W', hl: true }, { key: 'L', label: 'L' },
    { key: 'T', label: 'T' }, { key: 'PCT', label: 'PCT', hl: true },
    { key: 'GB', label: 'GB' }, { key: 'Home', label: 'HOME' },
    { key: 'AWAY', label: 'AWAY' }, { key: 'PF', label: 'PF' },
    { key: 'PA', label: 'PA' }, { key: 'DIFF', label: 'DIFF' },
    { key: 'STRK', label: 'STRK' },
  ],
  nhl: [
    { key: 'W', label: 'W', hl: true }, { key: 'L', label: 'L' },
    { key: 'OTL', label: 'OTL' }, { key: 'PCT', label: 'PTS', hl: true },
    { key: 'GB', label: 'GB' }, { key: 'Home', label: 'HOME' },
    { key: 'AWAY', label: 'AWAY' }, { key: 'GF', label: 'GF' },
    { key: 'GA', label: 'GA' }, { key: 'STRK', label: 'STRK' },
  ],
};

function getStatMap(entry) {
  const result = {};
  (entry.stats || []).forEach((s) => {
    const key = s.abbreviation || s.name;
    if (key) result[key] = s.displayValue;
    // Also store by display name for split stats like "Home", "Road"
    if (s.name) result[s.name] = s.displayValue;
  });
  return result;
}

/* ─── Standings Tab ─────────────────────────────────── */

function StandingsTab({ sport, teamId }) {
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStandings(sport)
      .then(setStandings)
      .catch(() => setStandings(null))
      .finally(() => setLoading(false));
  }, [sport]);

  if (loading) return <div className="tp-loading">Loading standings…</div>;
  if (!standings) return <div className="tp-loading">Standings unavailable.</div>;

  const cols = STANDINGS_COLS[sport] || STANDINGS_COLS.mlb;

  // Collect all division/conference groups
  const groups = [];
  const walk = (node, depth = 0) => {
    const entries = node.standings?.entries || [];
    if (entries.length > 0) {
      groups.push({ name: node.name, entries, depth });
    }
    (node.children || []).forEach((c) => walk(c, depth + 1));
  };
  walk(standings);

  if (!groups.length) return <div className="tp-loading">No standings data.</div>;

  // Find which group contains this team so we can scroll/highlight
  const myGroupIdx = groups.findIndex((g) =>
    g.entries.some((e) => e.team?.id === String(teamId))
  );

  return (
    <div className="tp-standings-v2">
      {groups.map((group, gi) => (
        <div key={gi} className={`tp-div-block ${gi === myGroupIdx ? 'tp-div-mine' : ''}`}>
          <div className="tp-div-header">{group.name}</div>
          <div className="tp-table-wrap">
            <table className="tp-table">
              <thead>
                <tr>
                  <th className="tp-th tp-th-team">TEAM</th>
                  {cols.map((c) => <th key={c.key} className="tp-th">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {group.entries.map((entry, i) => {
                  const team = entry.team || {};
                  const stats = getStatMap(entry);
                  const isMyTeam = team.id === String(teamId);
                  const logo = team.logos?.[0]?.href;
                  const strk = stats['STRK'] || stats['streak'] || '';
                  const isWinStreak = strk.startsWith('W');
                  return (
                    <tr key={team.id || i} className={`tp-tr ${isMyTeam ? 'tp-tr-mine' : ''}`}>
                      <td className="tp-td tp-td-team">
                        <DLogo url={logo} className="tp-standings-logo" />
                        <span className={`tp-standings-abbr ${isMyTeam ? 'tp-standings-mine' : ''}`}>
                          {team.abbreviation || team.shortDisplayName}
                        </span>
                        {isMyTeam && <span className="tp-you-tag">▶</span>}
                      </td>
                      {cols.map((c) => {
                        const val = stats[c.key] ?? '—';
                        const isStrk = c.key === 'STRK';
                        return (
                          <td key={c.key} className={`tp-td ${c.hl ? 'tp-td-hl' : ''} ${isStrk && isWinStreak ? 'tp-strk-win' : isStrk ? 'tp-strk-loss' : ''}`}>
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── News Tab ──────────────────────────────────────── */

function NewsTab({ sport, teamId }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTeamNews(sport, teamId, 12)
      .then(setArticles)
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, [sport, teamId]);

  if (loading) return <div className="tp-loading">Loading news…</div>;

  const getImage = (a) => {
    const img = (a.images || []).find((i) => i.width > 300 && !i.url?.includes('applewatch'));
    return img?.url || a.images?.[0]?.url || null;
  };

  return (
    <div className="tp-news">
      {articles.length === 0 && <div className="tp-loading">No recent news.</div>}
      {articles.map((a) => {
        const img = getImage(a);
        const pub = a.published ? new Date(a.published) : null;
        const timeAgo = pub ? formatTimeAgo(pub) : '';
        return (
          <a
            key={a.id}
            href={a.links?.web?.href || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="tp-news-card"
          >
            {img && <img src={img} alt="" className="tp-news-img" />}
            <div className="tp-news-body">
              <div className="tp-news-headline">{a.headline}</div>
              {a.description && (
                <div className="tp-news-desc">{a.description}</div>
              )}
              <div className="tp-news-meta">{timeAgo} · ESPN</div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

function formatTimeAgo(date) {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ─── Main Page ─────────────────────────────────────── */

const TABS = ['Schedule', 'Standings', 'News'];

function darkUrl(url){if(!url)return url;return url.replace(/(\/i\/teamlogos\/[^/]+\/)(\d+)(\/)/,'$1$2-dark$3');}
function DLogo({url,className,style}){const d=darkUrl(url);return d?<img src={d} onError={(e)=>{if(e.target.src!==url){e.target.onerror=null;e.target.src=url;}}} alt='' className={className} style={style}/>:null;}

export default function TeamPage() {
  const { sport, teamId } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Schedule');

  useEffect(() => {
    setLoading(true);
    getTeamInfo(sport, teamId)
      .then((t) => {
        setTeam(t);
        if (t?.displayName) {
          recordTeamView({
            id: teamId, sport,
            name: t.displayName,
            abbreviation: t.abbreviation || '',
            logo: t.logos?.[0]?.href || null,
          });
        }
      })
      .catch(() => setTeam(null))
      .finally(() => setLoading(false));
  }, [sport, teamId]);

  const sportLabel = SPORTS[sport]?.label || sport.toUpperCase();
  const accentColor = team?.color ? `#${team.color}` : '#7c3aed';

  return (
    <div className="tp-page">
      {/* Back button */}
      <button className="tp-back" onClick={() => navigate('/')}>
        ← Dashboard
      </button>

      {/* Team header */}
      {loading ? (
        <div className="skeleton-card" style={{ height: 120, borderRadius: 12, marginBottom: 24 }} />
      ) : team ? (
        <div className="tp-header" style={{ '--team-color': accentColor }}>
          <div className="tp-header-inner">
            {team.logos?.[0]?.href && (
              <DLogo url={team.logos?.[0]?.href} className="tp-header-logo" />
            )}
            <div className="tp-header-info">
              <div className="tp-header-name">
                <span className="tp-header-location">{team.location}</span>{' '}
                <span className="tp-header-nickname">{team.name}</span>
              </div>
              <div className="tp-header-meta">
                <span className="tp-header-record">{team.record?.items?.[0]?.summary}</span>
                {team.standingSummary && (
                  <span className="tp-header-standing"> · {team.standingSummary}</span>
                )}
                <span className="tp-header-sport"> · {sportLabel}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="error-banner">Could not load team info.</div>
      )}

      {/* Tabs */}
      <div className="tp-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`tp-tab ${activeTab === tab ? 'tp-tab-active' : ''}`}
            onClick={() => setActiveTab(tab)}
            style={{ '--team-color': accentColor }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="tp-content">
        {activeTab === 'Schedule' && <ScheduleTab sport={sport} teamId={teamId} />}
        {activeTab === 'Standings' && <StandingsTab sport={sport} teamId={teamId} />}
        {activeTab === 'News' && <NewsTab sport={sport} teamId={teamId} />}
      </div>
    </div>
  );
}
