import { useState, useEffect } from 'react';
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
          <img src={opponent.team.logo} alt="" className="tp-row-logo" />
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

  // Flatten all divisions/conferences
  const groups = [];
  const walk = (node) => {
    const entries = node.standings?.entries || [];
    if (entries.length > 0) groups.push({ name: node.name, entries });
    (node.children || []).forEach(walk);
  };
  walk(standings);

  // Find the group that contains our team
  const myGroup = groups.find((g) =>
    g.entries.some((e) => e.team?.id === String(teamId))
  ) || groups[0];

  if (!myGroup) return <div className="tp-loading">No standings data.</div>;

  const statKeys = ['W', 'L', 'PCT', 'GB', 'STRK', 'Home', 'AWAY', 'Last Ten'];

  return (
    <div className="tp-standings">
      <div className="tp-standings-title">{myGroup.name}</div>
      <div className="tp-table-wrap">
        <table className="tp-table">
          <thead>
            <tr>
              <th className="tp-th tp-th-team">Team</th>
              {statKeys.map((k) => <th key={k} className="tp-th">{k}</th>)}
            </tr>
          </thead>
          <tbody>
            {myGroup.entries.map((entry, i) => {
              const team = entry.team || {};
              const stats = Object.fromEntries(
                (entry.stats || []).map((s) => [s.abbreviation, s.displayValue])
              );
              const isMyTeam = team.id === String(teamId);
              return (
                <tr key={team.id || i} className={`tp-tr ${isMyTeam ? 'tp-tr-mine' : ''}`}>
                  <td className="tp-td tp-td-team">
                    {team.logos?.[0]?.href && (
                      <img src={team.logos[0].href} alt="" className="tp-standings-logo" />
                    )}
                    <span className="tp-standings-name">{team.displayName}</span>
                    {isMyTeam && <span className="tp-you-tag">you</span>}
                  </td>
                  {statKeys.map((k) => (
                    <td key={k} className={`tp-td ${k === 'W' || k === 'PCT' ? 'tp-td-hl' : ''}`}>
                      {stats[k] ?? '—'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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

export default function TeamPage() {
  const { sport, teamId } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Schedule');

  useEffect(() => {
    setLoading(true);
    getTeamInfo(sport, teamId)
      .then(setTeam)
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
              <img src={team.logos[0].href} alt={team.displayName} className="tp-header-logo" />
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
