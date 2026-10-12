// The call is a bet: at least 4 points of edge, and winning $25 costs $36
// or less after the fee (about 57% or under). The stored result stays the
// line itself, so the weights still learn from whether the player cleared it.

import { NHL_EDGE_MIN } from './nhlEdge.js';
import { betSide } from './scoredProps.js';

export function modelSide(read) {
  const modelP = typeof read?.modelP === 'number' && Number.isFinite(read.modelP) ? read.modelP : null;
  const price = typeof read?.price === 'number' && Number.isFinite(read.price) ? read.price : null;
  if (modelP != null && price != null) return betSide(read);
  if (read?.prediction === 'yes' || read?.prediction === 'no') return read.prediction;
  const edge = typeof read?.edge === 'number' ? read.edge : null;
  if (edge != null && -edge >= NHL_EDGE_MIN) return 'no';
  return 'yes';
}

export function stampPrediction(row) {
  if (!row) return row;
  return { ...row, prediction: modelSide(row) };
}

// Percentages on a graded card belong to the side named in the title.
export function sideQuote(read) {
  const side = modelSide(read);
  const modelP = typeof read?.modelP === 'number' && Number.isFinite(read.modelP) ? read.modelP : null;
  const price = typeof read?.price === 'number' && Number.isFinite(read.price) ? read.price : null;
  const edge = typeof read?.edge === 'number' && Number.isFinite(read.edge) ? read.edge : null;
  if (side !== 'no') return { side, modelP, price, edge };
  return {
    side,
    modelP: modelP == null ? null : 1 - modelP,
    price: price == null ? null : 1 - price,
    edge: edge == null ? null : -edge,
  };
}

export function callGrade(read) {
  if (!read?.result) return null;
  if (read.result === 'void') return 'void';
  if (read.result !== 'hit' && read.result !== 'miss') return null;
  const side = modelSide(read);
  if (side !== 'yes' && side !== 'no') return null;
  const lineHit = read.result === 'hit';
  const correct = side === 'no' ? !lineHit : lineHit;
  return correct ? 'hit' : 'miss';
}
