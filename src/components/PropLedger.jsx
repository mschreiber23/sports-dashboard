import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadPropEvents, loadGameProps, formatGameTime } from '../api/polymarket';
import { recentPlayerLogs, playerResultOnDate } from '../api/playerLogs';
import { loadReads, saveReads } from '../api/propStore';
import { upcomingSlate, buildReads, mergeReads, gradeRead, ledgerReport } from '../utils/propReads';

function pct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  return `${Math.round(value * 100)}%`;
}

function points(value) {
  const n = Math.round(value * 100);
  return n > 0 ? `+${n}` : `${n}`;
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function BandList({ rows }) {
  return rows.map((band) => (
    <div className="ledger-row" key={band.label}>
      <span>{band.label}</span>
      <span className="ledger-bar" aria-hidden="true">
        <i style={{ width: `${Math.round((band.hitRate || 0) * 100)}%` }} />
      </span>
      <span>{band.hits}/{band.count}</span>
      <span>{pct(band.hitRate)} hit</span>
      <span>model {pct(band.model)}</span>
      <span>price {pct(band.price)}</span>
    </div>
  ));
}

export default function PropLedger() {
  const { user } = useAuth();
  const userId = user?.id || '';
  const [reads, setReads] = useState(null);
  const [status, setStatus] = useState('Loading the log…');
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [run, setRun] = useState(0);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    let cancel = false;
    async function go() {
      if (busy.current) {
        again.current = true;
        return;
      }
      busy.current = true;
      again.current = false;
      setWorking(true);
      setError('');
      try {
        let rows = await loadReads(userId);
        if (cancel) return;
        setReads(rows);

        const pending = rows.filter((row) => !row.result && row.gameStart <= Date.now());
        if (pending.length) {
          let done = 0;
          const graded = await pool(pending, 6, async (row) => {
            const stat = await playerResultOnDate(row.league, row.player, row.propType, row.gameStart).catch(() => ({ status: 'unknown' }));
            done += 1;
            if (!cancel && (done % 10 === 0 || done === pending.length)) {
              setStatus(`Grading finished games ${done}/${pending.length}…`);
            }
            return gradeRead(row, stat);
          });
          if (cancel) return;
          const byId = new Map(graded.map((row) => [row.id, row]));
          rows = rows.map((row) => byId.get(row.id) || row);
          setReads(rows);
          await saveReads(userId, rows);
        }

        const events = await loadPropEvents();
        if (cancel) return;
        const slate = upcomingSlate(events);
        const seen = new Set(rows.map((row) => row.eventSlug));
        const games = slate.filter((event) => !seen.has(event.key));
        if (!games.length) {
          setStatus(rows.length ? '' : 'No NHL or NFL games are waiting to be recorded.');
          return;
        }

        let loaded = 0;
        const withRows = await pool(games, 4, async (game) => {
          const props = await loadGameProps(game.key).catch(() => []);
          loaded += 1;
          if (!cancel) setStatus(`Reading ${game.league.toUpperCase()} games ${loaded}/${games.length}…`);
          return { ...game, rows: props };
        });
        if (cancel) return;

        const players = [];
        const playerSeen = new Set();
        for (const game of withRows) {
          for (const row of game.rows || []) {
            if (row.section !== 'player') continue;
            const id = `${game.league}|${row.player}|${row.gameStart}`;
            if (playerSeen.has(id)) continue;
            playerSeen.add(id);
            players.push({
              id,
              league: game.league,
              name: row.player,
              opponentAbbr: row.opponentAbbr,
              opponentName: row.opponentName,
              before: row.gameStart,
            });
          }
        }

        const logs = {};
        let checked = 0;
        await pool(players, 6, async (player) => {
          const result = await recentPlayerLogs(player.league, [player]).catch(() => ({}));
          logs[player.id] = result[player.name] ?? null;
          checked += 1;
          if (!cancel && (checked % 15 === 0 || checked === players.length)) {
            setStatus(`Checking players ${checked}/${players.length}…`);
          }
        });
        if (cancel) return;

        const fresh = buildReads({ games: withRows, logs });
        rows = mergeReads(rows, fresh);
        setReads(rows);
        await saveReads(userId, rows);
        const noun = games.length === 1 ? 'game' : 'games';
        setStatus(fresh.length
          ? `Saved ${fresh.length} reads from ${games.length} ${noun}.`
          : `No modeled props were ready in ${games.length} ${noun}.`);
      } catch (err) {
        if (!cancel) setError(err?.message || 'Could not update the log.');
      } finally {
        busy.current = false;
        if (!cancel) setWorking(false);
        if (again.current) {
          again.current = false;
          setRun((n) => n + 1);
        }
      }
    }
    go();
    return () => { cancel = true; };
  }, [userId, run]);

  const report = useMemo(() => ledgerReport(reads || []), [reads]);
  const waitingGames = useMemo(() => {
    const map = new Map();
    for (const row of reads || []) {
      if (row.result || map.has(row.eventSlug)) continue;
      map.set(row.eventSlug, row);
    }
    return [...map.values()].sort((a, b) => a.gameStart - b.gameStart);
  }, [reads]);
  const recent = useMemo(() => (reads || [])
    .filter((row) => row.result)
    .slice()
    .sort((a, b) => (b.gradedAt || b.gameStart) - (a.gradedAt || a.gameStart) || a.player.localeCompare(b.player)), [reads]);
  const visible = showAll ? recent : recent.slice(0, 20);

  return (
    <div className="ledger">
      <p className="props-likely-note">
        Before an NHL or NFL game locks, this saves the yes price and the model’s read on the line closest to 50/50. After the game it grades a hit, a miss, or a void when the player did not play. Voids stay out of the hit rate. The model’s weights stay put until the same miss shows up for a few weeks.
      </p>
      {status && <p className="ledger-status">{status}</p>}
      {error && <p className="ledger-status">{error}</p>}
      <button type="button" className="btn-primary ledger-again" disabled={working} onClick={() => setRun((n) => n + 1)}>
        Record upcoming games
      </button>

      {reads && report.graded === 0 && (
        <div className="empty-state">
          <p>
            {report.open
              ? `${report.open} ${report.open === 1 ? 'read is' : 'reads are'} saved and waiting on the games.`
              : 'The log starts with the next slate. Open this before the games lock.'}
          </p>
        </div>
      )}
      {reads && report.graded === 0 && waitingGames.length > 0 && (
        <div className="ledger-waiting">
          {waitingGames.map((game) => (
            <div className="ledger-wait" key={game.eventSlug}>
              <span>{game.league.toUpperCase()} · {game.game}</span>
              <span>{formatGameTime(game.gameStart)}</span>
            </div>
          ))}
        </div>
      )}

      {report.graded > 0 && (
        <>
          <div className="ledger-stats">
            <div className="ledger-stat"><b>{report.graded}</b><span>Graded</span></div>
            <div className="ledger-stat"><b>{pct(report.hitRate)}</b><span>Hit</span></div>
            <div className="ledger-stat"><b>{pct(report.model)}</b><span>Model said</span></div>
          </div>
          <p className="props-likely-note ledger-summary">
            These props hit {pct(report.hitRate)} of the time. The prices averaged {pct(report.price)}. The model averaged {pct(report.model)}.
            {report.voids ? ` ${report.voids} ${report.voids === 1 ? 'void' : 'voids'} stayed out.` : ''}
            {report.open ? ` ${report.open} still open.` : ''}
          </p>

          <section className="ledger-section">
            <h3>When the model said</h3>
            <BandList rows={report.modelBands} />
          </section>
          <section className="ledger-section">
            <h3>By the gap versus the price</h3>
            <BandList rows={report.edgeBands} />
          </section>
          {report.tags.length > 0 && (
            <section className="ledger-section">
              <h3>By tag</h3>
              {report.tags.slice(0, 12).map((tag) => (
                <div className="ledger-row" key={tag.tag}>
                  <span>{tag.tag}</span>
                  <span className="ledger-bar" aria-hidden="true">
                    <i style={{ width: `${Math.round(tag.hitRate * 100)}%` }} />
                  </span>
                  <span>{tag.hits}/{tag.count}</span>
                  <span>{pct(tag.hitRate)} hit</span>
                  <span>model {pct(tag.model)}</span>
                  <span>price {pct(tag.price)}</span>
                </div>
              ))}
            </section>
          )}

          <section className="ledger-section">
            <h3>Graded props</h3>
            <div className="props-list">
              {visible.map((row) => (
                <div className="ledger-card" key={row.id}>
                  <div>
                    <div className="props-game-title">{row.player} <span className="props-likely-line">{row.propLabel}</span></div>
                    <div className="props-game-meta">
                      {row.league.toUpperCase()} · {row.game} · {formatGameTime(row.gameStart)}
                      {row.actual == null ? '' : ` · actual ${row.actual}`}
                      {` · model ${pct(row.modelP)} · price ${pct(row.price)} · ${points(row.edge)}`}
                    </div>
                  </div>
                  <div className={`ledger-mark ledger-${row.result}`}>{row.result}</div>
                </div>
              ))}
            </div>
            {recent.length > 20 && (
              <button type="button" className="props-more" onClick={() => setShowAll((open) => !open)}>
                {showAll ? 'Show fewer' : `Show all ${recent.length}`}
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
