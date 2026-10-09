// Central access point for the trotro route dataset. Two sources feed it:
//
// 1. GTFS trips (scripts/gtfs/build_gtfs_data.py → bus_trips.json) — the
//    primary source, 554 route-directions. Each entry is one *direction* of
//    one route (e.g. "Amasaman -> Abeka Lapaz" and "Abeka Lapaz -> Amasaman"
//    are two separate entries), with a real GTFS trip_headsign: the name a
//    mate actually calls out for that direction (e.g. "Achimota", not the
//    more specific final stop node name "Achimota New Station").
//
// 2. Legacy OSM routes (scripts/gtfs/merge_osm_into_gtfs.py →
//    legacy_routes.json) — 24 routes from the older OSM-snapping pipeline
//    that have no GTFS counterpart (checked by from/to endpoint, not just
//    route id, since the two datasets number routes completely
//    differently). Kept for maximum route coverage so "All Routes" shows
//    every alternative a rider could pick from, even ones the newer export
//    didn't happen to capture. These have no real headsign — nothing in the
//    old pipeline recorded one — so `headsign` is null here, and
//    trip-matching.ts falls back to a position-based guess for them.

import rawTrips from '@/assets/data/bus_trips.json';
import rawLegacyRoutes from '@/assets/data/legacy_routes.json';
import { dedupeRouteStops } from '@/data/stops';

type RawTrip = {
  id: string;
  routeId: string;
  ref: string | null;
  name: string | null;
  headsign: string;
  from: string | null;
  to: string | null;
  stops: { id: string; name: string }[];
};

type RawLegacyRoute = {
  id: string;
  routeId: string;
  ref: string | null;
  name: string | null;
  from: string | null;
  to: string | null;
  stops: { id: string; name: string }[];
};

export type RouteStop = {
  id: string;
  name: string;
};

export type Route = {
  /** `${routeId}_${directionId}` for GTFS routes, `legacy_${routeId}` for legacy ones — unique per direction, not just per route. */
  id: string;
  routeId: string;
  ref: string | null;
  name: string;
  /**
   * The terminus name a mate travelling this direction calls out, from the
   * GTFS trip_headsign. Null for legacy OSM routes, which have no recorded
   * headsign — trip-matching.ts guesses one from stop position instead.
   */
  headsign: string | null;
  from: string | null;
  to: string | null;
  stops: RouteStop[];
  /** Which dataset this route came from — decides how trip-matching resolves its terminus name. */
  source: 'gtfs' | 'legacy';
};

// Both sides of a road are mapped as separate stops, so a route's stop list can name the
// same stop twice in a row. Collapse those before anything (planner, map, timeline) sees them.
const gtfsRoutes: Route[] = (rawTrips as RawTrip[])
  .map((t) => ({ ...t, stops: Array.isArray(t.stops) ? dedupeRouteStops(t.stops) : t.stops }))
  .filter((t) => Array.isArray(t.stops) && t.stops.length >= 2)
  .map((t) => ({
    id: t.id,
    routeId: t.routeId,
    ref: t.ref,
    name: t.name ?? `${t.from ?? '?'} → ${t.to ?? '?'}`,
    headsign: t.headsign,
    from: t.from,
    to: t.to,
    stops: t.stops,
    source: 'gtfs' as const,
  }));

const legacyRoutes: Route[] = (rawLegacyRoutes as RawLegacyRoute[])
  .map((r) => ({ ...r, stops: Array.isArray(r.stops) ? dedupeRouteStops(r.stops) : r.stops }))
  .filter((r) => Array.isArray(r.stops) && r.stops.length >= 2)
  .map((r) => ({
    id: r.id,
    routeId: r.routeId,
    ref: r.ref,
    name: r.name ?? `${r.from ?? '?'} ↔ ${r.to ?? '?'}`,
    headsign: null,
    from: r.from,
    to: r.to,
    stops: r.stops,
    source: 'legacy' as const,
  }));

export const routes: Route[] = [...gtfsRoutes, ...legacyRoutes];

/** All route-directions that pass through a given stop, e.g. to show "which trotros stop here". */
export function routesForStop(stopId: string): Route[] {
  return routes.filter((r) => r.stops.some((s) => s.id === stopId));
}

export function routeById(id: string): Route | undefined {
  return routes.find((r) => r.id === id);
}
