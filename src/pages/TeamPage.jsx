import { useState, useEffect, useRef } from 'react';
import { recordTeamView } from './TeamsPage';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getTeamInfo, getTeamSchedule, getTeamNews, getStandings,
  getTeamRoster, getTeamDepthChart, getPlayerSeasonStats, getPlayerSplits,
  SPORTS,
} from '../api/espn';

/* ─── Shared helpers ─────────────────────────────────── */
function darkUrl(url) {
  if (!url) return url;
  return url.replace(/(\/i\/teamlogos\/[^/]+\/)(\d+)(\/)/, '$1$2-dark$3');
}
function DLogo({ url, className, style }) {
  const d = darkUrl(url);
  return d
    ? <img src={d} onError={(e) => { if (e.target.src !== url) { e.target.onerror = null; e.target.src = url; } }} alt="" className={className} style={style} />
    : null;
}
function formatTimeAgo(date) {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
function getScore(c) {
  const s = c?.score;
  if (s == null) return null;
  return typeof s === 'object' ? s.displayValue : String(s);
}

/* ─── Schedule Row (shared) ─────────────────────────── */
function ScheduleRow({ event, teamId, sport, onClick }) {
  const navigate = useNavigate();
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
  const myScore = getScore(myTeam);
  const oppScore = getScore(opponent);

  return (
    <div
      className={`tp-schedule-row${isLive ? ' tp-row-live' : ''}${comp?.id ? ' tp-row-clickable' : ''}`}
      onClick={() => comp?.id && navigate(`/boxscore/${SPORTS[event.sport || 'mlb']?.league?.split('/')[1] || 'mlb'}/${comp.id}`)}
    >
      <div className="tp-row-date">
        {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
      </div>
      <div className="tp-row-opponent">
        <span className="tp-row-ha">{isHome ? 'vs' : '@'}</span>
        {opponent?.team?.id ? (
          <Link to={`/team/${sport}/${opponent.team.id}`} className="tp-opp-link tr-team-link"
            onClick={e => e.stopPropagation()}>
            {opponent.team.logo && <DLogo url={opponent.team.logo} className="tp-row-logo" />}
            <span className="tp-row-opp-name">{opponent.team.shortDisplayName || opponent.team.displayName}</span>
          </Link>
        ) : (
          <>
            {opponent?.team?.logo && <DLogo url={opponent.team.logo} className="tp-row-logo" />}
            <span className="tp-row-opp-name">{opponent?.team?.shortDisplayName || opponent?.team?.displayName}</span>
          </>
        )}
      </div>
      <div className="tp-row-result">
        {isLive && <span className="badge badge-live" style={{ fontSize: 11 }}><span className="live-dot" /> {status?.type?.shortDetail}</span>}
        {isFinal && (
          <>
            <span className={`tp-row-wl ${won ? 'tp-win' : 'tp-loss'}`}>{won ? 'W' : 'L'}</span>
            <span className="tp-row-score">{myScore}–{oppScore}</span>
          </>
        )}
        {!isLive && !isFinal && (
          <span className="tp-row-time">{date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
        )}
      </div>
    </div>
  );
}

/* ─── HOME TAB ───────────────────────────────────────── */
function HomeTab({ sport, teamId, onViewSchedule }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTeamSchedule(sport, teamId)
      .then(setEvents).catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [sport, teamId]);

  if (loading) return <div className="tp-loading">Loading…</div>;

  const now = new Date();
  const live = events.filter((e) => e.competitions?.[0]?.status?.type?.state === 'in');
  const past = events.filter((e) => new Date(e.date) < now && e.competitions?.[0]?.status?.type?.state !== 'in');
  const future = events.filter((e) => new Date(e.date) >= now && e.competitions?.[0]?.status?.type?.state !== 'in');

  const RECENT_LIMIT = 24;
  const recent = past.slice(-RECENT_LIMIT).reverse();
  const upcoming = future.slice(0, 3);
  const displayed = [...live, ...upcoming, ...recent];

  return (
    <div className="tp-schedule">
      {displayed.length === 0 && <div className="tp-loading">No schedule available.</div>}
      {displayed.map((e) => <ScheduleRow key={e.id} event={e} teamId={teamId} sport={sport} />)}
      {events.length > 0 && (
        <button className="tp-view-schedule-btn" onClick={onViewSchedule}>
          View Full Schedule →
        </button>
      )}
    </div>
  );
}

/* ─── FULL SCHEDULE TAB ──────────────────────────────── */
function FullScheduleTab({ sport, teamId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTeamSchedule(sport, teamId)
      .then(setEvents).catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [sport, teamId]);

  if (loading) return <div className="tp-loading">Loading schedule…</div>;
  if (!events.length) return <div className="tp-loading">No schedule available.</div>;

  const now = new Date();
  const live = events.filter((e) => e.competitions?.[0]?.status?.type?.state === 'in');
  const past = events.filter((e) => new Date(e.date) < now && e.competitions?.[0]?.status?.type?.state !== 'in').reverse();
  const future = events.filter((e) => new Date(e.date) >= now && e.competitions?.[0]?.status?.type?.state !== 'in');

  return (
    <div className="tp-schedule">
      {live.length > 0 && (
        <div className="tp-schedule-section">
          <div className="tp-schedule-label">In Progress</div>
          {live.map((e) => <ScheduleRow key={e.id} event={e} teamId={teamId} sport={sport} />)}
        </div>
      )}
      {future.length > 0 && (
        <div className="tp-schedule-section">
          <div className="tp-schedule-label">Upcoming</div>
          {future.map((e) => <ScheduleRow key={e.id} event={e} teamId={teamId} sport={sport} />)}
        </div>
      )}
      {past.length > 0 && (
        <div className="tp-schedule-section">
          <div className="tp-schedule-label">Results</div>
          {past.map((e) => <ScheduleRow key={e.id} event={e} teamId={teamId} sport={sport} />)}
        </div>
      )}
    </div>
  );
}

/* ─── STATS TAB ──────────────────────────────────────── */
const STAT_TYPES = {
  mlb:  ['Batting', 'Pitching', 'Fielding'],
  nba:  ['Players'],
  nfl:  ['Passing', 'Rushing', 'Receiving'],
  nhl:  ['Skaters', 'Goalies'],
};

const STAT_COLS = {
  mlb_batting:  ['G','AB','R','H','2B','3B','HR','RBI','SB','BB','SO','AVG','OBP','SLG','OPS'],
  mlb_pitching: ['W','L','ERA','G','GS','IP','H','R','ER','BB','SO','WHIP'],
  mlb_fielding: ['G','GS','TC','PO','A','E','DP','FP'],
  nba:          ['G','MIN','PTS','REB','AST','STL','BLK','TO','FG%','3P%','FT%'],
  nfl_passing:  ['G','C/ATT','YDS','TD','INT','RTG'],
  nfl_rushing:  ['G','CAR','YDS','AVG','TD'],
  nfl_receiving:['G','REC','YDS','AVG','TD'],
  nhl_skating:  ['G','A','PTS','+/-','PIM','SOG','PPG','SHG'],
  nhl_goalie:   ['GP','W','L','GAA','SV%','SO'],
};
const MLB_PITCH_POS = new Set(['P','SP','RP','CL','CP','LHP','RHP']);
const NFL_PASS_POS  = new Set(['QB']);
const NFL_RUSH_POS  = new Set(['RB','FB','HB']);
const NFL_REC_POS   = new Set(['WR','TE','E','SE','FL']);
const NHL_GOAL_POS  = new Set(['G']);

const MLB_SPLITS = [
  { label: 'Regular Season', key: null },
  { label: 'vs. Left',  key: 'vs. Left' },
  { label: 'vs. Right', key: 'vs. Right' },
  { label: 'Home',      key: 'Home' },
  { label: 'Away',      key: 'Away' },
];

function parseStatsCats(data) {
  const cats = data?.splits?.categories || [];
  const out = {};
  cats.forEach((cat) => {
    out[cat.name] = {};
    (cat.stats || []).forEach((s) => { if (s.abbreviation) out[cat.name][s.abbreviation] = s.displayValue; });
  });
  return out;
}

function getSplitStats(splitsData, splitKey) {
  const labels = splitsData?.labels || [];
  const breakdown = splitsData?.splitCategories?.find((c) => c.name === 'byBreakdown');
  const splitRow = breakdown?.splits?.find((s) => s.displayName === splitKey);
  if (!splitRow) return null;
  const stats = {};
  labels.forEach((lbl, i) => { stats[lbl] = splitRow.stats?.[i] ?? '—'; });
  return stats;
}

function StatsTable({ rows, cols, onPlayerClick }) {
  if (!rows.length) return <div className="tp-stats-empty">No stats available.</div>;
  return (
    <div className="tp-stats-table-wrap">
      <table className="tp-stats-table">
        <thead>
          <tr>
            <th className="tp-stats-th tp-stats-th-name">PLAYER</th>
            {cols.map((c) => <th key={c} className="tp-stats-th">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i}
              className={`tp-stats-tr${row.id ? ' tp-stats-tr-link' : ''}`}
              onClick={() => row.id && onPlayerClick(row.id)}>
              <td className="tp-stats-td tp-stats-td-name">
                {row.headshot && <img src={row.headshot} alt="" className="tp-stats-avatar" />}
                <div className="tp-stats-name-col">
                  <span className="tp-stats-name">{row.name}</span>
                  <span className="tp-stats-pos">{row.pos}</span>
                </div>
              </td>
              {cols.map((c) => (
                <td key={c} className="tp-stats-td">{row.stats?.[c] ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatsTab({ sport, teamId }) {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

  const [statsType, setStatsType] = useState((STAT_TYPES[sport] || STAT_TYPES.mlb)[0]);
  const [statsYear, setStatsYear] = useState(currentYear);
  const [statsSplit, setStatsSplit] = useState(null);
  const [playerData, setPlayerData] = useState([]); // [{id, name, pos, group, headshot, cats:{batting:{},pitching:{},fielding:{}}}]
  const [loading, setLoading] = useState(false);
  const [splitLoading, setSplitLoading] = useState(false);
  const [splitCache, setSplitCache] = useState({}); // key `${id}-${year}` → splits data

  const statsCache = useRef({}); // key `${id}-${year}` → cats map

  // Fetch roster + season stats
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setStatsSplit(null);
      try {
        const rosterGroups = await getTeamRoster(sport, teamId);
        const allPlayers = rosterGroups.flatMap((g) =>
          (g.items || []).map((p) => ({
            id: p.id,
            name: p.displayName || p.fullName,
            pos: p.position?.abbreviation || '',
            group: g.position || '',
            headshot: p.headshot?.href || null,
          }))
        );

        const results = await Promise.allSettled(
          allPlayers.map(async (p) => {
            const cacheKey = `${p.id}-${statsYear}`;
            if (statsCache.current[cacheKey]) return { ...p, cats: statsCache.current[cacheKey] };
            try {
              const { data } = await getPlayerSeasonStats(sport, p.id, statsYear);
              const cats = parseStatsCats(data);
              statsCache.current[cacheKey] = cats;
              return { ...p, cats };
            } catch { return { ...p, cats: {} }; }
          })
        );

        if (!cancelled) {
          setPlayerData(results.filter((r) => r.status === 'fulfilled').map((r) => r.value));
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [sport, teamId, statsYear]);

  // Fetch splits when a split key is selected
  useEffect(() => {
    if (!statsSplit) return;
    const playersToFetch = playerData.filter((p) => !splitCache[`${p.id}-${statsYear}`]);
    if (!playersToFetch.length) return;

    setSplitLoading(true);
    Promise.allSettled(
      playersToFetch.map(async (p) => {
        try {
          const data = await getPlayerSplits(sport, p.id, statsYear);
          return { id: p.id, data };
        } catch { return { id: p.id, data: null }; }
      })
    ).then((results) => {
      const newCache = { ...splitCache };
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value.data) {
          newCache[`${r.value.id}-${statsYear}`] = r.value.data;
        }
      });
      setSplitCache(newCache);
      setSplitLoading(false);
    });
  }, [statsSplit, statsYear]);

  const types = STAT_TYPES[sport] || STAT_TYPES.mlb;

  const buildRows = () => {
    if (!playerData.length) return { cols: [], rows: [] };

    const getStat = (p, category, col) => {
      if (statsSplit) {
        const splitsData = splitCache[`${p.id}-${statsYear}`];
        if (!splitsData) return p.cats?.[category]?.[col] ?? '—';
        const splitStats = getSplitStats(splitsData, statsSplit);
        return splitStats?.[col] ?? p.cats?.[category]?.[col] ?? '—';
      }
      return p.cats?.[category]?.[col] ?? '—';
    };

    if (sport === 'mlb') {
      if (statsType === 'Batting') {
        const rows = playerData
          .filter((p) => !MLB_PITCH_POS.has(p.pos))
          .map((p) => ({
            ...p,
            stats: Object.fromEntries(STAT_COLS.mlb_batting.map((c) => [c, getStat(p, 'batting', c)])),
          }))
          .filter((p) => p.stats.AB && p.stats.AB !== '—' && p.stats.AB !== '0')
          .sort((a, b) => (parseInt(b.stats.AB) || 0) - (parseInt(a.stats.AB) || 0));
        return { cols: STAT_COLS.mlb_batting, rows };
      }
      if (statsType === 'Pitching') {
        const rows = playerData
          .filter((p) => MLB_PITCH_POS.has(p.pos) || p.cats?.pitching?.IP)
          .map((p) => ({
            ...p,
            stats: Object.fromEntries(STAT_COLS.mlb_pitching.map((c) => [c, getStat(p, 'pitching', c)])),
          }))
          .filter((p) => p.stats.IP && p.stats.IP !== '—')
          .sort((a, b) => (parseFloat(b.stats.IP) || 0) - (parseFloat(a.stats.IP) || 0));
        return { cols: STAT_COLS.mlb_pitching, rows };
      }
      if (statsType === 'Fielding') {
        const rows = playerData
          .map((p) => ({
            ...p,
            stats: Object.fromEntries(STAT_COLS.mlb_fielding.map((c) => [c, getStat(p, 'fielding', c)])),
          }))
          .filter((p) => p.stats.G && p.stats.G !== '—' && p.stats.G !== '0')
          .sort((a, b) => (parseInt(b.stats.G) || 0) - (parseInt(a.stats.G) || 0));
        return { cols: STAT_COLS.mlb_fielding, rows };
      }
    }

    if (sport === 'nba') {
      const rows = playerData
        .map((p) => {
          const allStats = { ...p.cats?.offensive, ...p.cats?.defensive, ...p.cats?.general };
          return { ...p, stats: Object.fromEntries(STAT_COLS.nba.map((c) => [c, allStats[c] ?? '—'])) };
        })
        .filter((p) => p.stats.G && p.stats.G !== '—' && p.stats.G !== '0')
        .sort((a, b) => (parseFloat(b.stats.PTS) || 0) - (parseFloat(a.stats.PTS) || 0));
      return { cols: STAT_COLS.nba, rows };
    }

    if (sport === 'nfl') {
      const colKey = `nfl_${statsType.toLowerCase()}`;
      const cols = STAT_COLS[colKey] || STAT_COLS.nfl_passing;
      const posFilter = statsType === 'Passing' ? NFL_PASS_POS
        : statsType === 'Rushing' ? NFL_RUSH_POS : NFL_REC_POS;
      const catName = statsType.toLowerCase();
      const rows = playerData
        .filter((p) => posFilter.has(p.pos) || p.cats?.[catName])
        .map((p) => {
          const allStats = p.cats?.[catName] || {};
          return { ...p, stats: Object.fromEntries(cols.map((c) => [c, allStats[c] ?? '—'])) };
        })
        .filter((p) => p.stats.G && p.stats.G !== '—')
        .sort((a, b) => (parseFloat(b.stats.YDS) || 0) - (parseFloat(a.stats.YDS) || 0));
      return { cols, rows };
    }

    if (sport === 'nhl') {
      const isGoalie = statsType === 'Goalies';
      const cols = isGoalie ? STAT_COLS.nhl_goalie : STAT_COLS.nhl_skating;
      const rows = playerData
        .filter((p) => isGoalie ? NHL_GOAL_POS.has(p.pos) : !NHL_GOAL_POS.has(p.pos))
        .map((p) => {
          const allStats = { ...p.cats?.skating, ...p.cats?.goaltending, ...p.cats?.general };
          return { ...p, stats: Object.fromEntries(cols.map((c) => [c, allStats[c] ?? '—'])) };
        })
        .filter((p) => Object.values(p.stats).some((v) => v && v !== '—'))
        .sort((a, b) => (parseFloat(b.stats.PTS || b.stats.W) || 0) - (parseFloat(a.stats.PTS || a.stats.W) || 0));
      return { cols, rows };
    }

    return { cols: [], rows: [] };
  };

  const { cols, rows } = loading ? { cols: [], rows: [] } : buildRows();
  const showSplits = sport === 'mlb' && statsType === 'Batting';

  return (
    <div className="tp-stats-wrap">
      {/* Controls */}
      <div className="tp-stats-controls">
        <div className="tp-stats-type-tabs">
          {types.map((t) => (
            <button key={t}
              className={`tp-stats-type-tab ${statsType === t ? 'tp-stats-type-active' : ''}`}
              onClick={() => { setStatsType(t); setStatsSplit(null); }}>
              {t}
            </button>
          ))}
        </div>
        <div className="tp-stats-dropdowns">
          <select className="tp-stats-select" value={statsYear} onChange={(e) => setStatsYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {showSplits && (
            <select className="tp-stats-select" value={statsSplit || ''} onChange={(e) => setStatsSplit(e.target.value || null)}>
              {MLB_SPLITS.map((s) => (
                <option key={s.label} value={s.key || ''}>{s.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {(loading || splitLoading) && <div className="tp-loading">Loading stats…</div>}
      {!loading && !splitLoading && (
        <StatsTable rows={rows} cols={cols} onPlayerClick={(id) => navigate(`/player/${sport}/${id}`)} />
      )}
    </div>
  );
}

/* ─── ROSTER TAB ─────────────────────────────────────── */
function RosterTab({ sport, teamId }) {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTeamRoster(sport, teamId)
      .then(setGroups).catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, [sport, teamId]);

  if (loading) return <div className="tp-loading">Loading roster…</div>;
  if (!groups.length) return <div className="tp-loading">Roster unavailable.</div>;

  const isMLB = sport === 'mlb';

  return (
    <div className="tp-roster-wrap">
      {groups.map((group) => (
        <div key={group.position} className="tp-roster-group">
          <div className="tp-roster-group-header">{group.position}</div>
          <div className="tp-roster-table-wrap">
            <table className="tp-roster-table">
              <thead>
                <tr>
                  <th className="tp-roster-th tp-roster-th-num">#</th>
                  <th className="tp-roster-th tp-roster-th-name">NAME</th>
                  <th className="tp-roster-th">POS</th>
                  <th className="tp-roster-th">AGE</th>
                  <th className="tp-roster-th tp-roster-th-hw">HT / WT</th>
                  {isMLB && <th className="tp-roster-th">B/T</th>}
                  <th className="tp-roster-th">EXP</th>
                </tr>
              </thead>
              <tbody>
                {(group.items || []).map((p) => {
                  const inj = p.injuries?.[0];
                  return (
                    <tr key={p.id}
                      className="tp-roster-tr tp-roster-tr-link"
                      onClick={() => navigate(`/player/${sport}/${p.id}`)}>
                      <td className="tp-roster-td tp-roster-td-num">{p.jersey || '—'}</td>
                      <td className="tp-roster-td tp-roster-td-name">
                        {p.headshot?.href && <img src={p.headshot.href} alt="" className="tp-roster-headshot" />}
                        <div>
                          <div className="tp-roster-name">{p.displayName || p.fullName}</div>
                          {inj && <div className="tp-inj-tag tp-inj-tag-sm">{inj.type?.abbreviation || inj.status || 'INJ'}</div>}
                        </div>
                      </td>
                      <td className="tp-roster-td">{p.position?.abbreviation || '—'}</td>
                      <td className="tp-roster-td">{p.age || '—'}</td>
                      <td className="tp-roster-td tp-roster-td-hw">{p.displayHeight} / {p.displayWeight}</td>
                      {isMLB && <td className="tp-roster-td">{p.bats?.abbreviation || '—'}/{p.throws?.abbreviation || '—'}</td>}
                      <td className="tp-roster-td">{p.experience?.years != null ? (p.experience.years === 0 ? 'R' : p.experience.years) : '—'}</td>
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

/* ─── DEPTH CHART TAB ────────────────────────────────── */
const DEPTH_ORDER = {
  mlb: ['sp','cl','rp','c','1b','2b','3b','ss','lf','cf','rf','dh','p'],
  nba: ['pg','sg','sf','pf','c'],
  nfl: ['qb','rb','wr','te','lt','lg','c','rg','rt','de','dt','lb','cb','s','k','p'],
  nhl: ['c','lw','rw','ld','rd','g'],
};
const POS_LABELS = {
  sp:'SP', cl:'CL', rp:'RP', c:'C', '1b':'1B', '2b':'2B', '3b':'3B',
  ss:'SS', lf:'LF', cf:'CF', rf:'RF', dh:'DH', p:'P',
  pg:'PG', sg:'SG', sf:'SF', pf:'PF',
  qb:'QB', rb:'RB', wr:'WR', te:'TE', lt:'LT', lg:'LG', rg:'RG', rt:'RT',
  de:'DE', dt:'DT', lb:'LB', cb:'CB', s:'S', k:'K',
  lw:'LW', rw:'RW', ld:'LD', rd:'RD', g:'G',
};

function DepthChartTab({ sport, teamId }) {
  const navigate = useNavigate();
  const [depthData, setDepthData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTeamDepthChart(sport, teamId)
      .then(setDepthData).catch(() => setDepthData(null))
      .finally(() => setLoading(false));
  }, [sport, teamId]);

  if (loading) return <div className="tp-loading">Loading depth chart…</div>;
  if (!depthData) return <div className="tp-loading">Depth chart unavailable.</div>;

  const positions = depthData.depthchart?.[0]?.positions || {};
  const order = DEPTH_ORDER[sport] || Object.keys(positions);
  const posKeys = [...order.filter((k) => positions[k]), ...Object.keys(positions).filter((k) => !order.includes(k))];

  return (
    <div className="tp-depth-wrap">
      {posKeys.map((posKey) => {
        const posData = positions[posKey];
        if (!posData) return null;
        const athletes = posData.athletes || [];
        const posLabel = POS_LABELS[posKey] || posKey.toUpperCase();
        return (
          <div key={posKey} className="tp-depth-position">
            <div className="tp-depth-pos-label">{posLabel}</div>
            <div className="tp-depth-players">
              {athletes.map((ath, idx) => {
                const inj = ath.injuries?.[0];
                return (
                  <div key={ath.id || idx}
                    className={`tp-depth-player${ath.id ? ' tp-depth-player-link' : ''}`}
                    onClick={() => ath.id && navigate(`/player/${sport}/${ath.id}`)}>
                    <span className="tp-depth-rank">{idx + 1}</span>
                    <span className="tp-depth-name">{ath.shortName || ath.displayName}</span>
                    {inj && (
                      <span className={`tp-inj-tag tp-inj-tag-${inj.type?.abbreviation?.toLowerCase().includes('60') ? 'il60' : inj.type?.abbreviation?.toLowerCase().includes('10') ? 'il10' : 'day'}`}>
                        {inj.type?.abbreviation || inj.status || 'INJ'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── INJURIES TAB ───────────────────────────────────── */
function InjuriesTab({ sport, teamId }) {
  const navigate = useNavigate();
  const [injured, setInjured] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTeamRoster(sport, teamId)
      .then((groups) => {
        const list = [];
        groups.forEach((g) => {
          (g.items || []).forEach((p) => {
            (p.injuries || []).forEach((inj) => {
              list.push({ player: p, inj, group: g.position });
            });
          });
        });
        setInjured(list);
      })
      .catch(() => setInjured([]))
      .finally(() => setLoading(false));
  }, [sport, teamId]);

  if (loading) return <div className="tp-loading">Loading injuries…</div>;

  if (!injured.length) {
    return (
      <div className="tp-injuries-empty">
        <div className="empty-icon">✅</div>
        <p>No reported injuries.</p>
      </div>
    );
  }

  return (
    <div className="tp-injuries-wrap">
      {injured.map(({ player, inj }, i) => {
        const statusCls = inj.type?.abbreviation?.toLowerCase().includes('60') ? 'il60'
          : inj.type?.abbreviation?.toLowerCase().includes('10') ? 'il10' : 'day';
        return (
          <div key={i}
            className={`tp-inj-row${player.id ? ' tp-inj-row-link' : ''}`}
            onClick={() => player.id && navigate(`/player/${sport}/${player.id}`)}>
            {player.headshot?.href && <img src={player.headshot.href} alt="" className="tp-inj-headshot" />}
            <div className="tp-inj-info">
              <div className="tp-inj-name">{player.displayName || player.fullName}</div>
              <div className="tp-inj-pos">{player.position?.abbreviation} · {player.jersey ? `#${player.jersey}` : ''}</div>
              {inj.longComment && <div className="tp-inj-comment">{inj.longComment}</div>}
            </div>
            <div className="tp-inj-right">
              <span className={`tp-inj-tag tp-inj-tag-${statusCls}`}>
                {inj.type?.abbreviation || inj.status || 'INJ'}
              </span>
              {inj.date && <div className="tp-inj-date">{new Date(inj.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── STANDINGS TAB (division only) ─────────────────── */
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
    { key: 'PA', label: 'PA' }, { key: 'DIFF', label: 'DIFF' }, { key: 'STRK', label: 'STRK' },
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
    if (s.name) result[s.name] = s.displayValue;
  });
  return result;
}

function StandingsTab({ sport, teamId }) {
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStandings(sport)
      .then(setStandings).catch(() => setStandings(null))
      .finally(() => setLoading(false));
  }, [sport]);

  if (loading) return <div className="tp-loading">Loading standings…</div>;
  if (!standings) return <div className="tp-loading">Standings unavailable.</div>;

  const cols = STANDINGS_COLS[sport] || STANDINGS_COLS.mlb;

  // Collect all groups and find the one containing this team
  const allGroups = [];
  const walk = (node) => {
    const entries = node.standings?.entries || [];
    if (entries.length > 0) allGroups.push({ name: node.name, entries });
    (node.children || []).forEach(walk);
  };
  walk(standings);

  const myGroup = allGroups.find((g) => g.entries.some((e) => e.team?.id === String(teamId)));
  if (!myGroup) return <div className="tp-loading">Division standings not available.</div>;

  return (
    <div className="tp-standings-v2">
      <div className="tp-div-block tp-div-mine">
        <div className="tp-div-header">{myGroup.name}</div>
        <div className="tp-table-wrap">
          <table className="tp-table">
            <thead>
              <tr>
                <th className="tp-th tp-th-team">TEAM</th>
                {cols.map((c) => <th key={c.key} className="tp-th">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {myGroup.entries.map((entry, i) => {
                const team = entry.team || {};
                const stats = getStatMap(entry);
                const isMyTeam = team.id === String(teamId);
                const logo = team.logos?.[0]?.href;
                const strk = stats['STRK'] || stats['streak'] || '';
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
                      const isWin = strk.startsWith('W');
                      return (
                        <td key={c.key} className={`tp-td ${c.hl ? 'tp-td-hl' : ''} ${isStrk && isWin ? 'tp-strk-win' : isStrk ? 'tp-strk-loss' : ''}`}>
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
    </div>
  );
}

/* ─── NEWS TAB ───────────────────────────────────────── */
function NewsTab({ sport, teamId }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTeamNews(sport, teamId, 12)
      .then(setArticles).catch(() => setArticles([]))
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
        return (
          <a key={a.id} href={a.links?.web?.href || '#'} target="_blank" rel="noopener noreferrer" className="tp-news-card">
            {img && <img src={img} alt="" className="tp-news-img" />}
            <div className="tp-news-body">
              <div className="tp-news-headline">{a.headline}</div>
              {a.description && <div className="tp-news-desc">{a.description}</div>}
              <div className="tp-news-meta">{pub ? formatTimeAgo(pub) : ''} · ESPN</div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */
const TABS = ['Home', 'Stats', 'Schedule', 'Roster', 'Depth Chart', 'Injuries', 'News'];

export default function TeamPage() {
  const { sport, teamId } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Home');

  useEffect(() => {
    setLoading(true);
    setActiveTab('Home');
    getTeamInfo(sport, teamId)
      .then((t) => {
        setTeam(t);
        if (t?.displayName) {
          recordTeamView({ id: teamId, sport, name: t.displayName, abbreviation: t.abbreviation || '', logo: t.logos?.[0]?.href || null });
        }
      })
      .catch(() => setTeam(null))
      .finally(() => setLoading(false));
  }, [sport, teamId]);

  const sportLabel = SPORTS[sport]?.label || sport.toUpperCase();
  const accentColor = team?.color ? `#${team.color}` : '#7c3aed';

  return (
    <div className="tp-page">
      <button className="tp-back" onClick={() => navigate('/')}>← Dashboard</button>

      {loading ? (
        <div className="skeleton-card" style={{ height: 120, borderRadius: 12, marginBottom: 24 }} />
      ) : team ? (
        <div className="tp-header" style={{ '--team-color': accentColor }}>
          <div className="tp-header-inner">
            {team.logos?.[0]?.href && <DLogo url={team.logos[0].href} className="tp-header-logo" />}
            <div className="tp-header-info">
              <div className="tp-header-name">
                <span className="tp-header-location">{team.location}</span>{' '}
                <span className="tp-header-nickname">{team.name}</span>
              </div>
              <div className="tp-header-meta">
                <span className="tp-header-record">{team.record?.items?.[0]?.summary}</span>
                {team.standingSummary && <span className="tp-header-standing"> · {team.standingSummary}</span>}
                <span className="tp-header-sport"> · {sportLabel}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="error-banner">Could not load team info.</div>
      )}

      {/* Tabs — scrollable row for mobile */}
      <div className="tp-tabs">
        {TABS.map((tab) => (
          <button key={tab}
            className={`tp-tab ${activeTab === tab ? 'tp-tab-active' : ''}`}
            onClick={() => setActiveTab(tab)}
            style={{ '--team-color': accentColor }}>
            {tab}
          </button>
        ))}
      </div>

      <div className="tp-content">
        {activeTab === 'Home'        && <HomeTab sport={sport} teamId={teamId} onViewSchedule={() => setActiveTab('Schedule')} />}
        {activeTab === 'Stats'       && <StatsTab sport={sport} teamId={teamId} />}
        {activeTab === 'Schedule'    && <FullScheduleTab sport={sport} teamId={teamId} />}
        {activeTab === 'Roster'      && <RosterTab sport={sport} teamId={teamId} />}
        {activeTab === 'Depth Chart' && <DepthChartTab sport={sport} teamId={teamId} />}
        {activeTab === 'Injuries'    && <InjuriesTab sport={sport} teamId={teamId} />}
        {activeTab === 'News'        && <NewsTab sport={sport} teamId={teamId} />}
      </div>
    </div>
  );
}
