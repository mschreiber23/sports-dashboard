import { canGradeProp } from '../api/playerLogs';
import { tradeId } from '../utils/propBook';
import { usePropSync } from './PropSync';

function gradeable(draft) {
  if (draft.kind === 'winner' || draft.kind === 'total') return draft.league === 'nhl' || draft.league === 'nfl';
  return canGradeProp(draft.propType);
}

export default function TradeButton({ draft, compact = false }) {
  const { trades, unit, addTrade, removeTrade } = usePropSync();
  if (!draft || !(draft.price > 0 && draft.price < 1)) return null;
  const id = tradeId(draft);
  const existing = (trades || []).find((trade) => trade.id === id);
  if (!existing && !gradeable(draft)) return null;
  if (existing?.result) {
    return <span className={`props-trade props-trade-done props-trade-${existing.result}`}>{existing.result}</span>;
  }
  if (existing) {
    return (
      <button type="button" className="props-trade props-trade-on" onClick={() => removeTrade(id)}>
        Tracked
      </button>
    );
  }
  return (
    <button type="button" className="props-trade" onClick={() => addTrade(draft)}>
      {compact ? 'Trade' : `Trade $${unit}`}
    </button>
  );
}
