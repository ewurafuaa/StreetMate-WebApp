// Multi-leg trotro journey planner.
//
// Given where the rider is and where they want to go, this finds the trotro
// combinations that get them there: a single direct ride, or two / three rides
// with the transfer stops (and the short walks between them) spelled out.
// After the last ride it works out the "last mile" from the stop where the
// rider gets off to the actual destination, so the UI can offer walking
// directions or a ride-hailing hand-off (Uber / Yango / Bolt).
//
// How it works
// ------------
// The route dataset has no timetables (trotros leave when full), so this is a
// shortest-path search over a layered graph rather than a schedule lookup:
//
//   W(k,i)   standing at stop i, arrived on foot, k rides taken so far
//   S(k,i)   standing at stop i, just got off a trotro, k rides taken so far
//   V(k,r,p) on route-direction r at its p-th stop, during ride number k
//
//   walk to a nearby stop   S -> W            cost: metres / walking speed
//   board                   S|W -> V(k+1)     cost: BOARD_WAIT_MIN (trotros fill before leaving)
//   ride one stop           V(p) -> V(p+1)    cost: road distance / trotro speed + a dwell
//   get off                 V -> S            cost: 0
//
// Layers cap the rides at MAX_RIDES. Running Dijkstra once gives the best
// journey for every ride count; re-running with the best route banned surfaces
// genuinely different alternatives instead of near-identical ones.
//
// Everything here is pure (data is passed in) so it runs in Node for testing.

import { haversineMeters, type LatLng } from './geo';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanStop = { id: string; name: string; lat: number; lng: number };
export type Waypoint = { name: string; lat: number; lng: number };

export type PlannerRoute = {
  id: string;
  routeId: string;
  ref: string | null;
  name: string;
  /** Terminus a mate calls out for this direction. Null for legacy OSM routes. */
  headsign: string | null;
  stops: { id: string; name: string }[];
  source: 'gtfs' | 'legacy';
};

export type FareRange = { low: number; high: number };

export type WalkLeg = {
  kind: 'walk';
  /** 'access' = to the first stop, 'transfer' = between two trotro stops. */
  role: 'access' | 'transfer';
  from: Waypoint;
  to: Waypoint;
  meters: number;
  minutes: number;
};

export type RideLeg = {
  kind: 'ride';
  routeId: string;
  directionId: string;
  /** What the mate shouts, e.g. "Madina". */
  trotroName: string;
  ref: string | null;
  /** Every stop on the ride in order, boarding stop first and alighting stop last. */
  stops: PlanStop[];
  minutes: number;
  waitMinutes: number;
  fare: FareRange;
  /** Other trotros that cover the same boarding → alighting stretch. */
  alsoServing: string[];
};

export type Leg = WalkLeg | RideLeg;

export type LastMile = {
  from: Waypoint;
  to: Waypoint;
  meters: number;
  walkMinutes: number;
};

/** Live-traffic estimate layered on top of a journey (see utils/traffic.ts). */
export type TrafficInfo = {
  /** A good case, with the roads moving freely. */
  lowMinutes: number;
  /** A bad case: heavier traffic plus a longer wait for the trotro to fill. */
  highMinutes: number;
  level: 'light' | 'moderate' | 'heavy';
  updatedAt: number;
};

export type Journey = {
  id: string;
  origin: Waypoint;
  destination: Waypoint;
  legs: Leg[];
  /** Null when the last stop is already at the destination. */
  lastMile: LastMile | null;
  rideCount: number;
  transfers: number;
  /** Door to door, including waiting for trotros and the last-mile walk. */
  minutes: number;
  fare: FareRange;
  walkMeters: number;
  tags: string[];
  /** Present once live traffic has been applied; `minutes` then already reflects it. */
  traffic?: TrafficInfo;
};

export type PlanResult = {
  journeys: Journey[];
  reason: 'ok' | 'origin-far' | 'destination-far' | 'no-route';
};

// ---------------------------------------------------------------------------
// Tunables — all in one place so the model is easy to calibrate with field data
// ---------------------------------------------------------------------------

export const PLANNER_CONFIG = {
  MAX_RIDES: 3,
  WALK_M_PER_MIN: 75, // ~4.5 km/h
  WALK_DETOUR: 1.25, // straight-line → real footpath
  ROAD_DETOUR: 1.3, // straight-line → real road between two stops
  TROTRO_M_PER_MIN: 290, // ~17 km/h average in Accra traffic
  DWELL_MIN: 0.5, // per intermediate stop
  BOARD_WAIT_MIN: 7, // waiting for a trotro to fill
  ACCESS_RADIUS_M: 900, // how far the rider will walk to a first stop
  EGRESS_RADIUS_M: 1200, // how far from the last stop to the destination
  TRANSFER_RADIUS_M: 300, // walk allowed between two stops when changing trotro
  ARRIVED_RADIUS_M: 120, // closer than this to the destination = no last mile needed
  TRANSFER_PENALTY_MIN: 6, // ranking only: changing trotro is tiring, so favour fewer rides
  MAX_ACCESS_CANDIDATES: 25,
  MAX_RESULTS: 6,
} as const;

const C = PLANNER_CONFIG;
const walkMinutes = (meters: number) => (meters * C.WALK_DETOUR) / C.WALK_M_PER_MIN;

// ---------------------------------------------------------------------------
// Fare — PLACEHOLDER heuristic (see README: replace with surveyed fare ranges)
// ---------------------------------------------------------------------------

const roundToHalf = (n: number) => Math.round(n * 2) / 2;

/** Rough fare for one ride. Returned as a range because trotro fares are negotiated, not published. */
export function estimateRideFare(intermediateStops: number): FareRange {
  const base = 2 + intermediateStops * 0.3;
  return { low: roundToHalf(base * 0.85), high: Math.max(roundToHalf(base * 1.15), roundToHalf(base * 0.85) + 0.5) };
}

export function formatFare(fare: FareRange): string {
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return fare.low === fare.high ? `GH¢ ${fmt(fare.low)}` : `GH¢ ${fmt(fare.low)}–${fmt(fare.high)}`;
}

// ---------------------------------------------------------------------------
// Planner construction (precomputes indexes once, then plans quickly)
// ---------------------------------------------------------------------------

type Direction = {
  id: string;
  routeId: string;
  ref: string | null;
  trotroName: string;
  stopIdx: number[]; // indexes into the planner's stop table
  segMinutes: number[]; // segMinutes[p] = minutes from position p to p+1
  vOffset: number; // first global vehicle-position index of this direction
};

class MinHeap {
  private costs: number[] = [];
  private nodes: number[] = [];
  get size() {
    return this.costs.length;
  }
  push(cost: number, node: number) {
    const c = this.costs;
    const n = this.nodes;
    let i = c.length;
    c.push(cost);
    n.push(node);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (c[parent] <= c[i]) break;
      [c[parent], c[i]] = [c[i], c[parent]];
      [n[parent], n[i]] = [n[i], n[parent]];
      i = parent;
    }
  }
  pop(): [number, number] {
    const c = this.costs;
    const n = this.nodes;
    const topCost = c[0];
    const topNode = n[0];
    const lastCost = c.pop() as number;
    const lastNode = n.pop() as number;
    if (c.length > 0) {
      c[0] = lastCost;
      n[0] = lastNode;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < c.length && c[l] < c[m]) m = l;
        if (r < c.length && c[r] < c[m]) m = r;
        if (m === i) break;
        [c[m], c[i]] = [c[i], c[m]];
        [n[m], n[i]] = [n[i], n[m]];
        i = m;
      }
    }
    return [topCost, topNode];
  }
}

export function createPlanner(allStops: PlanStop[], allRoutes: PlannerRoute[]) {
  const stopById = new Map(allStops.map((s) => [s.id, s]));

  // --- Directions: GTFS routes are already one direction; legacy routes get both. ---
  const rawDirections: { id: string; route: PlannerRoute; stops: { id: string; name: string }[]; name: string }[] = [];
  for (const route of allRoutes) {
    const stops = route.stops.filter((s) => stopById.has(s.id));
    if (stops.length < 2) continue;
    if (route.headsign) {
      rawDirections.push({ id: route.id, route, stops, name: route.headsign });
    } else {
      const reversed = [...stops].reverse();
      rawDirections.push({ id: `${route.id}#fwd`, route, stops, name: stops[stops.length - 1].name });
      rawDirections.push({ id: `${route.id}#rev`, route, stops: reversed, name: reversed[reversed.length - 1].name });
    }
  }

  // --- Stop table: only stops that at least one route actually serves. ---
  const stopIndexById = new Map<string, number>();
  const stopTable: PlanStop[] = [];
  for (const d of rawDirections) {
    for (const s of d.stops) {
      if (!stopIndexById.has(s.id)) {
        stopIndexById.set(s.id, stopTable.length);
        stopTable.push(stopById.get(s.id) as PlanStop);
      }
    }
  }
  const nStops = stopTable.length;

  // --- Directions with segment times; per-stop boarding lists. ---
  const directions: Direction[] = [];
  const vRoute: number[] = []; // global position → direction index
  const vPos: number[] = []; // global position → position within direction
  const boardAt: [number, number][][] = Array.from({ length: nStops }, () => []);

  rawDirections.forEach((raw, dIdx) => {
    const stopIdx = raw.stops.map((s) => stopIndexById.get(s.id) as number);
    const segMinutes: number[] = [];
    for (let p = 0; p < stopIdx.length - 1; p++) {
      const a = stopTable[stopIdx[p]];
      const b = stopTable[stopIdx[p + 1]];
      segMinutes.push((haversineMeters(a, b) * C.ROAD_DETOUR) / C.TROTRO_M_PER_MIN + C.DWELL_MIN);
    }
    const vOffset = vRoute.length;
    stopIdx.forEach((sIdx, p) => {
      vRoute.push(dIdx);
      vPos.push(p);
      boardAt[sIdx].push([dIdx, p]);
    });
    directions.push({
      id: raw.id,
      routeId: raw.route.routeId,
      ref: raw.route.ref,
      trotroName: raw.name,
      stopIdx,
      segMinutes,
      vOffset,
    });
  });
  const nPos = vRoute.length;

  // --- Walking neighbours via a coarse grid (cell ≈ 0.003° ≈ 330 m). ---
  const CELL = 0.003;
  const cellKey = (lat: number, lng: number) => `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;
  const grid = new Map<string, number[]>();
  stopTable.forEach((s, i) => {
    const key = cellKey(s.lat, s.lng);
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  });

  function stopsWithin(point: LatLng, radiusM: number): { i: number; d: number }[] {
    const cellSpan = Math.ceil(radiusM / 330) + 1;
    const cLat = Math.floor(point.lat / CELL);
    const cLng = Math.floor(point.lng / CELL);
    const out: { i: number; d: number }[] = [];
    for (let dy = -cellSpan; dy <= cellSpan; dy++) {
      for (let dx = -cellSpan; dx <= cellSpan; dx++) {
        const bucket = grid.get(`${cLat + dy}:${cLng + dx}`);
        if (!bucket) continue;
        for (const i of bucket) {
          const d = haversineMeters(point, stopTable[i]);
          if (d <= radiusM) out.push({ i, d });
        }
      }
    }
    return out;
  }

  const neighbours: { j: number; d: number }[][] = stopTable.map((s, i) =>
    stopsWithin(s, C.TRANSFER_RADIUS_M)
      .filter((n) => n.i !== i)
      .map((n) => ({ j: n.i, d: n.d }))
  );

  // --- Node numbering. Per layer: [S: nStops][W: nStops][V: nPos]. ---
  const LAYERS = C.MAX_RIDES + 1;
  const perLayer = 2 * nStops + nPos;
  const totalNodes = LAYERS * perLayer;
  const nodeS = (k: number, i: number) => k * perLayer + i;
  const nodeW = (k: number, i: number) => k * perLayer + nStops + i;
  const nodeV = (k: number, gPos: number) => k * perLayer + 2 * nStops + gPos;

  type Search = { dist: Float64Array; prev: Int32Array };

  function dijkstra(sources: { i: number; d: number }[], banned: Set<string>): Search {
    const dist = new Float64Array(totalNodes).fill(Infinity);
    const prev = new Int32Array(totalNodes).fill(-1);
    const heap = new MinHeap();

    for (const s of sources) {
      const node = nodeW(0, s.i);
      const cost = walkMinutes(s.d);
      if (cost < dist[node]) {
        dist[node] = cost;
        heap.push(cost, node);
      }
    }

    const relax = (from: number, to: number, cost: number) => {
      if (cost < dist[to]) {
        dist[to] = cost;
        prev[to] = from;
        heap.push(cost, to);
      }
    };

    const board = (from: number, k: number, i: number, cost: number) => {
      if (k >= C.MAX_RIDES) return;
      for (const [dIdx, p] of boardAt[i]) {
        if (p === directions[dIdx].stopIdx.length - 1) continue; // nothing ahead to ride
        if (banned.has(directions[dIdx].routeId)) continue;
        relax(from, nodeV(k + 1, directions[dIdx].vOffset + p), cost + C.BOARD_WAIT_MIN);
      }
    };

    while (heap.size > 0) {
      const [cost, node] = heap.pop();
      if (cost > dist[node]) continue;

      const k = Math.floor(node / perLayer);
      const local = node % perLayer;

      if (local < nStops) {
        // S: just got off. Walk to a neighbouring stop, or board right here.
        const i = local;
        for (const n of neighbours[i]) relax(node, nodeW(k, n.j), cost + walkMinutes(n.d));
        board(node, k, i, cost);
      } else if (local < 2 * nStops) {
        // W: arrived on foot. Can only board.
        board(node, k, local - nStops, cost);
      } else {
        // V: on a trotro.
        const gPos = local - 2 * nStops;
        const dIdx = vRoute[gPos];
        const p = vPos[gPos];
        const dir = directions[dIdx];
        if (p > 0) relax(node, nodeS(k, dir.stopIdx[p]), cost); // get off (not at the boarding stop itself)
        if (p < dir.stopIdx.length - 1) relax(node, nodeV(k, gPos + 1), cost + dir.segMinutes[p]);
      }
    }
    return { dist, prev };
  }

  // --- Turning a node path back into legs. ---
  function reconstruct(
    search: Search,
    target: number,
    origin: Waypoint,
    destination: Waypoint,
    destinationDistanceFromStop: number
  ): Journey | null {
    const path: number[] = [];
    for (let n = target; n !== -1; n = search.prev[n]) path.push(n);
    path.reverse();

    const decode = (node: number) => {
      const k = Math.floor(node / perLayer);
      const local = node % perLayer;
      if (local < nStops) return { type: 'S' as const, k, i: local, gPos: -1 };
      if (local < 2 * nStops) return { type: 'W' as const, k, i: local - nStops, gPos: -1 };
      return { type: 'V' as const, k, i: -1, gPos: local - 2 * nStops };
    };

    const legs: Leg[] = [];
    const first = decode(path[0]);
    if (first.type !== 'W') return null;

    const wp = (i: number): Waypoint => ({ name: stopTable[i].name, lat: stopTable[i].lat, lng: stopTable[i].lng });

    // Access walk to the first stop
    const accessMeters = haversineMeters(origin, stopTable[first.i]);
    if (accessMeters > 40) {
      legs.push({
        kind: 'walk',
        role: 'access',
        from: origin,
        to: wp(first.i),
        meters: accessMeters,
        minutes: walkMinutes(accessMeters),
      });
    }

    let rideStartPos: { dIdx: number; p: number } | null = null;
    let lastRidePos: { dIdx: number; p: number } | null = null;

    for (let n = 1; n < path.length; n++) {
      const prevNode = decode(path[n - 1]);
      const node = decode(path[n]);

      if (node.type === 'V') {
        const dIdx = vRoute[node.gPos];
        const p = vPos[node.gPos];
        if (prevNode.type !== 'V') rideStartPos = { dIdx, p };
        lastRidePos = { dIdx, p };
      } else if (prevNode.type === 'V' && node.type === 'S') {
        // Ride finished.
        if (!rideStartPos || !lastRidePos) return null;
        const dir = directions[rideStartPos.dIdx];
        const ids = dir.stopIdx.slice(rideStartPos.p, lastRidePos.p + 1);
        const stops = ids.map((i) => stopTable[i]);
        let minutes = 0;
        for (let p = rideStartPos.p; p < lastRidePos.p; p++) minutes += dir.segMinutes[p];
        legs.push({
          kind: 'ride',
          routeId: dir.routeId,
          directionId: dir.id,
          trotroName: dir.trotroName,
          ref: dir.ref,
          stops,
          minutes,
          waitMinutes: C.BOARD_WAIT_MIN,
          fare: estimateRideFare(Math.max(0, stops.length - 2)),
          alsoServing: [],
        });
        rideStartPos = null;
      } else if (prevNode.type === 'S' && node.type === 'W') {
        const meters = haversineMeters(stopTable[prevNode.i], stopTable[node.i]);
        if (meters > 30) {
          legs.push({
            kind: 'walk',
            role: 'transfer',
            from: wp(prevNode.i),
            to: wp(node.i),
            meters,
            minutes: walkMinutes(meters),
          });
        }
      }
    }

    const rides = legs.filter((l): l is RideLeg => l.kind === 'ride');
    if (rides.length === 0) return null;

    // "Also serving": other trotros covering the same boarding → alighting stretch.
    for (const ride of rides) {
      const a = stopIndexById.get(ride.stops[0].id) as number;
      const b = stopIndexById.get(ride.stops[ride.stops.length - 1].id) as number;
      const names = new Set<string>();
      for (const [dIdx, p] of boardAt[a]) {
        const dir = directions[dIdx];
        if (dir.id === ride.directionId || dir.trotroName === ride.trotroName) continue;
        const q = dir.stopIdx.indexOf(b, p + 1);
        if (q !== -1) names.add(dir.trotroName);
      }
      ride.alsoServing = Array.from(names).slice(0, 8);
    }

    const lastStop = rides[rides.length - 1].stops[rides[rides.length - 1].stops.length - 1];
    const lastMile: LastMile | null =
      destinationDistanceFromStop > C.ARRIVED_RADIUS_M
        ? {
            from: { name: lastStop.name, lat: lastStop.lat, lng: lastStop.lng },
            to: destination,
            meters: destinationDistanceFromStop,
            walkMinutes: walkMinutes(destinationDistanceFromStop),
          }
        : null;

    const fare: FareRange = rides.reduce(
      (sum, r) => ({ low: sum.low + r.fare.low, high: sum.high + r.fare.high }),
      { low: 0, high: 0 }
    );
    const minutes =
      legs.reduce((sum, l) => sum + (l.kind === 'ride' ? l.minutes + l.waitMinutes : l.minutes), 0) +
      (lastMile ? lastMile.walkMinutes : 0);
    const walkMeters =
      legs.reduce((sum, l) => sum + (l.kind === 'walk' ? l.meters : 0), 0) + (lastMile ? lastMile.meters : 0);

    // Identity = where the rider boards and gets off. Two trotro names serving the same
    // stretch are one option for the rider (the others show up under `alsoServing`).
    const id = rides.map((r) => `${r.stops[0].name}>${r.stops[r.stops.length - 1].name}`).join('|');

    return {
      id,
      origin,
      destination,
      legs,
      lastMile,
      rideCount: rides.length,
      transfers: rides.length - 1,
      minutes,
      fare,
      walkMeters,
      tags: [],
    };
  }

  function bestPerRideCount(
    search: Search,
    egress: { i: number; d: number }[],
    origin: Waypoint,
    destination: Waypoint
  ): Journey[] {
    const out: Journey[] = [];
    for (let k = 1; k <= C.MAX_RIDES; k++) {
      let bestNode = -1;
      let bestCost = Infinity;
      let bestD = 0;
      for (const e of egress) {
        const node = nodeS(k, e.i);
        const total = search.dist[node] + (e.d > C.ARRIVED_RADIUS_M ? walkMinutes(e.d) : 0);
        if (total < bestCost) {
          bestCost = total;
          bestNode = node;
          bestD = e.d;
        }
      }
      if (bestNode === -1) continue;
      const journey = reconstruct(search, bestNode, origin, destination, bestD);
      if (journey) out.push(journey);
    }
    return out;
  }

  function plan(originPoint: Waypoint, destinationPoint: Waypoint): PlanResult {
    const access = stopsWithin(originPoint, C.ACCESS_RADIUS_M)
      .sort((a, b) => a.d - b.d)
      .slice(0, C.MAX_ACCESS_CANDIDATES);
    if (access.length === 0) return { journeys: [], reason: 'origin-far' };

    const egress = stopsWithin(destinationPoint, C.EGRESS_RADIUS_M);
    if (egress.length === 0) return { journeys: [], reason: 'destination-far' };

    const found = new Map<string, Journey>();
    const queue: Set<string>[] = [new Set()];
    const seenBans = new Set<string>();
    let runs = 0;

    while (queue.length > 0 && runs < 5) {
      const banned = queue.shift() as Set<string>;
      const banKey = Array.from(banned).sort().join(',');
      if (seenBans.has(banKey)) continue;
      seenBans.add(banKey);
      runs++;

      const search = dijkstra(access, banned);
      const journeys = bestPerRideCount(search, egress, originPoint, destinationPoint);
      for (const j of journeys) {
        const existing = found.get(j.id);
        if (!existing || j.minutes < existing.minutes) found.set(j.id, j);
      }
      if (journeys.length === 0) continue;

      // Ban the first trotro of the quickest result to force a different alternative next run.
      const best = journeys.reduce((a, b) => (b.minutes < a.minutes ? b : a));
      const firstRide = best.legs.find((l): l is RideLeg => l.kind === 'ride');
      if (firstRide) queue.push(new Set([...banned, firstRide.routeId]));
    }

    let list = Array.from(found.values());
    if (list.length === 0) return { journeys: [], reason: 'no-route' };

    // Rank by door-to-door time plus a comfort penalty per transfer (changing trotro is
    // tiring and risky); drop options that are far worse than the best.
    const score = (j: Journey) => j.minutes + j.transfers * C.TRANSFER_PENALTY_MIN;
    list.sort((a, b) => score(a) - score(b) || a.rideCount - b.rideCount);
    const bestScore = score(list[0]);
    list = list.filter((j) => score(j) <= bestScore * 1.8 + 12).slice(0, C.MAX_RESULTS);

    // Tags
    const fastest = list.reduce((a, b) => (b.minutes < a.minutes ? b : a));
    const fewest = list.reduce((a, b) => (b.rideCount < a.rideCount ? b : a));
    const cheapest = list.reduce((a, b) => (b.fare.low + b.fare.high < a.fare.low + a.fare.high ? b : a));
    fastest.tags.push('Fastest');
    // A single-trotro trip is already tagged "Direct" below; "Fewest transfers" would just repeat it.
    if (fewest !== fastest && fewest.rideCount < fastest.rideCount && fewest.rideCount > 1) fewest.tags.push('Fewest transfers');
    if (cheapest !== fastest && cheapest !== fewest && list.length > 2) cheapest.tags.push('Cheapest');
    for (const j of list) if (j.rideCount === 1 && !j.tags.includes('Direct')) j.tags.push('Direct');

    return { journeys: list, reason: 'ok' };
  }

  return { plan, stopCount: nStops, directionCount: directions.length };
}