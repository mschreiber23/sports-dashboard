import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getScoreboard, SPORTS, getTeamLogo, getTeamLogoFallback } from '../api/espn';
import { useFavorites } from '../context/FavoritesContext';

function getScore(c) {
  const s = c?.score;
  if (s == null) return null;
  return typeof s === 'object' ? s.displayValue : String(s);
}

function LogoImg({ team, className }) {
  const dark = getTeamLogo(team);
  const orig = getTeamLogoFallback(team);
  if (!dark && !orig) return null;
  return (
    <img
      src={dark || orig}
      onError={(e) => { if (orig && e.target.src !== orig) { e.target.onerror = null; e.target.src = orig; } }}
      alt=""
      className={className}
    />
  );
}

function toDateStr(date) {
  return date.getFullYear().toString()
    + String(date.getMonth() + 1).padStart(2, '0')
    + String(date.getDate()).padStart(2, '0');
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

/* ── Mini base diamond ───────────────────────────────── */
function MiniDiamond({ onFirst, onSecond, onThird }) {
  return (
    <svg viewBox="0 0 24 24" className="mini-diamond">
      <rect x="9" y="1" width="6" height="6" rx="1" className={`mini-base ${onSecond ? 'mini-base-on' : ''}`} transform="rotate(45 12 4)" />
      <rect x="1" y="9" width="6" height="6" rx="1" className={`mini-base ${onThird ? 'mini-base-on' : ''}`} transform="rotate(45 4 12)" />
      <rect x="17" y="9" width="6" height="6" rx="1" className={`mini-base ${onFirst ? 'mini-base-on' : ''}`} transform="rotate(45 20 12)" />
      <rect x="9" y="17" width="6" height="6" rx="1" className="mini-base" transform="rotate(45 12 20)" />
    </svg>
  );
}

/* ── Compact ticker card ──────────────────────────────── */
function TickerCard({ game, sport, myTeamIds, mlbScore }) {
  const navigate = useNavigate();
  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const status = comp?.status;
  const state = status?.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post';
  const isPre = state === 'pre';
  const shortDetail = status?.type?.shortDetail || '';
  // Use MLB live score if available (more real-time than ESPN)
  const awayScore = mlbScore?.awayRuns ?? getScore(away);
  const homeScore = mlbScore?.homeRuns ?? getScore(home);
  const isMine = myTeamIds.some((id) => competitors.some((c) => c.team?.id === id));
  const broadcast = comp?.broadcasts?.[0]?.names?.[0] || '';
  const sit = comp?.situation || {};
  const outs = sit.outs ?? null;
  const onFirst = !!sit.onFirst;
  const onSecond = !!sit.onSecond;
  const onThird = !!sit.onThird;

  /* ── PRE-GAME layout ── */
  if (isPre) return (
    <button className={`ticker-card ${isMine ? 'ticker-card-mine' : ''}`} onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}>
      <div className="ticker-status">
        <span className="ticker-pregame-time">
          {shortDetail.includes(' - ') ? shortDetail.split(' - ').slice(1).join(' - ') : shortDetail}
        </span>
      </div>
      <div className="ticker-teams">
        {[away, home].filter(Boolean).map((c) => (
          <div key={c.team?.id} className={`ticker-team ${myTeamIds.includes(c.team?.id) ? 'ticker-my-team' : ''}`}>
            <div className="ticker-team-left">
              <LogoImg team={c.team} className="ticker-logo" />
              <span className="ticker-abbr">{c.team?.abbreviation}</span>
            </div>
            {c.records?.[0]?.summary && <span className="ticker-record-right">{c.records[0].summary}</span>}
          </div>
        ))}
      </div>
      <div className="ticker-bottom">
        {broadcast && <span className="ticker-broadcast-bottom">{broadcast}</span>}
      </div>
    </button>
  );

  /* ── LIVE layout ── */
  if (isLive) return (
    <button className={`ticker-card ticker-card-live-style ${isMine ? 'ticker-card-mine' : ''}`} onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}>
      <div className="ticker-status">
        <span className="ticker-live"><span className="live-dot" />{
          // Prefer MLB inning string for MLB games
          (sport === 'mlb' && mlbScore?.inning && mlbScore?.inningHalf)
            ? `${mlbScore.inningHalf === 'Bottom' ? 'BOT' : 'TOP'} ${mlbScore.inning}`
            : shortDetail
        }</span>
        {broadcast && <span className="ticker-broadcast">{broadcast}</span>}
      </div>
      <div className="ticker-teams">
        {[away, home].filter(Boolean).map((c) => {
          const score = c.homeAway === 'away' ? awayScore : homeScore;
          return (
            <div key={c.team?.id} className={`ticker-team ${myTeamIds.includes(c.team?.id) ? 'ticker-my-team' : ''}`}>
              <div className="ticker-team-left">
                <LogoImg team={c.team} className="ticker-logo" />
                <span className="ticker-abbr">{c.team?.abbreviation}</span>
              </div>
              <span className={`ticker-score ${c.winner ? 'ticker-score-win' : ''}`}>{score ?? '0'}</span>
            </div>
          );
        })}
      </div>
      <div className="ticker-bottom ticker-bottom-live">
        <div className="ticker-situation">
          <MiniDiamond onFirst={onFirst} onSecond={onSecond} onThird={onThird} />
          {outs !== null && <span className="ticker-outs">{outs} Out{outs !== 1 ? 's' : ''}</span>}
        </div>
      </div>
    </button>
  );

  /* ── FINAL layout ── */
  return (
    <button className={`ticker-card ${isMine ? 'ticker-card-mine' : ''}`} onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}>
      <div className="ticker-status">
        <span className="ticker-final">Final</span>
      </div>
      <div className="ticker-teams">
        {[away, home].filter(Boolean).map((c) => {
          const score = c.homeAway === 'away' ? awayScore : homeScore;
          return (
            <div key={c.team?.id} className={`ticker-team ${c.winner ? 'ticker-winner' : ''} ${myTeamIds.includes(c.team?.id) ? 'ticker-my-team' : ''}`}>
              <div className="ticker-team-left">
                <LogoImg team={c.team} className="ticker-logo" />
                <div>
                  <span className="ticker-abbr">{c.team?.abbreviation}</span>
                  {c.records?.[0]?.summary && <span className="ticker-record"> {c.records[0].summary}</span>}
                </div>
              </div>
              <span className={`ticker-score ${c.winner ? 'ticker-score-win' : ''}`}>{score ?? '0'}</span>
            </div>
          );
        })}
      </div>
      <div className="ticker-bottom" />
    </button>
  );
}

/* ── Full grid card — same design as ticker, just larger ── */
function GridCard({ game, sport, myTeamIds, mlbScore }) {
  const navigate = useNavigate();
  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const status = comp?.status;
  const state = status?.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post';
  const isPre = state === 'pre';
  const shortDetail = status?.type?.shortDetail || '';
  const isMine = myTeamIds.some((id) => competitors.some((c) => c.team?.id === id));
  const awayScoreG = mlbScore?.awayRuns ?? getScore(away);
  const homeScoreG = mlbScore?.homeRuns ?? getScore(home);
  const broadcast = comp?.broadcasts?.[0]?.names?.[0] || '';
  const sit = comp?.situation || {};
  const outs = sit.outs ?? null;
  const onFirst = !!sit.onFirst;
  const onSecond = !!sit.onSecond;
  const onThird = !!sit.onThird;

  if (isPre) return (
    <button className={`grid-card ${isMine ? 'grid-card-mine' : ''}`} onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}>
      <div className="grid-card-top">
        <span className="grid-card-time">{shortDetail.includes(' - ') ? shortDetail.split(' - ').slice(1).join(' - ') : shortDetail}</span>
      </div>
      <div className="grid-card-teams">
        {[away, home].filter(Boolean).map((c) => (
          <div key={c.team?.id} className={`grid-card-team ${myTeamIds.includes(c.team?.id) ? 'grid-my-team' : ''}`}>
            <div className="grid-team-left">
              <LogoImg team={c.team} className="grid-logo" />
              <span className="grid-abbr">{c.team?.abbreviation}</span>
            </div>
            {c.records?.[0]?.summary && <span className="grid-record">{c.records[0].summary}</span>}
          </div>
        ))}
      </div>
      {broadcast && <div className="grid-card-bottom"><span className="grid-broadcast">{broadcast}</span></div>}
    </button>
  );

  if (isLive) return (
    <button className={`grid-card grid-card-live ${isMine ? 'grid-card-mine' : ''}`} onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}>
      <div className="grid-card-top">
        <span className="grid-live"><span className="live-dot" />{shortDetail}</span>
        {broadcast && <span className="grid-broadcast">{broadcast}</span>}
      </div>
      <div className="grid-card-teams">
        {[away, home].filter(Boolean).map((c) => (
          <div key={c.team?.id} className={`grid-card-team ${myTeamIds.includes(c.team?.id) ? 'grid-my-team' : ''}`}>
            <div className="grid-team-left">
              <LogoImg team={c.team} className="grid-logo" />
              <span className="grid-abbr">{c.team?.abbreviation}</span>
            </div>
            <span className="grid-score">{(c.homeAway === 'away' ? awayScoreG : homeScoreG) ?? '0'}</span>
          </div>
        ))}
      </div>
      <div className="grid-card-bottom grid-card-bottom-right">
        <MiniDiamond onFirst={onFirst} onSecond={onSecond} onThird={onThird} />
        {outs !== null && <span className="grid-outs">{outs} Out{outs !== 1 ? 's' : ''}</span>}
      </div>
    </button>
  );

  return (
    <button className={`grid-card ${isMine ? 'grid-card-mine' : ''}`} onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}>
      <div className="grid-card-top">
        <span className="grid-final">Final</span>
      </div>
      <div className="grid-card-teams">
        {[away, home].filter(Boolean).map((c) => (
          <div key={c.team?.id} className={`grid-card-team ${c.winner ? 'grid-winner' : ''} ${myTeamIds.includes(c.team?.id) ? 'grid-my-team' : ''}`}>
            <div className="grid-team-left">
              <LogoImg team={c.team} className="grid-logo" />
              <div>
                <span className="grid-abbr">{c.team?.abbreviation}</span>
                {c.records?.[0]?.summary && <span className="grid-record-sm"> {c.records[0].summary}</span>}
              </div>
            </div>
            <span className={`grid-score ${c.winner ? 'grid-score-win' : ''}`}>{getScore(c) ?? '0'}</span>
          </div>
        ))}
      </div>
      <div className="grid-card-bottom" />
    </button>
  );
}

/* ── MLB live score overlay via MLB Stats API ───────────
   Returns a map: ESPN game id → { awayRuns, homeRuns, awayHits, homeHits, awayErrors, homeErrors }
   Matched by comparing ESPN team displayNames to MLB team names.
──────────────────────────────────────────────────────── */
async function fetchMlbLiveScores(dateStr, espnGames) {
  try {
    const isoDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${isoDate}&hydrate=linescore`
    );
    const data = await res.json();
    const mlbGames = data.dates?.[0]?.games || [];

    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
    const map = {};

    for (const eg of espnGames) {
      const comps = eg.competitions?.[0]?.competitors || [];
      const ea = comps.find((c) => c.homeAway === 'away')?.team?.displayName;
      const eh = comps.find((c) => c.homeAway === 'home')?.team?.displayName;
      if (!ea || !eh) continue;

      const mlbGame = mlbGames.find((mg) => {
        const ma = mg.teams?.away?.team?.name;
        const mh = mg.teams?.home?.team?.name;
        return norm(ma) === norm(ea) && norm(mh) === norm(eh);
      });
      if (!mlbGame?.linescore) continue;

      const ls = mlbGame.linescore;
      map[eg.id] = {
        awayRuns:   ls.teams?.away?.runs   ?? null,
        homeRuns:   ls.teams?.home?.runs   ?? null,
        awayHits:   ls.teams?.away?.hits   ?? null,
        homeHits:   ls.teams?.home?.hits   ?? null,
        awayErrors: ls.teams?.away?.errors ?? null,
        homeErrors: ls.teams?.home?.errors ?? null,
        inning:     ls.currentInningOrdinal || '',
        inningHalf: ls.inningHalf || '',
      };
    }
    return map;
  } catch { return {}; }
}

/* ── Main Component ──────────────────────────────────── */
export default function TodaysScores({ compact = false }) {
  const { favorites, sportOrder, reorderSport } = useFavorites();
  const [activeSport, setActiveSport] = useState(sportOrder[0] || 'mlb');
  const [games, setGames] = useState([]);
  const [mlbScores, setMlbScores] = useState({}); // ESPN game id → live MLB score
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [editOrder, setEditOrder] = useState(false);
  const pollRef = useRef(null);

  // Date navigation
  const todayMidnight = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
  const [selectedDate, setSelectedDate] = useState(todayMidnight);
  const isToday = toDateStr(selectedDate) === toDateStr(todayMidnight());
  const shiftDate = (n) => setSelectedDate((d) => { const next = new Date(d); next.setDate(next.getDate() + n); return next; });

  const myTeamIds = favorites.teams.filter((t) => t.sport === activeSport).map((t) => t.team.id);

  // Re-fetch MLB live scores every 30s when viewing today's MLB
  const refreshMlbScores = useRef(null);
  refreshMlbScores.current = async (evts) => {
    if (activeSport !== 'mlb' || !isToday || !evts.length) return;
    const scores = await fetchMlbLiveScores(toDateStr(selectedDate), evts);
    setMlbScores(scores);
  };

  useEffect(() => {
    setLoading(true);
    setGames([]);
    setMlbScores({});
    clearInterval(pollRef.current);

    const dateStr = toDateStr(selectedDate);
    const stateOrder = { in: 0, post: 1, pre: 2 };

    const load = () =>
      getScoreboard(activeSport, dateStr)
        .then((evts) => {
          const sorted = [...evts].sort((a, b) => {
            const aMine = a.competitions?.[0]?.competitors?.some((c) => myTeamIds.includes(c.team?.id)) ? 0 : 1;
            const bMine = b.competitions?.[0]?.competitors?.some((c) => myTeamIds.includes(c.team?.id)) ? 0 : 1;
            if (aMine !== bMine) return aMine - bMine;
            const sa = a.competitions?.[0]?.status?.type?.state || 'pre';
            const sb = b.competitions?.[0]?.status?.type?.state || 'pre';
            return (stateOrder[sa] ?? 2) - (stateOrder[sb] ?? 2);
          });
          setGames(sorted);
          refreshMlbScores.current(sorted);
          return sorted;
        })
        .catch(() => { setGames([]); return []; });

    load().finally(() => setLoading(false));

    // Live polling: ESPN every 60s (for status changes), MLB every 30s (for scores)
    pollRef.current = setInterval(async () => {
      const evts = await load();
      await refreshMlbScores.current(evts);
    }, 30000);

    return () => clearInterval(pollRef.current);
  }, [activeSport, selectedDate]);

  const liveCount = games.filter((g) => g.competitions?.[0]?.status?.type?.state === 'in').length;

  return (
    <section className="section ts-section">
      {/* ── Ticker bar ── */}
      <div className="ts-ticker-bar">
        {/* Row 1: sport selector + expand button */}
        <div className="ts-top-row">
          <select
            className="ts-sport-select"
            value={activeSport}
            onChange={(e) => { setActiveSport(e.target.value); setGames([]); }}
          >
            {sportOrder.map((s) => (
              <option key={s} value={s}>{SPORTS[s]?.label}</option>
            ))}
          </select>

          {/* Date selector */}
          <div className="ts-date-nav">
            <button className="ts-date-btn" onClick={() => shiftDate(-1)}>‹</button>
            <span className="ts-date-label">{formatDateLabel(selectedDate)}</span>
            <button className="ts-date-btn" onClick={() => shiftDate(1)}>›</button>
          </div>

          <button className="ts-all-scores-btn" onClick={() => setExpanded((v) => !v)}>
            {expanded ? '✕ Close' : 'All Scores'}
          </button>
        </div>

        {/* Row 2: horizontal scrolling ticker */}
        <div className="ts-ticker-scroll">
          {loading && [1,2,3,4].map((i) => <div key={i} className="ticker-skeleton" />)}
          {!loading && games.length === 0 && <span className="ts-no-games">No games</span>}
          {!loading && games.map((game) => (
            <TickerCard key={game.id} game={game} sport={activeSport} myTeamIds={myTeamIds} mlbScore={mlbScores[game.id]} />
          ))}
        </div>
      </div>

      {/* ── Expanded full grid ── */}
      {expanded && (
        <div className="ts-expanded">
          <div className="ts-expanded-header">
            <span className="ts-expanded-title">
              {SPORTS[activeSport]?.label} · {formatDateLabel(selectedDate)}
              {liveCount > 0 && <span className="ts-live-badge" style={{marginLeft:8}}><span className="ts-live-dot" />{liveCount} Live</span>}
            </span>
            <button className="btn-ghost btn-sm" onClick={() => setExpanded(false)}>Close</button>
          </div>
          <div className="scores-grid">
            {games.map((game) => (
              <GridCard key={game.id} game={game} sport={activeSport} myTeamIds={myTeamIds} mlbScore={mlbScores[game.id]} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
