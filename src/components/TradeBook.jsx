import { useEffect, useMemo, useState } from 'react';
import { formatDayLabel } from '../api/polymarket';
import { bookReport, tradeProfit } from '../utils/propBook';
import { usePropSync } from './PropSync';

function money(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function ifHit(trade) {
  return tradeProfit({ ...trade, result: 'hit' });
}

export default function TradeBook() {
  const { trades, unit, setUnit, removeTrade } = usePropSync();
  const [text, setText] = useState(String(unit));
  const report = useMemo(() => bookReport(trades || []), [trades]);

  useEffect(() => { setText(String(unit)); }, [unit]);

  const commitUnit = () => {
    const next = Math.round(Number(text));
    if (next >= 1 && next <= 10000) setUnit(next);
    else setText(String(unit));
  };

  return (
    <div className="ledger">
      <p className="props-likely-note">
        Trade marks a prop you are taking. The unit is the amount at risk. A $25 trade at 62% wins $15.32 if it hits and loses $25 if it misses. If the player does not play, the unit comes back. Changing the unit applies to the next trade.
      </p>
      <label className="trade-unit">
        Unit
        <span>$</span>
        <input
          type="number"
          min="1"
          max="10000"
          inputMode="numeric"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={commitUnit}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        />
      </label>
      <div className="ledger-stats">
        <div className="ledger-stat"><b>{money(report.today)}</b><span>Today</span></div>
        <div className="ledger-stat"><b>{money(report.total)}</b><span>Running</span></div>
        <div className="ledger-stat"><b>{report.open}</b><span>Open</span></div>
      </div>
      {trades && report.days.length === 0 && (
        <div className="empty-state">
          <p>No trades yet. On Likely or a player card, tap Trade to track that prop at today’s price.</p>
        </div>
      )}
      {report.days.map((day) => (
        <section className="ledger-section" key={day.day}>
          <h3>
            {formatDayLabel(day.day)}
            <span className={day.profit < 0 ? 'trade-down' : ''}>{day.settled ? money(day.profit) : 'Open'}</span>
          </h3>
          <div className="props-list">
            {day.trades.map((trade) => (
              <div className="ledger-card" key={trade.id}>
                <div>
                  <div className="props-game-title">{trade.player} <span className="props-likely-line">{trade.propLabel}</span></div>
                  <div className="props-game-meta">
                    {String(trade.league || '').toUpperCase()} · {trade.game} · {Math.round(trade.price * 100)}% · ${Number(trade.unit).toFixed(0)}
                    {trade.actual == null ? '' : ` · actual ${trade.actual}`}
                  </div>
                </div>
                <div className="trade-result">
                  {trade.result ? (
                    <>
                      <b className={trade.profit < 0 ? 'trade-down' : ''}>{money(trade.profit)}</b>
                      <span className={`ledger-mark ledger-${trade.result}`}>{trade.result}</span>
                    </>
                  ) : (
                    <>
                      <b>{money(ifHit(trade))}</b>
                      <span>if it hits</span>
                      <button type="button" className="props-trade" onClick={() => removeTrade(trade.id)}>Remove</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
