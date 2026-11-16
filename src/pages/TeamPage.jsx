import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getPlayerSeasonStats,
  getStandings,
  getTeamInfo,
  getTeamNews,
  getTeamRoster,
  getTeamSchedule,
  teamMarkUrls,
} from '../api/espn';
import { recordsByTeam } from '../utils/homeTeamBoard';
import { sportsDayStr } from '../utils/sportsDay';
import { defaultScheduleMonth, focusScheduleEvent, scheduleMonths } from '../utils/teamSchedule';
import {
  buildTeamStatRows,
  scheduleOpponentLogo,
  statsByName,
  statsSeasonChoices,
} from '../utils/teamStats';
import { formatScheduleStack, gameOpponent, selectUpcomingGames } from '../utils/upcomingGames';
import { recordTeamView } from './TeamsPage';

const SECTIONS = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'stats', label: 'Player Stats' },
  { id: 'news', label: 'News' },
];

const MLB_PITCH_POS = new Set(['P', 'SP', 'RP', 'CL', 'CP', 'LHP', 'RHP']);
const MLB_BATTING = ['G', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'SB', 'BB', 'SO', 'AVG', 'OBP', 'SLG', 'OPS'];
const MLB_PITCHING = ['W', 'L', 'ERA', 'G', 'GS', 'IP', 'H', 'R', 'ER', 'BB', 'SO', 'WHIP'];

function statGroups(sport) {
  if (sport === 'nhl') return ['Skaters', 'Goalies'];
  if (sport === 'nfl') return ['Passing', 'Rushing', 'Receiving', 'Defense'];
  if (sport === 'nba') return ['Players'];
  return ['Batting', 'Pitching'];
}

function darkUrl(url) {
  if (!url) return url;
  return url.replace(/(\/i\/teamlogos\/[^/]+\/)(\d+)(\/)/, '$1$2-dark$3');
}

function DLogo({ url, className }) {
  const dark = darkUrl(url);
  if (!dark) return null;
  return (
    <img
      src={dark}
      alt=""
      className={className}
      onError={(event) => {
        if (event.target.src !== url) {
          event.target.onerror = null;
          event.target.src = url;
        }
      }}
    />
  );
}

function TeamMark({ team, sport, className }) {
  const urls = teamMarkUrls(team, sport);
  const key = urls.join('|');
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [key]);
  const src = urls[index];
  if (!src) {
    const abbr = team?.abbreviation || '';
    return abbr ? <span className={`${className} hts-logo-fallback`}>{abbr}</span> : null;
  }
  return <img src={src} alt="" className={className} onError={() => setIndex((current) => current + 1)} />;
}

function formatTimeAgo(date) {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getScore(competitor) {
  const score = competitor?.score;
  if (score == null) return null;
  return typeof score === 'object' ? score.displayValue : String(score);
}

function ScheduleRow({ event, teamId, sport, today }) {
  const navigate = useNavigate();
  const comp = event.competitions?.[0];
  const competitors = comp?.competitors || [];
  const myTeam = competitors.find((row) => row.team?.id === String(teamId));
  const opponent = competitors.find((row) => row.team?.id !== String(teamId));
  const isHome = myTeam?.homeAway === 'home';
  const state = comp?.status?.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post';
  const date = new Date(event.date);
  const oppLogo = scheduleOpponentLogo(opponent?.team);

  return (
    <div
      data-game={event.id}
      className={`tp-schedule-row${isLive ? ' tp-row-live' : ''}${today ? ' tp-row-today' : ''}${comp?.id ? ' tp-row-clickable' : ''}`}
      onClick={() => comp?.id && navigate(`/boxscore/${sport}/${comp.id}`)}
    >
      <div className="tp-row-date">
        {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
      </div>
      <div className="tp-row-opponent">
        <span className="tp-row-ha">{isHome ? 'vs' : '@'}</span>
        {opponent?.team?.id ? (
          <Link
            to={`/team/${sport}/${opponent.team.id}`}
            className="tp-opp-link tr-team-link"
            onClick={(eventClick) => eventClick.stopPropagation()}
          >
            {oppLogo && <DLogo url={oppLogo} className="tp-row-logo" />}
            <span className="tp-row-opp-name">{opponent.team.shortDisplayName || opponent.team.displayName}</span>
          </Link>
        ) : (
          <>
            {oppLogo && <DLogo url={oppLogo} className="tp-row-logo" />}
            <span className="tp-row-opp-name">{opponent?.team?.shortDisplayName || opponent?.team?.displayName}</span>
          </>
        )}
      </div>
      <div className="tp-row-result">
        {isLive && <span className="badge badge-live" style={{ fontSize: 11 }}><span className="live-dot" /> {comp?.status?.type?.shortDetail}</span>}
        {isFinal && (
          <>
            <span className={`tp-row-wl ${myTeam?.winner ? 'tp-win' : 'tp-loss'}`}>{myTeam?.winner ? 'W' : 'L'}</span>
            <span className="tp-row-score">{getScore(myTeam)}–{getScore(opponent)}</span>
          </>
        )}
        {!isLive && !isFinal && (
          <span className="tp-row-time">
            {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}
          </span>
        )}
      </div>
    </div>
  );
}

function UpcomingFive({ sport, teamId, events, records }) {
  const navigate = useNavigate();
  const games = selectUpcomingGames(events, sportsDayStr(), new Date(), 5);
  if (!games.length) return null;
  return (
    <section className="tp-upcoming">
      <div className="section-title">Upcoming Games</div>
      <div className="hts-up-games tp-next">
        {games.map((game) => {
          const opp = gameOpponent(game, teamId);
          const when = formatScheduleStack(game.date);
          const record = records[String(opp.team?.id)] || '';
          return (
            <button
              key={game.id}
              type="button"
              className="hts-up-chip"
              onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}
            >
              <span className="hts-up-date">{when.date}</span>
              <span className="hts-up-time">{when.time}</span>
              <span className="hts-up-opp">
                {opp.prefix === '@' && <span className="hts-up-at">@</span>}
                <span className="hts-up-oppmark">
                  <TeamMark team={opp.team} sport={sport} className="hts-logo hts-up-logo" />
                  {record && <span className="hts-record">{record}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MonthSchedule({ sport, teamId, events }) {
  const months = useMemo(() => scheduleMonths(events), [events]);
  const [month, setMonth] = useState('');

  useEffect(() => {
    setMonth(defaultScheduleMonth(months));
  }, [months]);

  const shown = months.find((item) => item.key === month)?.events || [];
  const focus = focusScheduleEvent(shown);

  if (!months.length) return <div className="tp-loading">No schedule available.</div>;

  return (
    <div className="tp-schedule">
      <div className="nts-cats tp-months" role="group" aria-label="Month">
        {months.map((item) => (
          <button
            key={item.key}
            type="button"
            className={item.key === month ? 'on' : ''}
            aria-pressed={item.key === month}
            onClick={() => setMonth(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div>
        {shown.map((event) => (
          <ScheduleRow
            key={event.id}
            event={event}
            teamId={teamId}
            sport={sport}
            today={event.id === focus?.id}
          />
        ))}
      </div>
    </div>
  );
}

function mlbRows(kind, players) {
  if (kind === 'Batting') {
    const rows = players
      .filter((player) => !MLB_PITCH_POS.has(player.pos))
      .map((player) => ({
        ...player,
        stats: Object.fromEntries(MLB_BATTING.map((col) => [col, player.cats?.batting?.[col] || '—'])),
      }))
      .filter((player) => player.stats.AB && player.stats.AB !== '—' && player.stats.AB !== '0')
      .sort((a, b) => (parseInt(b.stats.AB, 10) || 0) - (parseInt(a.stats.AB, 10) || 0));
    return { cols: MLB_BATTING, rows };
  }
  const rows = players
    .filter((player) => MLB_PITCH_POS.has(player.pos) || player.cats?.pitching?.IP)
    .map((player) => ({
      ...player,
      stats: Object.fromEntries(MLB_PITCHING.map((col) => [col, player.cats?.pitching?.[col] || '—'])),
    }))
    .filter((player) => player.stats.IP && player.stats.IP !== '—')
    .sort((a, b) => (parseFloat(b.stats.IP) || 0) - (parseFloat(a.stats.IP) || 0));
  return { cols: MLB_PITCHING, rows };
}

function StatsTable({ rows, cols, onPlayerClick }) {
  if (!rows.length) return null;
  return (
    <div className="tp-stats-table-wrap">
      <table className="tp-stats-table">
        <thead>
          <tr>
            <th className="tp-stats-th tp-stats-th-name">PLAYER</th>
            {cols.map((col) => <th key={col} className="tp-stats-th">{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`tp-stats-tr${row.id ? ' tp-stats-tr-link' : ''}`}
              onClick={() => row.id && onPlayerClick(row.id)}
            >
              <td className="tp-stats-td tp-stats-td-name">
                {row.headshot && <img src={row.headshot} alt="" className="tp-stats-avatar" />}
                <div className="tp-stats-name-col">
                  <span className="tp-stats-name">{row.name}</span>
                  <span className="tp-stats-pos">{row.pos}</span>
                </div>
              </td>
              {cols.map((col) => <td key={col} className="tp-stats-td">{row.stats?.[col] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlayerStats({ sport, teamId }) {
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const year = statsSeasonChoices(sport)[0].year;

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setPlayers([]);
    (async () => {
      try {
        const groups = await getTeamRoster(sport, teamId);
        const roster = groups.flatMap((group) => (group.items || []).map((player) => ({
          id: player.id,
          name: player.shortName || player.displayName || player.fullName,
          pos: player.position?.abbreviation || '',
          headshot: player.headshot?.href || null,
        })));
        const rows = new Array(roster.length);
        let next = 0;
        async function worker() {
          while (next < roster.length) {
            const index = next;
            next += 1;
            const player = roster[index];
            try {
              const { data } = await getPlayerSeasonStats(sport, player.id, year);
              rows[index] = { ...player, cats: parseCats(data), byName: statsByName(data) };
            } catch {
              rows[index] = { ...player, cats: {}, byName: {} };
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(6, roster.length) }, () => worker()));
        if (!cancel) setPlayers(rows.filter(Boolean));
      } catch {
        if (!cancel) setPlayers([]);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [sport, teamId, year]);

  if (loading) return <div className="tp-loading">Loading player stats…</div>;

  const blocks = statGroups(sport).map((group) => {
    const built = sport === 'mlb' ? mlbRows(group, players) : buildTeamStatRows(sport, group, players);
    return { group, ...built };
  }).filter((block) => block.rows.length);

  if (!blocks.length) return <div className="tp-loading">No stats available.</div>;

  return (
    <div className="tp-stats-wrap">
      {blocks.map((block) => (
        <section key={block.group} className="tp-stat-block">
          <div className="section-title">{block.group}</div>
          <StatsTable rows={block.rows} cols={block.cols} onPlayerClick={(id) => navigate(`/player/${sport}/${id}`)} />
        </section>
      ))}
    </div>
  );
}

function parseCats(data) {
  const out = {};
  for (const cat of data?.splits?.categories || []) {
    out[cat.name] = {};
    for (const stat of cat.stats || []) {
      if (stat.abbreviation) out[cat.name][stat.abbreviation] = stat.displayValue;
    }
  }
  return out;
}

function NewsList({ sport, teamId }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTeamNews(sport, teamId, 12)
      .then(setArticles)
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, [sport, teamId]);

  if (loading) return <div className="tp-loading">Loading news…</div>;
  if (!articles.length) return <div className="tp-loading">No recent news.</div>;

  return (
    <div className="tp-news">
      {articles.map((article) => {
        const image = (article.images || []).find((item) => item.width > 300 && !item.url?.includes('applewatch'))
          || article.images?.[0];
        const published = article.published ? new Date(article.published) : null;
        return (
          <a key={article.id} href={article.links?.web?.href || '#'} target="_blank" rel="noopener noreferrer" className="tp-news-card">
            {image?.url && <img src={image.url} alt="" className="tp-news-img" />}
            <div className="tp-news-body">
              <div className="tp-news-headline">{article.headline}</div>
              {article.description && <div className="tp-news-desc">{article.description}</div>}
              <div className="tp-news-meta">{published ? formatTimeAgo(published) : ''} · ESPN</div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

export default function TeamPage() {
  const { sport, teamId } = useParams();
  const [team, setTeam] = useState(null);
  const [events, setEvents] = useState([]);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('schedule');

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setScheduleLoaded(false);
    setSection('schedule');
    setTeam(null);
    setEvents([]);
    setRecords({});
    getTeamInfo(sport, teamId).then((info) => {
      if (cancel) return;
      setTeam(info);
      if (info?.displayName) {
        recordTeamView({
          id: teamId,
          sport,
          name: info.displayName,
          abbreviation: info.abbreviation || '',
          logo: info.logos?.[0]?.href || null,
        });
      }
    }).catch(() => {
      if (!cancel) setTeam(null);
    }).finally(() => {
      if (!cancel) setLoading(false);
    });
    getTeamSchedule(sport, teamId).then((schedule) => {
      if (!cancel) setEvents(schedule);
    }).catch(() => {
      if (!cancel) setEvents([]);
    }).finally(() => {
      if (!cancel) setScheduleLoaded(true);
    });
    getStandings(sport).then(recordsByTeam).then((map) => {
      if (!cancel) setRecords(map || {});
    }).catch(() => {});
    return () => { cancel = true; };
  }, [sport, teamId]);

  const record = team?.record?.items?.[0]?.summary || team?.standingSummary || '';

  return (
    <div className="tp-page">
      {loading && !team ? (
        <div className="skeleton-card" style={{ height: 96, borderRadius: 12 }} />
      ) : team ? (
        <div className="tp-hero">
          <TeamMark team={team} sport={sport} className="tp-hero-logo" />
          <div className="tp-hero-copy">
            <div className="tp-hero-name">{team.displayName || team.name}</div>
            {record && <div className="tp-hero-record">{record}</div>}
          </div>
        </div>
      ) : (
        <div className="error-banner">Could not load team info.</div>
      )}

      <UpcomingFive sport={sport} teamId={teamId} events={events} records={records} />

      <div className="nts-cats" role="group" aria-label="Team section">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? 'on' : ''}
            aria-pressed={section === item.id}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="tp-content">
        {section === 'schedule' && (scheduleLoaded
          ? <MonthSchedule sport={sport} teamId={teamId} events={events} />
          : <div className="tp-loading">Loading schedule…</div>)}
        {section === 'stats' && <PlayerStats sport={sport} teamId={teamId} />}
        {section === 'news' && <NewsList sport={sport} teamId={teamId} />}
      </div>
    </div>
  );
}
