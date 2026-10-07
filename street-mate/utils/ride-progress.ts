// Works out where a rider is along a trotro ride from their GPS fixes.
//
// Trotros carry no GPS tracker and there is no central operator publishing
// vehicle positions, so "tracking the trotro" means tracking the rider's own
// phone as it travels along the route and matching it to the route's stops
// (the same idea as Verma et al. 2016/2020 — alert the rider to upcoming stops).
//
// Progress only ever moves forward: GPS jitter or a parallel road can't make the
// app "un-pass" a stop.

import { haversineMeters, type LatLng } from './geo';

export const PROGRESS_CONFIG = {
  PASS_RADIUS_M: 110, // within this of a stop = "at" the stop
  LOOKAHEAD_STOPS: 6, // how far ahead of the last stop we are willing to jump
  AT_BOARDING_M: 60,
  ALIGHT_RADIUS_M: 130, // within this of the final stop = arrived
  GET_READY_M: 600, // start warning this far from the stop you get off at
  MISSED_EXTRA_M: 350, // moved this much further than your closest approach = overshot
} as const;

export type RideProgress = {
  /** Index of the last stop passed. -1 until the rider reaches the first stop. */
  passedIdx: number;
  /** Closest the rider has been to the final stop so far. */
  closestToEndM: number;
};

export const initialRideProgress = (): RideProgress => ({ passedIdx: -1, closestToEndM: Infinity });

export type RideSnapshot = {
  progress: RideProgress;
  /** Index of the next stop still ahead. */
  nextIdx: number;
  metersToNext: number;
  metersToEnd: number;
  stopsRemaining: number;
  phase: 'to-board' | 'at-board' | 'riding' | 'get-ready' | 'arrived' | 'missed';
};

export function updateRideProgress(stops: LatLng[], prev: RideProgress, pos: LatLng): RideSnapshot {
  const C = PROGRESS_CONFIG;
  const last = stops.length - 1;

  // Look for the nearest stop at or just ahead of the last one we passed.
  const from = Math.max(prev.passedIdx, 0);
  const to = Math.min(last, from + C.LOOKAHEAD_STOPS);
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = from; i <= to; i++) {
    const d = haversineMeters(pos, stops[i]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  const passedIdx = bestIdx !== -1 && bestDist <= C.PASS_RADIUS_M ? Math.max(prev.passedIdx, bestIdx) : prev.passedIdx;
  const metersToEnd = haversineMeters(pos, stops[last]);
  const progress: RideProgress = { passedIdx, closestToEndM: Math.min(prev.closestToEndM, metersToEnd) };

  const nextIdx = Math.min(last, passedIdx + 1);
  const metersToNext = haversineMeters(pos, stops[nextIdx]);
  const distToFirst = haversineMeters(pos, stops[0]);

  let phase: RideSnapshot['phase'];
  if (metersToEnd <= C.ALIGHT_RADIUS_M && passedIdx >= Math.max(1, last - 2)) {
    phase = 'arrived';
  } else if (
    progress.closestToEndM < C.GET_READY_M &&
    metersToEnd > progress.closestToEndM + C.MISSED_EXTRA_M &&
    passedIdx >= 1
  ) {
    phase = 'missed';
  } else if (passedIdx >= 1 && (metersToEnd <= C.GET_READY_M || last - passedIdx <= 1)) {
    phase = 'get-ready';
  } else if (passedIdx >= 1) {
    phase = 'riding';
  } else if (distToFirst <= C.AT_BOARDING_M || passedIdx === 0) {
    phase = 'at-board';
  } else {
    phase = 'to-board';
  }

  return {
    progress,
    nextIdx,
    metersToNext,
    metersToEnd,
    stopsRemaining: Math.max(0, last - Math.max(passedIdx, 0)),
    phase,
  };
}
