import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useTeamGame from '../hooks/useTeamGame';
import { getTeamLogo, getTeamLogoFallback } from '../api/espn';
import { adaptColorForDarkBg } from '../utils/colorUtils';
import { formatKickoff, formatScheduleStack, gameOpponent } from '../utils/upcomingGames';
import {
  buildHomeBoard,
  finalStatusText,
  liveStatusText,
  matchupSides,
  teamForMark,
  teamLabel,
  teamScoreValue,
} from '../utils/homeTeamBoard';

// The previous full game cards still live in TeamRow. The Scores page renders
// those. This is the compact home board, so the old boxes can be put back.

const LOGO_FOLDER = { nba: 'nba', nfl: 'nfl', mlb: 'mlb', nhl: 'nhl' };

function logoCandidates(team, sport) {
  const urls = [];
  const add = (url) => {
    if (url && !urls.includes(url)) urls.push(url);
  };
  add(getTeamLogo(team));
  add(getTeamLogoFallback(team));
  const abbr = String(team?.abbreviation || '').toLowerCase();
  const folder = LOGO_FOLDER[sport];
  if (abbr && folder) {
    add(`https://a.espncdn.com/i/teamlogos/${folder}/500-dark/${abbr}.png`);
    add(`https://a.espncdn.com/i/teamlogos/${folder}/500/${abbr}.png`);
  }
  return urls;
}

function TeamMark({ team, sport, className = 'hts-logo' }) {
  const urls = logoCandidates(team, sport);
  const key = urls.join('|');
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [key]);
  const src = urls[index];
  if (!src) {
    const abbr = team?.abbreviation || '';
    return abbr
      ? <span className={`${className} hts-logo-fallback`}>{abbr}</span>
      : <span className={`${className} hts-logo-empty`} />;
  }
  return (
    <img
      src={src}
      alt=""
      className={className}
      onError={() => setIndex((current) => current + 1)}
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

function SideRow({ row, other, state, showScore, sport }) {
  return (
    <div className="hts-row">
      <TeamMark team={row?.team} sport={sport} />
      <span className="hts-name">{teamLabel(row?.team)}</span>
      {showScore && <span className={scoreClass(row, other, state)}>{teamScoreValue(row)}</span>}
    </div>
  );
}

function ScoreTile({ sport, game, accent }) {
  const navigate = useNavigate();
  const comp = game.competitions?.[0];
  const state = comp?.status?.type?.state;
  const { away, home } = matchupSides(game);
  const showScore = state === 'in' || state === 'post';
  const kick = formatKickoff(game.date);
  const status = state === 'in'
    ? liveStatusText(comp?.status, comp?.situation)
    : state === 'post'
      ? finalStatusText(comp?.status)
      : (kick.time || comp?.status?.type?.shortDetail || 'Scheduled');
  return (
    <button
      type="button"
      className="hts-tile"
      style={accent ? { borderColor: accent } : undefined}
      onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}
    >
      <div className={`hts-status${state === 'in' ? ' hts-status-live' : ''}${showScore ? '' : ' hts-status-pre'}`}>
        {state === 'in' && <span className="live-dot" />}
        <span>{status}</span>
      </div>
      <SideRow row={away} other={home} state={state} showScore={showScore} sport={sport} />
      <SideRow row={home} other={away} state={state} showScore={showScore} sport={sport} />
    </button>
  );
}

function UpcomingTeamRow({ sport, team, games }) {
  const navigate = useNavigate();
  const shown = teamForMark(team, games);
  const accent = accentFor(shown);
  const name = team?.displayName || team?.name || teamLabel(shown);
  return (
    <div className="hts-up-row" style={accent ? { borderColor: accent } : undefined}>
      <button
        type="button"
        className="hts-up-team"
        aria-label={name}
        title={name}
        onClick={() => navigate(`/team/${sport}/${team.id}`)}
      >
        <TeamMark team={shown} sport={sport} className="hts-logo hts-up-mark" />
      </button>
      <div className="hts-up-games">
        {games.map((game) => {
          const opp = gameOpponent(game, team.id);
          const when = formatScheduleStack(game.date);
          return (
            <button
              key={game.id}
              type="button"
              className="hts-up-chip"
              title={opp.name || opp.abbr || undefined}
              onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}
            >
              <span className="hts-up-date">{when.date}</span>
              <span className="hts-up-time">{when.time}</span>
              <span className="hts-up-opp">
                {opp.prefix === '@' && <span className="hts-up-at">@</span>}
                <TeamMark team={opp.team} sport={sport} className="hts-logo hts-up-logo" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TeamWatcher({ sport, team, dateStr, onUpdate, onHiddenChange }) {
  const { game, loading, upcoming, hasUpcomingGame } = useTeamGame(sport, team.id, 30000, dateStr);
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
      games: Array.isArray(upcoming) ? upcoming : [],
    });
  }, [
    sport,
    team,
    dateStr,
    loading,
    upcoming,
    game,
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
            <UpcomingTeamRow
              key={`${row.sport}-${row.team?.id}`}
              sport={row.sport}
              team={row.team}
              games={row.games}
            />
          ))}
        </div>
      )}
    </div>
  );
}
