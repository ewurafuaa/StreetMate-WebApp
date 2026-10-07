// Small geometry helpers shared by the planner, live tracking and the map layers.
// Pure functions only (no React / native imports) so they can be unit-tested in Node.

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Straight-line distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing from a to b, 0–360 (0 = north). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compassLabel = (bearing: number) => COMPASS[Math.round(bearing / 45) % 8];

export function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Points along a→b roughly every `spacingMeters` (start included, end excluded). */
export function sampleSegment(a: LatLng, b: LatLng, spacingMeters: number): LatLng[] {
  const length = haversineMeters(a, b);
  const steps = Math.max(1, Math.round(length / spacingMeters));
  const out: LatLng[] = [];
  for (let i = 0; i < steps; i++) out.push(lerp(a, b, i / steps));
  return out;
}

export const formatMeters = (m: number) =>
  m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`;

export const formatMinutes = (min: number) => {
  const rounded = Math.max(1, Math.round(min));
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
};
