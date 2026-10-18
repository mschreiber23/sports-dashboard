// ESPN's scoreboard situation.possession is the team id that has the ball.
// It is missing on a dead ball (timeout, extra point, kickoff). down of -1
// is that same dead ball, so the down-and-distance line stays hidden then.
// lastPlay.text is the most recent play, including a leading space.

export function nflScoreSituation(situation, competitors = []) {
  const sit = situation || {};
  const possId = sit.possession == null || sit.possession === '' ? '' : String(sit.possession);
  const team = possId
    ? (competitors || []).find((row) => String(row?.team?.id) === possId)
    : null;
  const down = Number(sit.down);
  const hasDown = Number.isFinite(down) && down > 0;
  const downText = hasDown
    ? String(sit.downDistanceText || sit.shortDownDistanceText || '').trim()
    : '';
  const lastPlay = String(sit.lastPlay?.text || '').replace(/\s+/g, ' ').trim();
  return {
    possessionId: team ? possId : '',
    possessionName: team?.team?.shortDisplayName || team?.team?.abbreviation || '',
    downText,
    lastPlay,
    isRedZone: !!sit.isRedZone && hasDown,
  };
}
