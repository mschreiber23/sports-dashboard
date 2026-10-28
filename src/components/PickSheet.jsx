import { useState } from 'react';
import { formatGameTime } from '../api/polymarket';
import { NHL_EDGE_MIN } from '../utils/nhlEdge';
import { yesOnlyLeague } from '../utils/propBook';
import { BET_PRICE_MAX } from '../utils/scoredProps';
import { pickReasons, pickTitle, rankPicks } from '../utils/pickSheet';
import TradeButton from './TradeButton';

function PickCard({ item, open, onToggle, onOpen, draftFor }) {
  const reasons = pickReasons(item);
  return (
    <article className={`pick-card${open ? ' pick-card-open' : ''}`}>
      <button type="button" className="pick-card-main" aria-expanded={open} onClick={onToggle}>
        <div className="pick-card-copy">
          <div className="pick-sport">{item.sport}</div>
          <h3>{pickTitle(item)}</h3>
          <p>
            {item.game}
            {item.gameStart ? ` · ${formatGameTime(item.gameStart)}` : ''}
          </p>
          {item.market != null && <p className="pick-price">Price {item.market}%</p>}
        </div>
        <div className="pick-chance">
          <b>{item.modelPct != null ? `${item.modelPct}%` : `${item.rate}%`}</b>
          <span>{item.modelPct != null ? 'we say' : 'last 10'}</span>
          <i aria-hidden="true">{open ? '–' : '+'}</i>
        </div>
      </button>
      {open && (
        <div className="pick-why">
          <h4>Why</h4>
          <ul>
            {reasons.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <div className="pick-actions">
            <TradeButton
              draft={draftFor(item)}
              maxPrice={BET_PRICE_MAX}
              yesOnly={yesOnlyLeague(item.league) && !item.gameLine}
              recommend={item.edge >= NHL_EDGE_MIN ? (item.prediction === 'no' ? 'no' : 'yes') : null}
            />
            <button type="button" className="pick-open" onClick={() => onOpen(item)}>Open the game</button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function PickSheet({ picks, status, ready, onOpen, draftFor }) {
  const [open, setOpen] = useState(() => new Set());
  const ranked = rankPicks(picks);
  const modeled = ranked.filter((item) => item.modeled);
  const recent = ranked.filter((item) => !item.modeled);
  const toggle = (id) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="pick-sheet">
      {status && <p className="pick-status">{status}</p>}
      {ready && ranked.length === 0 && (
        <div className="empty-state"><p>Nothing cleared the bar for this slate.</p></div>
      )}
      {modeled.length > 0 && (
        <section className="pick-list props-board">
          <h2 className="pick-group">Model</h2>
          {modeled.map((item) => (
            <PickCard
              key={item.id}
              item={item}
              open={open.has(item.id)}
              onToggle={() => toggle(item.id)}
              onOpen={onOpen}
              draftFor={draftFor}
            />
          ))}
        </section>
      )}
      {recent.length > 0 && (
        <section className="pick-list props-board">
          <h2 className="pick-group">Cleared it lately</h2>
          {recent.map((item) => (
            <PickCard
              key={item.id}
              item={item}
              open={open.has(item.id)}
              onToggle={() => toggle(item.id)}
              onOpen={onOpen}
              draftFor={draftFor}
            />
          ))}
        </section>
      )}
    </div>
  );
}
