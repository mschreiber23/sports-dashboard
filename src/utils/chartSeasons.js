import { mergeGames } from './nhlTeamSkaters.js';

const MAX_SEASONS = 12;

function filled(seasons, opponent, faces, limit) {
  const merged = mergeGames(seasons);
  if (merged.length < limit) return false;
  if (!opponent) return true;
  return merged.filter((game) => faces(game, opponent)).length >= limit;
}

export async function chartSeasons(load, year, opponent, faces, limit = 10) {
  const current = await load(year);
  const earlier = [];
  let emptyRun = current.length === 0 ? 1 : 0;
  const seasons = () => [current, ...earlier];
  if (filled(seasons(), opponent, faces, limit)) return seasons();

  for (let back = 1; back < MAX_SEASONS;) {
    const offsets = [];
    while (offsets.length < 3 && back < MAX_SEASONS) {
      offsets.push(back);
      back += 1;
    }
    const batch = await Promise.all(offsets.map((offset) => load(year - offset)));
    for (const games of batch) {
      if (games.length === 0) {
        emptyRun += 1;
        if (emptyRun >= 2) return seasons();
        continue;
      }
      emptyRun = 0;
      earlier.push(games);
      if (filled(seasons(), opponent, faces, limit)) return seasons();
    }
  }
  return seasons();
}
