import { useState } from 'react';
import { Link } from 'react-router-dom';
import useTeamGame from '../hooks/useTeamGame';
import useLiveSituation from '../hooks/useLiveSituation';
import { useFavorites } from '../context/FavoritesContext';
import { SPORTS } from '../api/espn';
import BoxScoreModal from './BoxScoreModal';

/* ── Base Diamond ──────────────────────────────────── */
function Diamond({ onFirst, onSecond, onThird }) {
  return (
    <svg viewBox="0 0 50 50" className="tr-diamond">
      <polygon points="25,4 46,25 25,46 4,25"
        className="tr-base-outline" />
      {/* Second base - top */}
      <rect x="19" y="3" width="12" height="12" rx="2"
        className={`tr-base ${onSecond ? 'tr-base-on' : ''}`}
        transform="rotate(45 25 9)" />
      {/* Third base - left */}
      <rect x="3" y="19" width="12" height="12" rx="2"
        className={`tr-base ${onThird ? 'tr-base-on' : ''}`}
        transform="rotate(45 9 25)" />
      {/* First base - right */}
      <rect x="35" y="19" width="12" height="12" rx="2"
        className={`tr-base ${onFirst ? 'tr-base-on' : ''}`}
        transform="rotate(45 41 25)" />
      {/* Home plate - bottom */}
      <rect x="19" y="35" width="12" height="12" rx="2"
        className="tr-base"
        transform="rotate(45 25 41)" />
    </svg>
  );
}

/* ── Count Dots ────────────────────────────────────── */
function Dots({ label, filled, total, color }) {
  return (
    <div className="tr-count-row">
      <span className="tr-count-label">{label}</span>
      <div className="tr-dots">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`tr-dot ${i < filled ? `tr-dot-${color}` : ''}`} />
        ))}
      </div>
    </div>
  );
}

/* ── Live Game Bar ─────────────────────────────────── */
function LiveBar({ game, teamId, sport, liveData, onBoxScore }) {
  const comp = game.competitions?.[0];
  const status = comp?.status;
  const shortDetail = status?.type?.shortDetail || '';
  const isBot = shortDetail.toLowerCase().startsWith('bot');

  const competitors = liveData?.competitors || comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];

  const sit = liveData?.situation || {};
  const pitcher = liveData?.pitcher;
  const pitcherStats = liveData?.pitcherStats;
  const batter = liveData?.batter;
  const lastPlay = liveData?.lastPlay;

  const getScore = (c) => {
    const s = c?.score;
    if (s == null) return '0';
    return typeof s === 'object' ? s.displayValue : String(s);
  };

  const broadcasts = comp?.broadcasts?.[0]?.names?.join(', ');

  return (
    <button className="tr-live-bar" onClick={onBoxScore}>
      {/* Inning */}
      <div className="tr-inning">
        <span className={`tr-inning-half ${isBot ? 'tr-bot' : 'tr-top'}`}>
          {isBot ? '▼' : '▲'}
        </span>
        <span className="tr-inning-num">{shortDetail.replace(/^(top|bot|mid|end)\s*/i, '')}</span>
        {broadcasts && <span className="tr-broadcast">{broadcasts}</span>}
      </div>

      {/* Teams + R/H/E */}
      <div className="tr-teams">
        <div className="tr-rhe-header">
          <div className="tr-rhe-spacer" />
          <span className="tr-rhe-label">R</span>
          <span className="tr-rhe-label">H</span>
          <span className="tr-rhe-label">E</span>
        </div>
        {[away, home].filter(Boolean).map((c) => (
          <div key={c.team?.id} className="tr-team-rhe">
            <div className="tr-team-identity">
              {c.team?.logo && <img src={c.team.logo} alt="" className="tr-team-logo-sm" />}
              <div>
                <div className={`tr-team-name-sm ${c.team?.id === String(teamId) ? 'tr-my-team' : ''}`}>
                  {c.team?.shortDisplayName || c.team?.displayName}
                </div>
                <div className="tr-team-record-sm">
                  {c.record?.[0]?.summary && `(${c.record[0].summary}`}
                  {c.homeAway === 'home' ? ', Home)' : c.homeAway === 'away' ? ', Away)' : ')'}
                </div>
              </div>
            </div>
            <span className="tr-rhe-val">{getScore(c)}</span>
            <span className="tr-rhe-val">{c.hits ?? 0}</span>
            <span className="tr-rhe-val">{c.errors ?? 0}</span>
          </div>
        ))}
      </div>

      {/* Diamond + Count + Last Play */}
      <div className="tr-middle">
        <Diamond
          onFirst={!!sit.onFirst}
          onSecond={!!sit.onSecond}
          onThird={!!sit.onThird}
        />
        <div className="tr-count-col">
          <Dots label="B" filled={sit.balls ?? 0} total={4} color="green" />
          <Dots label="S" filled={sit.strikes ?? 0} total={3} color="yellow" />
          <Dots label="O" filled={sit.outs ?? 0} total={3} color="red" />
        </div>
        {lastPlay && (
          <div className="tr-last-play">
            <span className="tr-last-play-label">LAST PLAY</span>
            <span className="tr-last-play-text">{lastPlay}</span>
          </div>
        )}
      </div>

      {/* Pitcher / Batter */}
      <div className="tr-players">
        {pitcher && (
          <div className="tr-player-block">
            <div className="tr-player-role">PITCHING</div>
            <div className="tr-player-row">
              {pitcher.headshot?.href && (
                <img src={pitcher.headshot.href} alt="" className="tr-player-avatar" />
              )}
              <div>
                <div className="tr-player-name">
                  {pitcher.shortName || pitcher.displayName}
                  {pitcher.jersey && <span className="tr-jersey"> #{pitcher.jersey}</span>}
                </div>
                {pitcherStats && (
                  <div className="tr-player-stats">
                    {pitcherStats.IP != null && `${pitcherStats.IP} IP`}
                    {pitcherStats.ER != null && `, ${pitcherStats.ER} ER`}
                    {pitcherStats.H != null && `, ${pitcherStats.H} H`}
                    {pitcherStats.K != null && `, ${pitcherStats.K} K`}
                    {pitcherStats.BB != null && `, ${pitcherStats.BB} BB`}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {batter && (
          <div className="tr-player-block">
            <div className="tr-player-role">BATTING</div>
            <div className="tr-player-row">
              {batter.headshot?.href && (
                <img src={batter.headshot.href} alt="" className="tr-player-avatar" />
              )}
              <div>
                <div className="tr-player-name">
                  {batter.shortName || batter.displayName}
                  {batter.jersey && <span className="tr-jersey"> #{batter.jersey}</span>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

/* ── Non-live game row ─────────────────────────────── */
function GameRow({ game, teamId, sport, onBoxScore }) {
  if (!game) return <div className="tr-no-game">No game today</div>;

  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const status = comp?.status;
  const isFinal = status?.type?.state === 'post';
  const shortDetail = status?.type?.shortDetail || '';

  const getScore = (c) => {
    const s = c?.score;
    if (s == null) return null;
    return typeof s === 'object' ? s.displayValue : String(s);
  };

  return (
    <button className="tr-game-row" onClick={onBoxScore}>
      <div className="tr-game-status">
        {isFinal
          ? <span className="badge badge-final">Final</span>
          : <span className="badge badge-pre">{shortDetail}</span>}
      </div>
      <div className="tr-game-teams">
        {[away, home].filter(Boolean).map((c) => (
          <div key={c.team?.id} className="tr-game-team">
            {c.team?.logo && <img src={c.team.logo} alt="" className="tr-game-logo" />}
            <span className={`tr-game-abbr ${c.team?.id === String(teamId) ? 'tr-my-team' : ''} ${c.winner ? 'tr-winner' : ''}`}>
              {c.team?.abbreviation}
            </span>
            <span className="tr-game-record">{c.record?.[0]?.summary}</span>
            {(isFinal || getScore(c) != null) && (
              <span className={`tr-game-score ${c.winner ? 'tr-winner' : ''}`}>{getScore(c)}</span>
            )}
          </div>
        ))}
      </div>
      {comp?.venue?.fullName && (
        <div className="tr-venue">{comp.venue.fullName}</div>
      )}
      <div className="tr-view-bs">Box Score →</div>
    </button>
  );
}

/* ── Main TeamRow ──────────────────────────────────── */
export default function TeamRow({ sport, team, onHiddenChange }) {
  const { removeTeam } = useFavorites();
  const { game, loading, hasUpcomingGame } = useTeamGame(sport, team.id);
  const [showBoxScore, setShowBoxScore] = useState(false);

  const isLive = game?.competitions?.[0]?.status?.type?.state === 'in';
  const liveData = useLiveSituation(sport, isLive ? game : null);

  const sportLabel = SPORTS[sport]?.label || sport.toUpperCase();
  const accentColor = `#${team.color || '7c3aed'}`;

  useEffect(() => {
    if (hasUpcomingGame !== undefined) {
      onHiddenChange?.(team.id, sport, !hasUpcomingGame);
    }
  }, [hasUpcomingGame]);

  return (
    <>
      <div
        className="team-row-card"
        style={{ '--team-accent': accentColor }}
      >
        {/* Left: team identity */}
        <div className="tr-identity">
          <Link to={`/team/${sport}/${team.id}`} className="tr-name-link">
            {team.logo && <img src={team.logo} alt={team.abbreviation} className="tr-logo" />}
            <div>
              <div className="tr-name">{team.displayName}</div>
              <div className="tr-sport">{sportLabel}</div>
            </div>
          </Link>
          <button className="remove-btn" onClick={() => removeTeam(team.id, sport)} title="Remove">×</button>
        </div>

        {/* Right: game */}
        <div className="tr-game-area">
          {loading ? (
            <div className="tr-no-game">Loading…</div>
          ) : isLive ? (
            <LiveBar
              game={game}
              teamId={team.id}
              sport={sport}
              liveData={liveData}
              onBoxScore={() => setShowBoxScore(true)}
            />
          ) : (
            <GameRow
              game={game}
              teamId={team.id}
              sport={sport}
              onBoxScore={() => game && setShowBoxScore(true)}
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
