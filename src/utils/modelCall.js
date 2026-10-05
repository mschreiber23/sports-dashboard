// The model’s call is the side with the edge. A Yes is right when the
// player clears the line. A No is right when they stay under. The stored
// result stays the line itself, so the weights still learn from that.

import { NHL_EDGE_MIN } from './nhlEdge.js';

export function modelSide(read) {
  if (read?.prediction === 'yes' || read?.prediction === 'no') return read.prediction;
  const edge = typeof read?.edge === 'number' ? read.edge : null;
  if (edge != null && -edge >= NHL_EDGE_MIN) return 'no';
  return 'yes';
}

export function stampPrediction(row) {
  if (!row) return row;
  const edge = typeof row.edge === 'number' ? row.edge : null;
  return { ...row, prediction: edge != null && -edge >= NHL_EDGE_MIN ? 'no' : 'yes' };
}

export function callGrade(read) {
  if (!read?.result) return null;
  if (read.result === 'void') return 'void';
  if (read.result !== 'hit' && read.result !== 'miss') return null;
  const lineHit = read.result === 'hit';
  const correct = modelSide(read) === 'no' ? !lineHit : lineHit;
  return correct ? 'hit' : 'miss';
}
