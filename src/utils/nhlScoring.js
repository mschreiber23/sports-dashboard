const ASSIST_TYPES = new Set(['assister', 'firstAssist', 'secondAssist']);

function countsFromText(text) {
  const clause = String(text || '').split(/assists:/i)[1] || '';
  const counts = [];
  const re = /\((\d+)\)/g;
  let match;
  while ((match = re.exec(clause))) counts.push(match[1]);
  return counts;
}

function countText(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : null;
}

export function scoringAssists(participants, text) {
  const fromText = countsFromText(text);
  return (participants || [])
    .filter((row) => ASSIST_TYPES.has(row?.type))
    .map((row, index) => {
      const name = row.athlete?.shortName || row.athlete?.displayName || '';
      if (!name) return null;
      return { name, count: countText(row.ytdAssists) || fromText[index] || null };
    })
    .filter(Boolean);
}
