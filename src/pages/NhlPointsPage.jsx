import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadNhlSlate } from '../api/nhlSlate';
import { recentPlayerLogs } from '../api/playerLogs';
import { espnAbbr, matchupContext, teamRecentGames } from '../api/teamForm';
import { easternDay, formatDayLabel, loadGameProps, loadPropEvents, shiftDay } from '../api/polymarket';
import { usePropSync } from '../components/PropSync';
import { explainNhlPoint, nhlFactorLines, nhlPointChance } from '../utils/nhlEdge';

const POINTS = 'hockey_player_points';

function normName(name) {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

function clock(ms) {
  if (!ms) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

function scorePlayer(player, log, marketYes, calibration) {
  if (!log?.series?.[POINTS] || log.series[POINTS].length < 5) return null;
  const input = {
    recent: log.series[POINTS],
    prior: log.prior?.[POINTS] || [],
    recentContext: log.context,
    priorContext: log.priorContext,
    versus: log.versus?.[POINTS] || [],
    lastPlayed: log.lastPlayed,
    gameStart: player.gameStart,
    gameTotal: player.gameTotal,
    teamName: player.teamName,
    opponentName: player.opponentName,
    favoriteName: player.favoriteName,
    favoriteYes: player.favoriteYes,
    opponentLabel: player.opponentAbbr,
    opponentGoalsAgainst: player.opponentGoalsAgainst,
    home: player.home,
    marketYes,
    calibration,
  };
  const model = nhlPointChance(input);
  if (!model) return null;
  const lines = nhlFactorLines({ type: POINTS, line: 1, ...input });
  return {
    model,
    lines,
    why: explainNhlPoint(lines, { priced: model.priced, marketYes }),
  };
}

export default function NhlPointsPage() {
  const navigate = useNavigate();
  const { calibration } = usePropSync();
  const fitRef = useRef(calibration?.nhl);
  fitRef.current = calibration?.nhl;
  const [day, setDay] = useState(() => easternDay(Date.now()));
  const [players, setPlayers] = useState([]);
  const [games, setGames] = useState(0);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState('');
  const [loadingSlate, setLoadingSlate] = useState(true);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let cancel = false;
    setLoadingSlate(true);
    setError('');
    setPlayers([]);
    setDone(0);
    setSkipped(0);
    setGames(0);
    setTotal(0);
    setOpenId(null);

    (async () => {
      let slate = [];
      try {
        slate = await loadNhlSlate(day);
      } catch (err) {
        if (!cancel) setError(err?.message || 'Could not load the NHL slate.');
        if (!cancel) setLoadingSlate(false);
        return;
      }
      if (cancel) return;
      const list = slate.flatMap((game) => game.players);
      setGames(slate.length);
      setTotal(list.length);
      setLoadingSlate(false);
      if (!list.length) return;

      const forms = {};
      const abbrs = [...new Set(list.flatMap((player) => [player.teamAbbr, player.opponentAbbr]))];
      await Promise.all(abbrs.map(async (abbr) => {
        forms[`nhl|${espnAbbr(abbr)}`] = await teamRecentGames('nhl', abbr);
      }));
      if (cancel) return;

      const prices = {};
      let pricesReady = false;
      let cursor = 0;
      let finished = 0;
      let missed = 0;
      const scored = [];

      function show() {
        if (cancel) return;
        setDone(finished);
        setSkipped(missed);
        setPlayers(scored.map((row) => ({ ...row })));
      }

      function applyPrices() {
        for (let i = 0; i < scored.length; i += 1) {
          const row = scored[i];
          const marketYes = prices[normName(row.name)];
          const read = scorePlayer(row, row.log, marketYes, fitRef.current);
          if (read) scored[i] = { ...row, marketYes, ...read };
        }
        show();
      }

      const priceJob = (async () => {
        try {
          const events = await loadPropEvents();
          const slugs = (events || [])
            .filter((event) => event.league === 'nhl' && easternDay(event.gameStart) === day)
            .map((event) => event.key);
          const rows = (await Promise.all(slugs.map((slug) => loadGameProps(slug).catch(() => [])))).flat();
          for (const row of rows) {
            if (row.type !== POINTS || row.line !== 1 || typeof row.yes !== 'number') continue;
            prices[normName(row.player)] = row.yes;
          }
        } catch { /* the projection still ranks the day */ }
        pricesReady = true;
        applyPrices();
      })();

      async function worker() {
        while (cursor < list.length) {
          const player = list[cursor++];
          let log = null;
          try {
            const result = await recentPlayerLogs('nhl', [{
              name: player.name,
              athleteId: player.id,
              opponentAbbr: player.opponentAbbr,
              opponentName: player.opponentName,
              before: player.gameStart,
            }]);
            log = result[player.name] || null;
            const context = matchupContext(forms, 'nhl', player.teamAbbr, player.opponentAbbr, player.gameStart);
            const withForm = {
              ...player,
              opponentGoalsAgainst: context.opponentGoalsAgainst,
              home: context.home == null ? player.home : context.home,
            };
            const marketYes = pricesReady ? prices[normName(player.name)] : undefined;
            const read = scorePlayer(withForm, log, marketYes, fitRef.current);
            if (!read) missed += 1;
            else scored.push({ ...withForm, log, marketYes, ...read });
          } catch {
            missed += 1;
          }
          finished += 1;
          show();
        }
      }
      await Promise.all([
        priceJob,
        ...Array.from({ length: Math.min(6, list.length) }, worker),
      ]);
      pricesReady = true;
      applyPrices();
    })();

    return () => { cancel = true; };
  }, [day]);

  const ranked = useMemo(() => (
    players
      .filter((row) => row.model)
      .slice()
      .sort((a, b) => b.model.p - a.model.p || a.name.localeCompare(b.name))
  ), [players]);

  return (
    <div className="nhl-points">
      <h1 className="page-title">Point chances</h1>
      <p className="nhl-points-note">
        Every healthy skater on the slate, ranked by the model’s chance of at least one point.
      </p>
      <div className="props-day-nav">
        <button type="button" className="props-day-btn" onClick={() => setDay((current) => shiftDay(current, -1))} aria-label="Previous day">‹</button>
        <span className="props-day-label">{formatDayLabel(day)}</span>
        <button type="button" className="props-day-btn" onClick={() => setDay((current) => shiftDay(current, 1))} aria-label="Next day">›</button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loadingSlate && <div className="tp-loading">Loading the slate…</div>}
      {!loadingSlate && !error && games === 0 && <div className="empty-state"><p>No NHL games on this day.</p></div>}
      {!loadingSlate && games > 0 && (
        <p className="nhl-points-progress">
          {done < total
            ? `Reading ${done} of ${total} skaters across ${games} games…`
            : `${ranked.length} skaters across ${games} games. ${skipped} did not have five recent games.`}
        </p>
      )}

      <div className="nhl-points-list">
        {ranked.map((row, index) => {
          const open = openId === row.id;
          const pct = Math.round(row.model.p * 100);
          return (
            <article key={row.id} className={`nhl-point${open ? ' nhl-point-open' : ''}`}>
              <button type="button" className="nhl-point-main" onClick={() => setOpenId(open ? null : row.id)} aria-expanded={open}>
                <span className="nhl-point-rank">{index + 1}</span>
                {row.headshot && (
                  <img src={row.headshot} alt="" className="nhl-point-photo" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                )}
                <span className="nhl-point-who">
                  <span className="nhl-point-name">{row.shortName || row.name}</span>
                  <span className="nhl-point-meta">
                    {row.position ? `${row.position} · ` : ''}
                    {row.teamAbbr} {row.home ? 'vs' : '@'} {row.opponentAbbr}
                    {row.gameStart ? ` · ${clock(row.gameStart)}` : ''}
                  </span>
                </span>
                <span className="nhl-point-pct">{pct}%</span>
              </button>
              {open && (
                <div className="nhl-point-why">
                  <p>{row.why}</p>
                  <div className="nhl-point-chips">
                    {row.lines.map((line) => (
                      <span key={`${line.id}-${line.label}`} className="nhl-point-chip">{line.label} {line.value}</span>
                    ))}
                  </div>
                  <button type="button" className="nhl-point-link" onClick={() => navigate(`/player/nhl/${row.id}`)}>
                    Full player card
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
