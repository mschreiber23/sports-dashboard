// Favorites order stays put inside each group. Teams with a game on the
// selected day move ahead of teams that are off.

export function teamsWithGamesFirst(teams, playingOnDay) {
  return teams
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const aOn = playingOnDay[`${a.entry.sport}-${a.entry.team.id}`] ? 0 : 1;
      const bOn = playingOnDay[`${b.entry.sport}-${b.entry.team.id}`] ? 0 : 1;
      if (aOn !== bOn) return aOn - bOn;
      return a.index - b.index;
    })
    .map(({ entry }) => entry);
}
