import { canGradeProp } from '../api/playerLogs';
import { predictionWon, sideDraft, stakeForUnit, tradeId } from '../utils/propBook';
import { usePropSync } from './PropSync';

function gradeable(draft) {
  if (draft.kind === 'winner' || draft.kind === 'total') return draft.league === 'nhl' || draft.league === 'nfl';
  return canGradeProp(draft.propType);
}

function SideButton({ draft, prediction, trades, unit, compact, addTrade, removeTrade }) {
  const next = sideDraft(draft, prediction);
  if (!(next.price > 0 && next.price < 1)) return null;
  const id = tradeId(next);
  const existing = (trades || []).find((trade) => trade.id === id);
  const label = prediction === 'no' ? 'No' : 'Yes';
  const stake = stakeForUnit(next.price, unit);
  const stakeText = stake == null ? '' : (Math.abs(stake - Math.round(stake)) < 0.001 ? `$${Math.round(stake)}` : `$${stake.toFixed(2)}`);
  if (existing?.result) {
    const won = predictionWon(existing);
    const text = existing.result === 'void' ? 'Void' : (won ? 'Correct' : 'Incorrect');
    return <span className={`props-trade props-trade-done props-trade-${won ? 'hit' : existing.result}`}>{compact ? text : `${label} ${text}`}</span>;
  }
  if (existing) {
    return (
      <button type="button" className="props-trade props-trade-on" onClick={() => removeTrade(id)}>
        {label}
      </button>
    );
  }
  return (
    <button type="button" className="props-trade" onClick={() => addTrade(next)}>
      {stakeText ? `${label} ${stakeText}` : label}
    </button>
  );
}

export default function TradeButton({ draft, compact = false }) {
  const { trades, unit, addTrade, removeTrade } = usePropSync();
  if (!draft || !(draft.price > 0 && draft.price < 1)) return null;
  const yesId = tradeId(sideDraft(draft, 'yes'));
  const noId = tradeId(sideDraft(draft, 'no'));
  const existing = (trades || []).some((trade) => trade.id === yesId || trade.id === noId);
  if (!existing && !gradeable(draft)) return null;
  return (
    <div className="props-trade-pair">
      <SideButton draft={draft} prediction="yes" trades={trades} unit={unit} compact={compact} addTrade={addTrade} removeTrade={removeTrade} />
      <SideButton draft={draft} prediction="no" trades={trades} unit={unit} compact={compact} addTrade={addTrade} removeTrade={removeTrade} />
    </div>
  );
}
