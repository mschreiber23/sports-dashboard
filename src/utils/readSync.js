// Two devices share one account log. A graded read keeps the price and the
// model from the moment it was settled. A later reprice on the other device
// must not rewrite that result, or the hit rate changes on only one screen.

export function preferRead(local, remote) {
  if (!local) return remote;
  if (!remote) return local;
  const graded = [local, remote].filter((row) => row.result);
  if (graded.length === 1) return graded[0];
  if (graded.length === 2) return newerGrade(local, remote);
  const first = (local.recordedAt || 0) <= (remote.recordedAt || 0) ? local : remote;
  const latestPrice = (local.pricedAt || local.recordedAt || 0) >= (remote.pricedAt || remote.recordedAt || 0)
    ? local
    : remote;
  return {
    ...first,
    price: latestPrice.price,
    baseP: typeof latestPrice.baseP === 'number' ? latestPrice.baseP : first.baseP,
    modelP: latestPrice.modelP,
    edge: latestPrice.edge,
    prediction: latestPrice.prediction || first.prediction || null,
    tags: latestPrice.tags || first.tags,
    pricedAt: latestPrice.pricedAt || latestPrice.recordedAt || null,
  };
}

function settledRank(row) {
  if (!row?.result) return 0;
  if (row.pricedAt && row.gradedAt && row.pricedAt > row.gradedAt) return 0;
  return 1;
}

function newerGrade(local, remote) {
  const rank = settledRank(remote) - settledRank(local);
  if (rank) return rank > 0 ? remote : local;
  const when = (remote.gradedAt || 0) - (local.gradedAt || 0);
  if (when) return when > 0 ? remote : local;
  const priced = (local.pricedAt || local.recordedAt || 0) - (remote.pricedAt || remote.recordedAt || 0);
  if (priced) return priced < 0 ? local : remote;
  return remote;
}

export function mergeStoredReads(local, remote) {
  const map = new Map();
  for (const row of local || []) {
    if (row?.id) map.set(row.id, row);
  }
  for (const row of remote || []) {
    if (!row?.id) continue;
    map.set(row.id, preferRead(map.get(row.id), row));
  }
  return [...map.values()];
}

// The results tab is one log. Every account records the slates it sees, and
// the scoreboard is the union of those logs. Copies of the same prop collapse
// here, and a signup from yesterday must not replace a read an older account
// already graded.
export function publicReads(shared, own) {
  if (!Array.isArray(shared)) return own || [];
  return mergeStoredReads([], [...shared, ...(own || [])]);
}

function stamp(row) {
  return [
    row.id,
    row.result ?? '',
    row.actual ?? '',
    row.modelP ?? '',
    row.baseP ?? '',
    row.price ?? '',
    row.edge ?? '',
    row.prediction ?? '',
    row.gradedAt ?? '',
    row.line ?? '',
    Array.isArray(row.tags) ? row.tags.join(',') : '',
  ].join('|');
}

export function sameReads(local, remote) {
  if ((local || []).length !== (remote || []).length) return false;
  const map = new Map((remote || []).filter((row) => row?.id).map((row) => [row.id, row]));
  return (local || []).every((row) => {
    const other = map.get(row.id);
    return other && stamp(other) === stamp(row);
  });
}
