import { useMemo, useState } from 'react';
import { formatGameTime } from '../api/polymarket';
import { ledgerReport } from '../utils/propReads';
import { callGrade, modelSide } from '../utils/modelCall';
import { calibrationMoves } from '../utils/propCalibration';
import { usePropSync } from './PropSync';
import { AccuracyPanel } from './ModelTicker';

function pct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  return `${Math.round(value * 100)}%`;
}

function points(value) {
  const n = Math.round(value * 100);
  return n > 0 ? `+${n}` : `${n}`;
}

function WeightFit({ name, fit }) {
  const moves = calibrationMoves(fit);
  return (
    <div className="ledger-fit">
      <div className="ledger-fit-title">
        {name}
        <span>{fit?.active ? `${fit.graded} graded` : `${fit?.graded || 0}/${fit?.need || 40} graded`}</span>
      </div>
      {fit?.active ? (
        moves.length ? (
          <div className="ledger-waiting">
            {moves.map((move) => (
              <div className="ledger-wait" key={move.label}>
                <span>{move.label}</span>
                <span>{points(move.delta)}</span>
              </div>
            ))}
          </div>
        ) : <p className="props-likely-note">The graded props are lining up with the model, so this league’s weights are holding.</p>
      ) : (
        <p className="props-likely-note">Weights hold until {fit?.need || 40} graded props. A tag needs {fit?.tagNeed || 25} before it can move on its own.</p>
      )}
    </div>
  );
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
  const { reads, status, error, calibration, working, refresh } = usePropSync();
  const [showAll, setShowAll] = useState(false);

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
        Every NHL and NFL game in the next 8 days is recorded while the app is open. The price and the read update until the game starts. A Yes is a hit when the player clears the line. A No is a hit when they stay under. A player who did not play is a void, and voids stay out of the hit rate. After 40 graded props in a league, how often the line actually hit nudges that league’s probabilities.
      </p>
      {status && <p className="ledger-status">{status}</p>}
      {error && <p className="ledger-status">{error}</p>}
      <button type="button" className="btn-primary ledger-again" disabled={working} onClick={() => refresh(true)}>
        Update now
      </button>
      <AccuracyPanel />
      <section className="ledger-section">
        <h3>Weight adjustments</h3>
        <WeightFit name="NFL" fit={calibration?.nfl} />
        <WeightFit name="NHL" fit={calibration?.nhl} />
      </section>

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
            <div className="ledger-stat"><b>{pct(report.callRate)}</b><span>Hit</span></div>
            <div className="ledger-stat"><b>{pct(report.model)}</b><span>Model said</span></div>
          </div>
          <p className="props-likely-note ledger-summary">
            The model was right on {pct(report.callRate)} of these calls. The yes price averaged {pct(report.price)}. The model’s yes probability averaged {pct(report.model)}.
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
              {visible.map((row) => {
                const grade = callGrade(row) || row.result;
                const side = modelSide(row);
                return (
                  <div className="ledger-card" key={row.id}>
                    <div>
                      <div className="props-game-title">{row.player} <span className="props-likely-line">{side === 'no' ? `No ${row.propLabel}` : row.propLabel}</span></div>
                      <div className="props-game-meta">
                        {row.league.toUpperCase()} · {row.game} · {formatGameTime(row.gameStart)}
                        {row.actual == null ? '' : ` · actual ${row.actual}`}
                        {` · model ${pct(row.modelP)} · price ${pct(row.price)} · ${points(row.edge)}`}
                      </div>
                    </div>
                    <div className={`ledger-mark ledger-${grade}`}>{grade}</div>
                  </div>
                );
              })}
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
