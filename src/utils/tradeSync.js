// Merge two devices' trade books. A trade this device has already synced,
// and that the account no longer has, was removed on the other device.

export function preferTrade(local, remote) {
  if (!local) return remote;
  if (!remote) return local;
  const first = (local.recordedAt || 0) <= (remote.recordedAt || 0) ? local : remote;
  const graded = [local, remote]
    .filter((row) => row.result)
    .sort((a, b) => (b.gradedAt || 0) - (a.gradedAt || 0))[0];
  const edited = (local.editedAt || remote.editedAt)
    ? ((local.editedAt || 0) >= (remote.editedAt || 0) ? local : remote)
    : first;
  const payout = edited.payout ?? first.payout ?? local.payout ?? remote.payout ?? null;
  const terms = {
    unit: edited.unit,
    price: edited.price,
    edge: edited.edge,
    payout,
    editedAt: edited.editedAt || null,
  };
  if (!graded) return { ...first, ...terms };
  return {
    ...first,
    ...terms,
    result: graded.result,
    actual: graded.actual,
    gradedAt: graded.gradedAt,
  };
}

export function mergeBooks(local, remote, seen) {
  const known = seen instanceof Set ? seen : new Set(seen || []);
  const remoteMap = new Map((remote || []).filter((row) => row?.id).map((row) => [row.id, row]));
  const localMap = new Map((local || []).filter((row) => row?.id).map((row) => [row.id, row]));
  const ids = new Set([...remoteMap.keys(), ...localMap.keys()]);
  const out = [];
  for (const id of ids) {
    const here = localMap.get(id);
    const there = remoteMap.get(id);
    if (here && there) out.push(preferTrade(here, there));
    else if (here && !known.has(id)) out.push(here);
    else if (there && !known.has(id)) out.push(there);
  }
  return out;
}

export function mergeTradeLists(current, incoming) {
  const map = new Map();
  for (const row of current || []) if (row?.id) map.set(row.id, row);
  for (const row of incoming || []) {
    if (!row?.id) continue;
    map.set(row.id, preferTrade(map.get(row.id), row));
  }
  return [...map.values()];
}

function stamp(trade) {
  return [
    trade.id,
    trade.unit,
    trade.price,
    trade.payout,
    trade.edge,
    trade.prediction,
    trade.side,
    trade.result,
    trade.actual,
    trade.editedAt,
    trade.gradedAt,
  ].join('|');
}

export function sameBook(local, remote) {
  if ((local || []).length !== (remote || []).length) return false;
  const map = new Map((remote || []).map((row) => [row.id, row]));
  return (local || []).every((row) => {
    const other = map.get(row.id);
    return other && stamp(other) === stamp(row);
  });
}
