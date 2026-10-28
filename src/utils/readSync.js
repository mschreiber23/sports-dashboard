// Two devices share one account log. A graded read keeps the price and the
// model from the moment it was settled. A later reprice on the other device
// must not rewrite that result, or the hit rate changes on only one screen.

export function preferRead(local, remote) {
  if (!local) return remote;
  if (!remote) return local;
  const graded = [local, remote].filter((row) => row.result);
  if (graded.length) {
    graded.sort((a, b) => {
      const clean = settledRank(b) - settledRank(a);
      if (clean) return clean;
      const when = (b.gradedAt || 0) - (a.gradedAt || 0);
      if (when) return when;
      return (a.pricedAt || a.recordedAt || 0) - (b.pricedAt || b.recordedAt || 0);
    });
    return graded[0];
  }
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
