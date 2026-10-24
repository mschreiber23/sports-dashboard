import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useTeamGame from '../hooks/useTeamGame';
import { getTeamLogo, getTeamLogoFallback } from '../api/espn';
import { adaptColorForDarkBg } from '../utils/colorUtils';
import { formatKickoff } from '../utils/upcomingGames';
import {
  buildHomeBoard,
  finalStatusText,
  liveStatusText,
  matchupSides,
  teamLabel,
  teamScoreValue,
} from '../utils/homeTeamBoard';

// The previous full game cards still live in TeamRow. The Scores page renders
// those. This is the compact home board, so the old boxes can be put back.

function TeamMark({ team, className = 'hts-logo' }) {
  const dark = getTeamLogo(team);
  const orig = getTeamLogoFallback(team);
  if (!dark && !orig) return <span className={`${className} hts-logo-empty`} />;
  return (
    <img
      src={dark || orig}
      alt=""
      className={className}
      onError={(event) => {
        if (orig && event.target.src !== orig) {
          event.target.onerror = null;
          event.target.src = orig;
        }
      }}
    />
  );
}

function scoreClass(row, other, state) {
  const mine = teamScoreValue(row);
  const theirs = teamScoreValue(other);
  if (state === 'post') return row?.winner ? 'hts-score hts-score-win' : 'hts-score hts-score-dim';
  const a = Number(mine);
  const b = Number(theirs);
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
    return a > b ? 'hts-score hts-score-win' : 'hts-score hts-score-dim';
  }
  return 'hts-score';
}

function SideRow({ row, other, state }) {
  return (
    <div className="hts-row">
      <TeamMark team={row?.team} />
      <span className="hts-name">{teamLabel(row?.team)}</span>
      <span className={scoreClass(row, other, state)}>{teamScoreValue(row)}</span>
    </div>
  );
}

function ScoreTile({ sport, game, accent }) {
  const navigate = useNavigate();
  const comp = game.competitions?.[0];
  const state = comp?.status?.type?.state;
  const { away, home } = matchupSides(game);
  const status = state === 'in'
    ? liveStatusText(comp?.status, comp?.situation)
    : finalStatusText(comp?.status);
  return (
    <button
      type="button"
      className="hts-tile"
      style={accent ? { borderColor: accent } : undefined}
      onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}
    >
      <div className={`hts-status${state === 'in' ? ' hts-status-live' : ''}`}>
        {state === 'in' && <span className="live-dot" />}
        <span>{status}</span>
      </div>
      <SideRow row={away} other={home} state={state} />
      <SideRow row={home} other={away} state={state} />
    </button>
  );
}

function UpcomingRow({ sport, game }) {
  const navigate = useNavigate();
  const { away, home } = matchupSides(game);
  const when = formatKickoff(game.date);
  return (
    <button
      type="button"
      className="hts-up-row"
      onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}
    >
      <span className="hts-up-match">
        <TeamMark team={away?.team} />
        <span className="hts-up-name">{teamLabel(away?.team)}</span>
        <span className="hts-up-at">@</span>
        <TeamMark team={home?.team} />
        <span className="hts-up-name">{teamLabel(home?.team)}</span>
      </span>
      {when.label && <span className="hts-up-when">{when.label}</span>}
    </button>
  );
}

function TeamWatcher({ sport, team, dateStr, onUpdate, onHiddenChange }) {
  const { game, loading, upcoming, hasUpcomingGame } = useTeamGame(sport, team.id, 30000, dateStr);
  const next = upcoming === undefined ? undefined : (upcoming[0] || null);
  const comp = game?.competitions?.[0];
  const awayScore = teamScoreValue(matchupSides(game).away);
  const homeScore = teamScoreValue(matchupSides(game).home);

  useEffect(() => {
    if (hasUpcomingGame !== undefined) onHiddenChange?.(team.id, sport, !hasUpcomingGame);
  }, [hasUpcomingGame, team.id, sport, onHiddenChange]);

  useEffect(() => {
    onUpdate(`${sport}-${team.id}`, {
      sport,
      team,
      loading: loading || upcoming === undefined,
      game: game || null,
      next: next || null,
    });
  }, [
    sport,
    team,
    dateStr,
    loading,
    upcoming,
    game,
    next,
    onUpdate,
    comp?.status?.type?.state,
    comp?.status?.type?.shortDetail,
    comp?.situation?.shortDownDistanceText,
    awayScore,
    homeScore,
  ]);

  useEffect(() => {
    const key = `${sport}-${team.id}`;
    return () => onUpdate(key, null);
  }, [sport, team.id, onUpdate]);

  return null;
}

function accentFor(team) {
  const raw = team?.color ? `#${String(team.color).replace('#', '')}` : null;
  const alt = team?.alternateColor ? `#${String(team.alternateColor).replace('#', '')}` : null;
  return adaptColorForDarkBg(raw, alt, '#0092ff');
}

export default function HomeTeamScores({ teams, dateStr, onHiddenChange }) {
  const [status, setStatus] = useState({});
  const onUpdate = useCallback((key, value) => {
    setStatus((prev) => {
      if (value == null) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  }, []);

  const ordered = (teams || []).map((entry) => status[`${entry.sport}-${entry.team.id}`]).filter(Boolean);
  const { scores, upcoming } = buildHomeBoard(ordered);
  const waiting = (teams || []).length > 0 && ordered.length < teams.length && scores.length === 0 && upcoming.length === 0;

  return (
    <div className="hts">
      {(teams || []).map(({ sport, team }) => (
        <TeamWatcher
          key={`${sport}-${team.id}`}
          sport={sport}
          team={team}
          dateStr={dateStr}
          onUpdate={onUpdate}
          onHiddenChange={onHiddenChange}
        />
      ))}

      {waiting && (
        <div className="hts-grid" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="hts-skel" />)}
        </div>
      )}

      {scores.length > 0 && (
        <div className="hts-grid">
          {scores.map((row) => {
            const favorite = (teams || []).find((entry) => entry.sport === row.sport && String(entry.team.id) === String(row.favoriteId));
            return (
              <ScoreTile
                key={`${row.sport}-${row.game.id}`}
                sport={row.sport}
                game={row.game}
                accent={accentFor(favorite?.team)}
              />
            );
          })}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="hts-upcoming">
          <div className="hts-subhead">Upcoming</div>
          {upcoming.map((row) => (
            <UpcomingRow key={`${row.sport}-${row.game.id}`} sport={row.sport} game={row.game} />
          ))}
        </div>
      )}
    </div>
  );
}
