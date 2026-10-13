import { Fragment } from 'react';
import { useNavigate } from 'react-router-dom';

/* ESPN's basketball box score, in their column order.
   FT is free throws made-attempted (4-5). TO is turnovers. */
const COLS = ['MIN','PTS','FG','3PT','FT','REB','AST','TO','STL','BLK','OREB','DREB','PF','+/-'];
const HIGHLIGHT = new Set(['PTS', 'REB', 'AST']);

function reasonLabel(reason) {
  if (!reason) return '';
  return reason.toLowerCase().replace(/(^|\s)\S/g, (ch) => ch.toUpperCase());
}

function PlayerCells({ athlete, cols }) {
  const player = athlete.athlete || {};
  const stats = athlete.stats || [];
  const pos = athlete.position?.abbreviation || player.position?.abbreviation || '';
  return (
    <>
      <td className="bsp-td bsp-td-player">
        <div className="bsp-player-cell">
          <span className="bsp-player-name">{player.shortName || player.displayName}</span>
          {pos && <span className="bsp-nba-pos">{pos}</span>}
          {player.jersey && <span className="bsp-nba-num">#{player.jersey}</span>}
        </div>
      </td>
      {cols.map((col) => {
        const val = stats[col.index] ?? '—';
        const isZero = val === '0' || val === '0-0';
        return (
          <td key={col.label} className={`bsp-td${HIGHLIGHT.has(col.label) ? ' bsp-hl' : ''}${isZero ? ' bsp-zero' : ''}`}>
            {val}
          </td>
        );
      })}
    </>
  );
}

export default function NbaBoxScore({ statGroup }) {
  const navigate = useNavigate();
  const labels = statGroup?.labels || [];
  const athletes = statGroup?.athletes || [];
  const totals = statGroup?.totals || [];
  const cols = COLS
    .map((label) => ({ label, index: labels.indexOf(label) }))
    .filter((col) => col.index !== -1);

  const played = athletes.filter((athlete) => !athlete.didNotPlay && (athlete.stats || []).length);
  const starters = played.filter((athlete) => athlete.starter);
  const bench = played.filter((athlete) => !athlete.starter);
  const dnp = athletes.filter((athlete) => athlete.didNotPlay);
  const sections = [
    starters.length ? ['starters', starters] : null,
    bench.length ? ['bench', bench] : null,
  ].filter(Boolean);

  const open = (athlete) => {
    const id = athlete.athlete?.id;
    if (id) navigate(`/player/nba/${id}`);
  };

  if (!sections.length && !dnp.length) return null;

  return (
    <div className="bsp-nba">
      {sections.length > 0 && (
        <div className="bsp-table-wrap">
          <table className="bsp-table">
            <thead>
              <tr>
                <th className="bsp-th bsp-th-player">{sections[0][0]}</th>
                {cols.map((col) => <th key={col.label} className="bsp-th">{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {sections[0][1].map((athlete, i) => (
                <tr key={athlete.athlete?.id || i} className={`bsp-tr${athlete.athlete?.id ? ' bsp-tr-clickable' : ''}`} onClick={() => open(athlete)}>
                  <PlayerCells athlete={athlete} cols={cols} />
                </tr>
              ))}
              {sections.slice(1).map(([label, rows]) => (
                <Fragment key={label}>
                  <tr className="bsp-nba-divider">
                    <td className="bsp-td bsp-td-player">{label}</td>
                    {cols.map((col) => <td key={col.label} className="bsp-td" />)}
                  </tr>
                  {rows.map((athlete, i) => (
                    <tr key={athlete.athlete?.id || i} className={`bsp-tr${athlete.athlete?.id ? ' bsp-tr-clickable' : ''}`} onClick={() => open(athlete)}>
                      <PlayerCells athlete={athlete} cols={cols} />
                    </tr>
                  ))}
                </Fragment>
              ))}
              {totals.length > 0 && (
                <tr className="bsp-totals">
                  <td className="bsp-td bsp-td-player bsp-totals-label">team</td>
                  {cols.map((col) => <td key={col.label} className="bsp-td">{totals[col.index] ?? ''}</td>)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {dnp.length > 0 && (
        <div className="bsp-nba-dnp">
          <div className="bsp-nba-dnp-label">did not play</div>
          {dnp.map((athlete) => {
            const player = athlete.athlete || {};
            const reason = reasonLabel(athlete.reason);
            return (
              <button
                key={player.id || player.displayName}
                type="button"
                className="bsp-nba-dnp-row"
                onClick={() => open(athlete)}
              >
                <span className="bsp-nba-dnp-name">{player.shortName || player.displayName}</span>
                {reason && <span className="bsp-nba-dnp-reason">{reason}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
