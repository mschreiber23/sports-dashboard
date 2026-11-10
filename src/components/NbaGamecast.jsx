import { useNavigate } from 'react-router-dom';
import { getTeamLogo } from '../api/espn';
import {
  nbaPlayTitle,
  nbaPlayClock,
  nbaNotablePlays,
  nbaWinLabel,
  nbaCourtSides,
} from '../utils/nbaGamecast';

const FEED_LIMIT = 8;
const STATS = [
  ['pts', 'PTS'],
  ['fg', 'FG'],
  ['reb', 'REB'],
  ['ast', 'AST'],
  ['pf', 'PF'],
];

function teamLogo(team) {
  return getTeamLogo(team) || team?.logo || '';
}

function PlayFeed({ plays, winById, away, home, onShowAll }) {
  const notable = nbaNotablePlays(plays).slice(0, FEED_LIMIT);
  if (!notable.length) return null;
  const awayAbbr = away?.team?.abbreviation || '';
  const homeAbbr = home?.team?.abbreviation || '';
  const logoFor = (teamId) => {
    const id = String(teamId || '');
    if (id && id === String(away?.team?.id)) return teamLogo(away.team);
    if (id && id === String(home?.team?.id)) return teamLogo(home.team);
    return '';
  };

  return (
    <section className="nba-gc-feed">
      {notable.map((play, index) => {
        const logo = logoFor(play.team?.id);
        const win = index === 0 ? nbaWinLabel(winById.get(String(play.id)), awayAbbr, homeAbbr) : '';
        return (
          <article key={play.id || index} className="nba-gc-play">
            {logo
              ? <img src={logo} alt="" className="nba-gc-play-logo" />
              : <span className="nba-gc-play-logo nba-gc-play-logo-empty" />}
            <div className="nba-gc-play-main">
              <div className="nba-gc-play-top">
                <span className="nba-gc-play-title">{nbaPlayTitle(play)}</span>
                <span className="nba-gc-play-score">{play.awayScore} {play.homeScore}</span>
              </div>
              <div className="nba-gc-play-meta">
                <span>{nbaPlayClock(play)}</span>
                {win && <span>{win}</span>}
              </div>
              {play.text && <p className="nba-gc-play-text">{play.text}</p>}
            </div>
          </article>
        );
      })}
      {onShowAll && (
        <button type="button" className="nba-gc-more" onClick={onShowAll}>Full Play-By-Play</button>
      )}
    </section>
  );
}

function CourtPlayer({ player, onOpen }) {
  const meta = [player.jersey ? `#${player.jersey}` : '', player.pos].filter(Boolean).join(' · ');
  return (
    <button type="button" className="nba-gc-player" onClick={() => player.id && onOpen(player.id)}>
      <span className="nba-gc-who">
        {player.headshot
          ? <img src={player.headshot} alt="" className="nba-gc-head" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
          : <span className="nba-gc-head nba-gc-head-empty" />}
        <span className="nba-gc-id">
          <span className="nba-gc-name">{player.name}</span>
          {meta && <span className="nba-gc-meta">{meta}</span>}
        </span>
      </span>
      {STATS.map(([key]) => (
        <span key={key} className="nba-gc-stat">{player[key]}</span>
      ))}
    </button>
  );
}

function OnCourt({ sides, onOpen }) {
  if (!sides.length) return null;
  return (
    <section className="nba-gc-court">
      <h2 className="nba-gc-heading">On the Court</h2>
      {sides.map((side) => (
        <div key={side.id || side.name} className="nba-gc-side">
          <div className="nba-gc-side-name">
            {teamLogo(side.team) && <img src={teamLogo(side.team)} alt="" className="nba-gc-side-logo" />}
            <span>{side.name}</span>
          </div>
          <div className="nba-gc-cols" aria-hidden="true">
            <span>Player</span>
            {STATS.map(([, label]) => <span key={label}>{label}</span>)}
          </div>
          {side.players.map((player) => (
            <CourtPlayer key={player.id || player.name} player={player} onOpen={onOpen} />
          ))}
        </div>
      ))}
    </section>
  );
}

export default function NbaGamecast({ data, competitors, onShowAll }) {
  const navigate = useNavigate();
  const comps = competitors || [];
  const away = comps.find((comp) => comp.homeAway === 'away') || comps[0];
  const home = comps.find((comp) => comp.homeAway === 'home') || comps[1];
  const winById = new Map((data?.winprobability || []).map((row) => [String(row.playId), row.homeWinPercentage]));
  const sides = nbaCourtSides(data?.boxscore, comps);
  const open = (id) => navigate(`/player/nba/${id}`);

  return (
    <div className="nba-gc">
      <PlayFeed plays={data?.plays} winById={winById} away={away} home={home} onShowAll={onShowAll} />
      <OnCourt sides={sides} onOpen={open} />
    </div>
  );
}
