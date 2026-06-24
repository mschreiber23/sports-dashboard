import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import useTeamGame from '../hooks/useTeamGame';
import { useFavorites } from '../context/FavoritesContext';
import { SPORTS } from '../api/espn';
import BoxScoreModal from './BoxScoreModal';

function GameMatchup({ game, teamId, onOpen, sport }) {
  if (!game) {
    return (
      <div className="tc-no-game">
        <span>No game scheduled today</span>
      </div>
    );
  }

  const comp = game.competitions?.[0];
  const status = comp?.status;
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const state = status?.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post';
  const shortDetail = status?.type?.shortDetail || status?.type?.description || '';

  return (
    <button className="tc-game" onClick={onOpen}>
      {/* Status row */}
      <div className="tc-status-row">
        {isLive && (
          <span className="badge badge-live">
            <span className="live-dot" />
            {shortDetail}
          </span>
        )}
        {isFinal && <span className="badge badge-final">Final</span>}
        {!isLive && !isFinal && (
          <span className="badge badge-pre">{shortDetail}</span>
        )}
        <span className="tc-cta">Box Score →</span>
      </div>

      {/* Matchup */}
      <div className="tc-matchup">
        {/* Away team */}
        <div className="tc-team tc-team-away">
          {away?.team?.logo && (
            <img src={away.team.logo} alt={away.team.abbreviation} className="tc-team-logo" />
          )}
          <div className="tc-team-info">
            <span className={`tc-team-abbr ${away?.team?.id === String(teamId) ? 'tc-my-team' : ''}`}>
              {away?.team?.abbreviation}
            </span>
            {away?.records?.[0]?.summary && (
              <span className="tc-record">{away.records[0].summary}</span>
            )}
          </div>
        </div>

        {/* Scores */}
        <div className="tc-scores">
          <span className={`tc-score ${away?.winner ? 'tc-score-win' : ''}`}>
            {away?.score ?? (isFinal || isLive ? '0' : '')}
          </span>
          <span className="tc-score-sep">–</span>
          <span className={`tc-score ${home?.winner ? 'tc-score-win' : ''}`}>
            {home?.score ?? (isFinal || isLive ? '0' : '')}
          </span>
        </div>

        {/* Home team */}
        <div className="tc-team tc-team-home">
          <div className="tc-team-info tc-team-info-right">
            <span className={`tc-team-abbr ${home?.team?.id === String(teamId) ? 'tc-my-team' : ''}`}>
              {home?.team?.abbreviation}
            </span>
            {home?.records?.[0]?.summary && (
              <span className="tc-record">{home.records[0].summary}</span>
            )}
          </div>
          {home?.team?.logo && (
            <img src={home.team.logo} alt={home.team.abbreviation} className="tc-team-logo" />
          )}
        </div>
      </div>

      {/* Venue */}
      {comp?.venue?.fullName && (
        <div className="tc-venue">{comp.venue.fullName}</div>
      )}
    </button>
  );
}

export default function TeamCard({ sport, team, onHiddenChange }) {
  const { removeTeam } = useFavorites();
  const { game, loading, hasUpcomingGame, nextGame } = useTeamGame(sport, team.id);
  const [showBoxScore, setShowBoxScore] = useState(false);
  const sportLabel = SPORTS[sport]?.label || sport.toUpperCase();
  const accentColor = `#${team.color || '7c3aed'}`;

  // Notify parent when hidden status is known
  useEffect(() => {
    if (hasUpcomingGame !== undefined) {
      onHiddenChange?.(team.id, sport, !hasUpcomingGame);
    }
  }, [hasUpcomingGame]);

  const nextGameDate = nextGame
    ? new Date(nextGame.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  return (
    <>
      <div
        className="team-card"
        style={{ '--team-accent': accentColor, '--team-alt': `#${team.alternateColor || 'ffffff'}` }}
      >
        <div className="team-card-header">
          <Link to={`/team/${sport}/${team.id}`} className="team-card-identity team-card-link">
            {team.logo && (
              <img src={team.logo} alt={team.abbreviation} className="team-card-logo" />
            )}
            <div>
              <div className="team-card-name">{team.displayName}</div>
              <div className="team-card-sport">{sportLabel}</div>
            </div>
          </Link>
          <button className="remove-btn" onClick={() => removeTeam(team.id, sport)} title="Remove team">×</button>
        </div>

        <div className="team-card-game">
          {loading ? (
            <div className="tc-no-game">Loading…</div>
          ) : (
            <GameMatchup
              game={game}
              teamId={team.id}
              sport={sport}
              onOpen={() => game && setShowBoxScore(true)}
            />
          )}
        </div>
      </div>

      {showBoxScore && game && (
        <BoxScoreModal sport={sport} game={game} onClose={() => setShowBoxScore(false)} />
      )}
    </>
  );
}
