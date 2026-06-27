import { useState, useEffect } from 'react';
import { getPlayerBio } from '../api/espn';

const cache = {};

export default function usePlayerBio(sport, playerId) {
  const key = `${sport}-${playerId}`;
  const [bio, setBio] = useState(cache[key] || null);

  useEffect(() => {
    if (!playerId || cache[key]) return;
    getPlayerBio(sport, playerId)
      .then((data) => {
        cache[key] = data;
        setBio(data);
      })
      .catch(() => {});
  }, [sport, playerId]);

  const athlete = bio?.athlete || {};
  return {
    position: athlete.position?.abbreviation || null,
    teamColor: athlete.team?.color || null,
    teamAltColor: athlete.team?.alternateColor || null,
    teamLogo: athlete.team?.logos?.[0]?.href || null,
    teamName: athlete.team?.shortDisplayName || athlete.team?.displayName || null,
  };
}
