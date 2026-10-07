// "Where do I pass?" — the named trotro stops and junctions that sit beside a walking
// path. In Accra people navigate by these names, not by street numbers, so listing them
// next to the turn-by-turn steps tells the rider what they should actually see.

import { haversineMeters, type LatLng } from './geo';

type Named = { name: string; lat: number; lng: number };

const MAX_OFFSET_M = 45; // how far from the path a stop may be and still count as "on the way"
const GENERIC = /^(junction|station|stop|bus stop|trotro stop|unknown)$/i;

export function landmarksAlongPath(
  path: { latitude: number; longitude: number }[],
  candidates: Named[],
  limit = 5
): string[] {
  if (path.length < 2) return [];

  // Bounding box prefilter keeps this cheap against ~2,800 stops.
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of path) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }
  const pad = 0.0006; // ≈ 65 m
  const nearby = candidates.filter(
    (c) => c.lat >= minLat - pad && c.lat <= maxLat + pad && c.lng >= minLng - pad && c.lng <= maxLng + pad
  );

  // Densify long segments so a stop beside the middle of a straight stretch is still found.
  const dense: LatLng[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = { lat: path[i].latitude, lng: path[i].longitude };
    const b = { lat: path[i + 1].latitude, lng: path[i + 1].longitude };
    const steps = Math.max(1, Math.ceil(haversineMeters(a, b) / 25));
    for (let s = 0; s < steps; s++) {
      dense.push({ lat: a.lat + ((b.lat - a.lat) * s) / steps, lng: a.lng + ((b.lng - a.lng) * s) / steps });
    }
  }
  const end = path[path.length - 1];
  dense.push({ lat: end.latitude, lng: end.longitude });

  const hits: { name: string; at: number }[] = [];
  for (const c of nearby) {
    if (!c.name || GENERIC.test(c.name.trim())) continue;
    for (let i = 0; i < dense.length; i++) {
      if (haversineMeters(dense[i], c) <= MAX_OFFSET_M) {
        hits.push({ name: c.name.trim(), at: i });
        break;
      }
    }
  }

  hits.sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hits) {
    const k = h.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h.name);
    if (out.length >= limit) break;
  }
  return out;
}
