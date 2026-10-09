// Central access point for the GTFS-derived bus stop dataset (see
// scripts/gtfs/build_gtfs_data.py). bus_stops.json is already cleaned —
// unnamed entries dropped, ids deduped — so this just types it.

import rawStops from '@/assets/data/bus_stops.json';

export type Stop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export const stops: Stop[] = rawStops as Stop[];

// Placeholder origin until GPS is wired up — roughly Adenta Municipality,
// matching the "Current location" label shown on the search screen.
export const CURRENT_LOCATION = {
  name: 'Adenta Municipality',
  lat: 5.7069,
  lng: -0.1665,
};

const EARTH_RADIUS_KM = 6371;

const toRadians = (deg: number) => (deg * Math.PI) / 180;

// Straight-line distance. Good enough for ranking search results and finding
// the nearest stop; it is not road distance.
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export const formatDistance = (km: number) =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

// OSM maps each side of a road as its own node, so the same stop name often
// appears several times within a few dozen metres. Showing all of them in a
// result list is noise, so near-duplicates collapse to the closest one.
const DEDUPE_RADIUS_KM = 0.25;

export type StopResult = Stop & { distanceKm: number };

const stopById = new Map(stops.map((s) => [s.id, s]));

const sameName = (a: { name: string }, b: { name: string }) =>
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

// How many already-kept stops of a route we compare against. The two sides of a
// road sit next to each other in a route's stop list, so a short look-back is enough.
const ROUTE_LOOKBACK = 3;

/**
 * Collapses the "same stop, other side of the road" entries inside one route's
 * stop list: a stop is dropped when a stop with the same name, less than
 * DEDUPE_RADIUS_KM away, was kept among the few stops just before it.
 * Order is preserved, so a route still reads start → end.
 */
export function dedupeRouteStops<T extends { id: string; name: string }>(routeStops: T[]): T[] {
  const kept: T[] = [];
  for (const s of routeStops) {
    const here = stopById.get(s.id);
    const duplicate =
      !!here &&
      kept.slice(-ROUTE_LOOKBACK).some((k) => {
        const there = stopById.get(k.id);
        return !!there && sameName(k, s) && distanceKm(there, here) < DEDUPE_RADIUS_KM;
      });
    if (!duplicate) kept.push(s);
  }
  return kept;
}

/** A stop shown once on the map, plus the ids of every same-name twin folded into it. */
export type MergedStop = Stop & { ids: string[] };

/**
 * Ranks stops whose name starts with the query above those that merely contain
 * it, then by distance from the reference point.
 */
export function searchStops(
  query: string,
  from: { lat: number; lng: number } = CURRENT_LOCATION,
  limit = 20
): StopResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matches = stops
    .filter((s) => s.name.toLowerCase().includes(q))
    .map((s) => ({ ...s, distanceKm: distanceKm(from, s) }))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q);
      const bStarts = b.name.toLowerCase().startsWith(q);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.distanceKm - b.distanceKm;
    });

  const kept: StopResult[] = [];
  for (const candidate of matches) {
    const duplicate = kept.some(
      (k) =>
        k.name.toLowerCase() === candidate.name.toLowerCase() &&
        distanceKm(k, candidate) < DEDUPE_RADIUS_KM
    );
    if (!duplicate) kept.push(candidate);
    if (kept.length >= limit) break;
  }

  return kept;
}

/** Closest stop to an arbitrary point — the first half of last-mile resolution. */
export function nearestStop(point: { lat: number; lng: number }): StopResult | null {
  if (stops.length === 0) return null;

  let best = stops[0];
  let bestDistance = distanceKm(point, best);

  for (const stop of stops) {
    const d = distanceKm(point, stop);
    if (d < bestDistance) {
      best = stop;
      bestDistance = d;
    }
  }

  return { ...best, distanceKm: bestDistance };
}

/**
 * Stops inside the current map viewport, capped so rendering stays smooth.
 * Same-name stops on opposite sides of a road are merged into one marker; the
 * merged stop keeps every original id in `ids` so route lookups still work.
 */
export function stopsInRegion(
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number },
  limit = 150
): MergedStop[] {
  const halfLat = region.latitudeDelta / 2;
  const halfLng = region.longitudeDelta / 2;

  const visible: MergedStop[] = [];
  const byName = new Map<string, MergedStop[]>();
  for (const stop of stops) {
    if (
      Math.abs(stop.lat - region.latitude) > halfLat ||
      Math.abs(stop.lng - region.longitude) > halfLng
    ) {
      continue;
    }

    const key = stop.name.trim().toLowerCase();
    const group = byName.get(key);
    const twin = group?.find((k) => distanceKm(k, stop) < DEDUPE_RADIUS_KM);
    if (twin) {
      twin.ids.push(stop.id);
      continue;
    }
    if (visible.length >= limit) continue; // keep scanning so late twins still merge
    const merged: MergedStop = { ...stop, ids: [stop.id] };
    visible.push(merged);
    if (group) group.push(merged);
    else byName.set(key, [merged]);
  }

  return visible;
}
