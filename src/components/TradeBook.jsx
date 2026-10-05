import { useEffect, useMemo, useState } from 'react';
import { bookReport, expectedProfit, potentialWin, predictionWon, sheetMarket, sheetTrade, tradePayout } from '../utils/propBook';
import { usePropSync } from './PropSync';

function money(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function stakeText(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  const whole = Math.abs(rounded - Math.round(rounded)) < 0.001;
  return whole ? `$${Math.round(Math.abs(rounded))}` : `$${Math.abs(rounded).toFixed(2)}`;
}

function resultText(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const rounded = Math.round(value * 100) / 100;
  const whole = Math.abs(rounded - Math.round(rounded)) < 0.001;
  const digits = whole ? String(Math.round(Math.abs(rounded))) : Math.abs(rounded).toFixed(2);
  return rounded < 0 ? `-$${digits}` : `$${digits}`;
}

function MoneyEdit({ value, label, onCommit }) {
  const shown = typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '';
  const [text, setText] = useState(shown);
  useEffect(() => { setText(shown); }, [shown]);
  const commit = () => {
    const next = Math.round(Number(text) * 100) / 100;
    if (!Number.isFinite(next) || next < 0 || next > 1000000) {
      setText(shown);
      return;
    }
    if (Math.round(Number(value) * 100) !== Math.round(next * 100)) onCommit(next);
  };
  return (
    <span className="trade-money">
      <span>$</span>
      <input
        className="trade-edit"
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        aria-label={label}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
      />
    </span>
  );
}

function PercentEdit({ value, label, onCommit }) {
  const shown = typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value * 100)) : '';
  const [text, setText] = useState(shown);
  useEffect(() => { setText(shown); }, [shown]);
  const commit = () => {
    const next = Math.round(Number(text));
    if (!Number.isInteger(next) || next < 1 || next > 99) {
      setText(shown);
      return;
    }
    if (Number(shown) !== next) onCommit(next / 100);
  };
  return (
    <span className="trade-money">
      <input
        className="trade-edit trade-edit-pct"
        type="number"
        inputMode="numeric"
        min="1"
        max="99"
        step="1"
        aria-label={label}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
      />
      <span>%</span>
    </span>
  );
}

function edgeText(edge) {
  if (typeof edge !== 'number' || !Number.isFinite(edge)) return '';
  const points = Math.round(edge * 100);
  return points > 0 ? `+${points}` : `${points}`;
}

export default function TradeBook() {
  const { trades, unit, setUnit, updateTrade, removeTrade } = usePropSync();
  const [text, setText] = useState(String(unit));
  const report = useMemo(() => bookReport(trades || []), [trades]);
  const rows = useMemo(() => [...(trades || [])].sort((a, b) => (a.recordedAt || a.gameStart || 0) - (b.recordedAt || b.gameStart || 0)), [trades]);

  useEffect(() => { setText(String(unit)); }, [unit]);

  const commitUnit = () => {
    const next = Math.round(Number(text));
    if (next >= 1 && next <= 10000) setUnit(next);
    else setText(String(unit));
  };

  return (
    <div className="ledger">
      <p className="props-likely-note">
        Yes or No adds that side at the price a taker pays, including Polymarket&apos;s fee. Potential is the money returned if that trade is correct. At 50% or less you risk the unit, so $25 at 50% returns $48.32 after the fee. Over 50%, the stake is raised so a win profits one unit after the fee: 56% takes $34.12 to return $59.12. A loss costs that stake. On this sheet, edit Unit for the amount wagered and Expected profit for what a correct trade makes. Potential becomes the wager plus that profit. Percentage is the price you filled. Changing it leaves the wager and expected profit alone, and the edge moves by the same number of points. Today, this month, and lifetime add up those stakes.
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
      <div className="props-likely-head">Profit</div>
      <div className="ledger-stats">
        <div className="ledger-stat"><b>{money(report.today)}</b><span>Today</span></div>
        <div className="ledger-stat"><b>{money(report.total)}</b><span>Running</span></div>
        <div className="ledger-stat"><b>{report.open}</b><span>Open</span></div>
      </div>
      <div className="props-likely-head">Trading</div>
      <div className="ledger-stats">
        <div className="ledger-stat"><b>{stakeText(report.tradedToday)}</b><span>Today</span></div>
        <div className="ledger-stat"><b>{stakeText(report.tradedMonth)}</b><span>This month</span></div>
        <div className="ledger-stat"><b>{stakeText(report.tradedLifetime)}</b><span>Lifetime</span></div>
      </div>
      {trades && rows.length === 0 && (
        <div className="empty-state">
          <p>No trades yet. On Likely or a player card, tap Yes or No to add that side.</p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="trade-sheet-wrap">
          <table className="trade-sheet">
            <thead>
              <tr>
                <th>Sport</th>
                <th>Market</th>
                <th>Trade</th>
                <th>Prediction (Y/N)</th>
                <th className="num">Unit</th>
                <th className="num">Expected profit</th>
                <th className="num">Potential</th>
                <th className="num">Percentage</th>
                <th className="num">Edge</th>
                <th>Win/Loss</th>
                <th className="num">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((trade) => {
                const won = predictionWon(trade);
                const payout = tradePayout(trade);
                const verdict = !trade.result ? '' : trade.result === 'void' ? 'Void' : (won ? 'Correct' : 'Incorrect');
                return (
                  <tr key={trade.id}>
                    <td>{String(trade.league || '').toUpperCase()}</td>
                    <td>{sheetMarket(trade)}</td>
                    <td>{sheetTrade(trade)}</td>
                    <td>{trade.prediction === 'no' ? 'No' : 'Yes'}</td>
                    <td className="num">
                      <MoneyEdit
                        value={Number(trade.unit)}
                        label={`Amount wagered on ${sheetMarket(trade)}`}
                        onCommit={(next) => { if (next > 0) updateTrade(trade.id, { unit: next }); }}
                      />
                    </td>
                    <td className="num">
                      <MoneyEdit
                        value={expectedProfit(trade)}
                        label={`Expected profit on ${sheetMarket(trade)}`}
                        onCommit={(next) => updateTrade(trade.id, { profit: next })}
                      />
                    </td>
                    <td className="num">{resultText(potentialWin(trade))}</td>
                    <td className="num">
                      <PercentEdit
                        value={Number(trade.price)}
                        label={`Percentage on ${sheetMarket(trade)}`}
                        onCommit={(next) => updateTrade(trade.id, { price: next })}
                      />
                    </td>
                    <td className="num">{edgeText(trade.edge)}</td>
                    <td className={verdict === 'Correct' ? 'trade-correct' : verdict === 'Incorrect' ? 'trade-incorrect' : ''}>{verdict}</td>
                    <td className={`num ${payout < 0 ? 'trade-incorrect' : payout > 0 ? 'trade-correct' : ''}`}>
                      {trade.result ? resultText(payout) : (
                        <button type="button" className="props-trade" onClick={() => removeTrade(trade.id)}>Remove</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
