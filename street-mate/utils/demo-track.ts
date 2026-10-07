// Builds a synthetic GPS track along a planned journey so the whole live-tracking
// flow (walk → board → ride → transfer → last mile) can be demonstrated at a desk.

import { sampleSegment, type LatLng } from './geo';
import type { Journey } from './journey-planner';

export function buildDemoTrack(journey: Journey): LatLng[] {
  const track: LatLng[] = [];
  const pushLine = (points: LatLng[], spacing: number) => {
    for (let i = 0; i < points.length - 1; i++) track.push(...sampleSegment(points[i], points[i + 1], spacing));
  };

  let cursor: LatLng = journey.origin;
  for (const leg of journey.legs) {
    if (leg.kind === 'walk') {
      pushLine([cursor, leg.to], 25);
      cursor = leg.to;
    } else {
      pushLine([cursor, leg.stops[0]], 25); // in case the previous leg ended a little short
      pushLine(leg.stops, 90);
      cursor = leg.stops[leg.stops.length - 1];
    }
  }
  if (journey.lastMile) pushLine([cursor, journey.lastMile.to], 25);
  track.push(journey.lastMile ? journey.lastMile.to : cursor);
  return track;
}
