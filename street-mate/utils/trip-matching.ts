// Turns a boarding point + destination into the real trotro options a rider
// actually faces: which terminus name the mate will shout for each route
// that passes the stop nearest the destination, and what the alternatives are.
//
// Ghana's trotros are called by their *end-of-line* stop, not by route number —
// a mate heading to Madina shouts "Madina!" the whole way, regardless of where
// a given passenger boards or alights. For GTFS routes, data/routes.ts carries
// that name directly as `headsign` (from the GTFS export), so this doesn't need
// to guess a direction from stop positions for those — it only needs to pick
// which route-directions are usable and in what order to show them.
//
// Legacy OSM routes (data/routes.ts `source: 'legacy'`) have no recorded
// headsign, so for those this falls back to the older heuristic: guess which
// end of the (undirected) stop list a mate would call based on comparing the
// boarding and alighting stop positions in the list.
//
// Scope note: this matches a single leg (one route-direction, one boarding
// stop, one alighting stop). It does not search for transfers — if the
// boarding stop isn't on a route that serves the alighting stop, that route
// still shows up (its headsign is still the name a mate on it would call),
// just marked direct: false since you'd need to walk to a different stop
// to actually use it.

import { routes, type Route } from '@/data/routes';
import { stops, distanceKm, type Stop, type StopResult } from '@/data/stops';

export type TrotroOption = {
  routeId: string;
  /** The terminus name a mate on this route would call out, e.g. "Madina". */
  trotroName: string;
  /** True when the boarding stop is on this route *and* comes before the
   *  alighting stop in its direction of travel — i.e. actually ridable
   *  start-to-finish without a transfer. */
  direct: boolean;
  /** Stops passed between boarding and alighting, in travel order. */
  intermediateStops: string[];
};

export type TripMatch = {
  boardingStop: StopResult;
  alightingStop: StopResult;
  /** Direct matches first; one entry per distinct terminus name. */
  options: TrotroOption[];
};

// The dataset has duplicate same-named stop nodes (e.g. 15+ separate entries
// all named "Circle") where only some are actually wired into a route's stop
// list — likely alternate GTFS entries for the same physical stop. Matching
// against the FULL stop list can land on an orphaned duplicate purely by
// coordinate proximity and come back with zero routes, even though a usable
// "Circle" stop sits a few metres away. Restricting to stops that appear on
// at least one route-direction avoids that dead end.
const routableStopIds = new Set<string>();
for (const route of routes) {
  for (const stop of route.stops) routableStopIds.add(stop.id);
}
const routableStops: Stop[] = stops.filter((s) => routableStopIds.has(s.id));

function nearestRoutableStop(point: { lat: number; lng: number }): StopResult | null {
  if (routableStops.length === 0) return null;

  let best = routableStops[0];
  let bestDistance = distanceKm(point, best);

  for (const stop of routableStops) {
    const d = distanceKm(point, stop);
    if (d < bestDistance) {
      best = stop;
      bestDistance = d;
    }
  }

  return { ...best, distanceKm: bestDistance };
}

function resolveOption(route: Route, boardingStop: StopResult, alightingStop: StopResult): TrotroOption {
  const targetIdx = route.stops.findIndex((s) => s.id === alightingStop.id);
  const boardingIdx = route.stops.findIndex((s) => s.id === boardingStop.id);

  if (route.headsign) {
    // GTFS route: the stop list is already one direction of travel, and the
    // headsign is the real terminus name — no guessing needed.
    const direct = boardingIdx !== -1 && boardingIdx < targetIdx;
    const intermediateStops = direct ? route.stops.slice(boardingIdx + 1, targetIdx).map((s) => s.name) : [];

    return {
      routeId: route.id,
      trotroName: route.headsign,
      direct,
      intermediateStops,
    };
  }

  // Legacy OSM route: no real headsign, and the stop list isn't guaranteed to
  // reflect one consistent direction of travel. Guess which end of the line
  // a mate would call by checking whether boarding comes before or after
  // alighting, and fall back to "whichever end the alighting stop is closer
  // to" when the boarding stop isn't on this route at all.
  if (boardingIdx !== -1 && boardingIdx !== targetIdx) {
    const forward = boardingIdx < targetIdx;
    const between = forward
      ? route.stops.slice(boardingIdx + 1, targetIdx)
      : route.stops.slice(targetIdx + 1, boardingIdx).reverse();
    const trotroName = forward ? route.stops[route.stops.length - 1].name : route.stops[0].name;

    return {
      routeId: route.id,
      trotroName,
      direct: true,
      intermediateStops: between.map((s) => s.name),
    };
  }

  const distFromStart = targetIdx;
  const distFromEnd = route.stops.length - 1 - targetIdx;
  const trotroName = distFromEnd >= distFromStart ? route.stops[route.stops.length - 1].name : route.stops[0].name;

  return {
    routeId: route.id,
    trotroName,
    direct: false,
    intermediateStops: [],
  };
}

export function matchTrip(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): TripMatch | null {
  const boardingStop = nearestRoutableStop(origin);
  const alightingStop = nearestRoutableStop(destination);
  if (!boardingStop || !alightingStop) return null;

  const candidates = routes.filter((r) => r.stops.some((s) => s.id === alightingStop.id));
  const resolved = candidates.map((route) => resolveOption(route, boardingStop, alightingStop));

  // Direct matches first; collapse to one entry per distinct terminus name
  // (more than one route-direction can share the same end-of-line name).
  resolved.sort((a, b) => Number(b.direct) - Number(a.direct));
  const seen = new Set<string>();
  const options = resolved.filter((option) => {
    if (seen.has(option.trotroName)) return false;
    seen.add(option.trotroName);
    return true;
  });

  return { boardingStop, alightingStop, options };
}

// No real fare/time dataset yet (per the project's stated scope, fare ranges
// are meant to come from collected data) — this is a placeholder heuristic
// so the UI has something to show, not a measured estimate.
export function estimateTripStats(stopsCount: number) {
  const minutes = Math.max(10, stopsCount * 3 + 10);
  const fare = 2 + stopsCount * 0.3;
  return {
    time: `${minutes} mins`,
    fare: `GH¢ ${fare.toFixed(2)}`,
  };
}