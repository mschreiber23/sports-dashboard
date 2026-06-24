function StatusBadge({ status }) {
  const s = status?.type?.state;
  const detail = status?.displayClock || status?.type?.shortDetail || '';

  if (s === 'in') {
    return (
      <span className="badge badge-live">
        <span className="live-dot" />
        {detail}
      </span>
    );
  }
  if (s === 'post') {
    return <span className="badge badge-final">Final</span>;
  }
  return <span className="badge badge-pre">{status?.type?.shortDetail || 'Scheduled'}</span>;
}

function TeamRow({ competitor }) {
  const team = competitor?.team || {};
  const score = competitor?.score;
  const winner = competitor?.winner;

  return (
    <div className={`team-row ${winner ? 'winner' : ''}`}>
      <div className="team-info">
        {team.logo && <img src={team.logo} alt={team.abbreviation} className="team-logo" />}
        <div>
          <div className="team-name">{team.shortDisplayName || team.displayName}</div>
          <div className="team-record">{competitor?.records?.[0]?.summary}</div>
        </div>
      </div>
      <div className="team-score">{score ?? '—'}</div>
    </div>
  );
}

export default function ScoreCard({ game, highlight }) {
  const comp = game.competitions?.[0];
  const [away, home] = comp?.competitors || [];
  const status = comp?.status;
  const venue = comp?.venue;
  const broadcasts = comp?.broadcasts?.[0]?.names?.join(', ');

  return (
    <div className={`score-card ${highlight ? 'score-card-highlight' : ''}`}>
      <div className="score-card-header">
        <StatusBadge status={status} />
        {broadcasts && <span className="broadcast">{broadcasts}</span>}
      </div>
      <TeamRow competitor={away} />
      <div className="score-divider">@</div>
      <TeamRow competitor={home} />
      {venue && (
        <div className="venue">
          {venue.fullName}{venue.address?.city ? `, ${venue.address.city}` : ''}
        </div>
      )}
    </div>
  );
}
