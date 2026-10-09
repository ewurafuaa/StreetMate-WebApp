// Live-traffic journey times.
//
// Google has no trotro timetables for Accra, so its transit mode can't be used. What Google does
// know well is how fast CARS are moving on every road right now, and a trotro is stuck in the same
// traffic. So for each trotro ride we ask the Routes API how long a traffic-aware drive takes from
// the boarding stop to the stop where the rider gets off (passing through the stops in between),
// and swap that in for the planner's fixed-speed guess. Walks use Google's walking times too.
// So the headline time is Google's own numbers added up. Waiting for a trotro to fill can't be
// known, so by default it only widens the top of the "usually" range (see the switches below).
//
// Each request also returns the "no traffic" duration. The gap between the two gives the traffic
// level (light / moderate / heavy) and the range shown under the time.

import { getWalkingRoute } from '@/utils/directions';
import {
  PLANNER_CONFIG,
  type Journey,
  type Leg,
  type PlanStop,
  type RideLeg,
  type TrafficInfo,
  type Waypoint,
} from '@/utils/journey-planner';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? '';
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

// Tunables
const CACHE_MS = 5 * 60 * 1000; // traffic barely changes inside five minutes; saves requests
const MAX_VIA_POINTS = 23; // Google allows 25 intermediate points per request

// true  = time the ride along the trotro's own route, through every stop it makes.
// false = time Google's own fastest road between boarding and getting off, like Google Maps does.
const FOLLOW_TROTRO_ROUTE = true;

// What counts towards the headline time. Off = Google's numbers only.
const ADD_STOP_PAUSES = false; // trotro pausing at every stop (the planner assumes 0.5 min per stop)
const ADD_BOARDING_WAIT = false; // waiting for the trotro to fill (the planner assumes 7 min per ride)
// Top of the "usually" range: extra minutes per ride for waiting, since Google can't know that.
const WAIT_ALLOWANCE_PER_RIDE_MIN = 7;
const LOW_FLOOR = 0.8; // the good case is never shown below 80% of the expected time

type RideTraffic = { minutes: number; freeFlowMinutes: number };

// Holds the request itself, so two journeys sharing the same trotro leg ask Google only once.
const cache = new Map<string, { at: number; request: Promise<RideTraffic | null> }>();

// Keeps the first, last and an even spread of the stops in between.
function sample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round((i * (items.length - 1)) / (max - 1))]);
  return out;
}

const seconds = (value?: string) => (value ? parseInt(value, 10) : NaN);

function rideTraffic(stops: PlanStop[]): Promise<RideTraffic | null> {
  if (!API_KEY || stops.length < 2) return Promise.resolve(null);
  const first = stops[0];
  const last = stops[stops.length - 1];
  const via = FOLLOW_TROTRO_ROUTE ? sample(stops.slice(1, -1), MAX_VIA_POINTS) : [];

  const key = `${first.id}>${last.id}#${via.length}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.request;

  const request = fetchRideTraffic(first, last, via);
  cache.set(key, { at: Date.now(), request });
  // A failed lookup shouldn't be remembered for five minutes.
  request.then((value) => {
    if (value === null && cache.get(key)?.request === request) cache.delete(key);
  });
  return request;
}

async function fetchRideTraffic(first: PlanStop, last: PlanStop, via: PlanStop[]): Promise<RideTraffic | null> {
  if (!API_KEY) return null;
  const point = (s: { lat: number; lng: number }) => ({ location: { latLng: { latitude: s.lat, longitude: s.lng } } });

  try {
    const res = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.staticDuration',
      },
      body: JSON.stringify({
        origin: point(first),
        destination: point(last),
        intermediates: via.map((s) => ({ ...point(s), via: true })),
        travelMode: 'DRIVE',
        // Uses live traffic, departing now.
        routingPreference: 'TRAFFIC_AWARE',
      }),
    });
    if (!res.ok) {
      console.warn('[Traffic]', res.status);
      return null;
    }
    const data = (await res.json()) as { routes?: { duration?: string; staticDuration?: string }[] };
    const route = data.routes?.[0];
    const withTraffic = seconds(route?.duration);
    const freeFlow = seconds(route?.staticDuration);
    if (!Number.isFinite(withTraffic)) return null;

    return {
      minutes: withTraffic / 60,
      freeFlowMinutes: (Number.isFinite(freeFlow) ? Math.min(freeFlow, withTraffic) : withTraffic) / 60,
    };
  } catch {
    return null; // offline or blocked: the planner's own estimate stays
  }
}

const isRide = (leg: Leg): leg is RideLeg => leg.kind === 'ride';

/** One journey re-timed from Google: live-traffic rides and Google's walking times. Unchanged if the rides can't be timed. */
async function withLiveTraffic(journey: Journey): Promise<Journey> {
  const rides = journey.legs.filter(isRide);
  const reads = await Promise.all(rides.map((leg) => rideTraffic(leg.stops)));
  if (reads.some((r) => r === null)) return journey;

  // Google's walking time, or the planner's own where Google has no answer.
  const walkTime = async (from: Waypoint, to: Waypoint, meters: number, fallback: number) => {
    const route = await getWalkingRoute(from, to, meters);
    return !route.approximate && route.durationSeconds > 0 ? route.durationSeconds / 60 : fallback;
  };
  const walkMinutes = await Promise.all(
    journey.legs.map((leg) => (leg.kind === 'walk' ? walkTime(leg.from, leg.to, leg.meters, leg.minutes) : Promise.resolve(0)))
  );
  const lastMile = journey.lastMile;
  const lastMinutes = lastMile ? await walkTime(lastMile.from, lastMile.to, lastMile.meters, lastMile.walkMinutes) : 0;

  let minutes = lastMinutes;
  let freeFlow = lastMinutes; // the same trip with the roads moving freely
  let driving = 0;
  let free = 0;
  let i = 0;

  const legs = journey.legs.map((leg, index): Leg => {
    if (!isRide(leg)) {
      minutes += walkMinutes[index];
      freeFlow += walkMinutes[index];
      return { ...leg, minutes: walkMinutes[index] };
    }
    const read = reads[i++] as RideTraffic;
    const pauses = ADD_STOP_PAUSES ? Math.max(0, leg.stops.length - 2) * PLANNER_CONFIG.DWELL_MIN : 0;
    const wait = ADD_BOARDING_WAIT ? PLANNER_CONFIG.BOARD_WAIT_MIN : 0;
    minutes += read.minutes + pauses + wait;
    freeFlow += read.freeFlowMinutes + pauses + wait;
    driving += read.minutes;
    free += read.freeFlowMinutes;
    return { ...leg, minutes: read.minutes + pauses, waitMinutes: wait };
  });

  minutes = Math.max(1, minutes);
  freeFlow = Math.max(1, freeFlow);
  const ratio = driving / Math.max(free, 0.1);
  const slack = ADD_BOARDING_WAIT ? 5 : WAIT_ALLOWANCE_PER_RIDE_MIN;

  const traffic: TrafficInfo = {
    lowMinutes: Math.round(Math.min(minutes, Math.max(freeFlow, minutes * LOW_FLOOR))),
    highMinutes: Math.round(minutes + (minutes - freeFlow) * 0.5 + slack * journey.rideCount),
    level: ratio >= 1.5 ? 'heavy' : ratio >= 1.2 ? 'moderate' : 'light',
    updatedAt: Date.now(),
  };

  return {
    ...journey,
    legs,
    lastMile: lastMile ? { ...lastMile, walkMinutes: lastMinutes } : null,
    minutes,
    traffic,
  };
}

const score = (j: Journey) => j.minutes + j.transfers * PLANNER_CONFIG.TRANSFER_PENALTY_MIN;

/**
 * Re-times every journey from live traffic and re-ranks them. Returns null when nothing could be
 * updated (no key, offline), so the caller keeps the planner's estimates.
 */
export async function applyLiveTraffic(planned: Journey[]): Promise<Journey[] | null> {
  if (!API_KEY || planned.length === 0) return null;
  const updated = await Promise.all(planned.map(withLiveTraffic));
  if (!updated.some((j) => j.traffic)) return null;
  // Only re-rank when every option got live numbers, so estimates and live times aren't mixed up.
  return updated.every((j) => j.traffic) ? [...updated].sort((a, b) => score(a) - score(b) || a.rideCount - b.rideCount) : updated;
}