// Thin wrapper around Google's Routes API: turns two points into a real
// road-following path (as {latitude, longitude} points) plus distance/duration.

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

export class DirectionsError extends Error {}

export type Coord = { lat: number; lng: number };

export type DrivingRoute = {
  path: { latitude: number; longitude: number }[];
  distanceMeters: number;
  durationSeconds: number;
};

// Decodes Google's polyline encoding (5 decimal places) into plain lat/lng points.
// This is the same compact string format used across Google's mapping APIs.
function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

export async function getDrivingRoute(origin: Coord, destination: Coord): Promise<DrivingRoute> {
  if (!API_KEY) {
    throw new DirectionsError('Routing is not set up yet: the Places API key is missing from .env.local.');
  }

  let res: Response;
  try {
    res = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        // Only these fields, so the response stays small and cheap.
        'X-Goog-FieldMask': 'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        // DRIVE is the closest match to how a trotro moves along the road network.
        travelMode: 'DRIVE',
        polylineQuality: 'OVERVIEW',
      }),
    });
  } catch {
    throw new DirectionsError("Couldn't reach Google. Check your internet connection.");
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message ?? '';
    } catch {
      // no JSON body
    }
    console.warn('[Directions]', res.status, detail);
    throw new DirectionsError('Could not calculate a route. Please try again.');
  }

  const data = (await res.json()) as {
    routes?: { polyline?: { encodedPolyline?: string }; distanceMeters?: number; duration?: string }[];
  };
  const route = data.routes?.[0];
  const encoded = route?.polyline?.encodedPolyline;
  if (!route || !encoded) {
    throw new DirectionsError('No route found between those two points.');
  }

  return {
    path: decodePolyline(encoded),
    distanceMeters: route.distanceMeters ?? 0,
    // Google returns duration as a string like "1234s".
    durationSeconds: route.duration ? parseInt(route.duration, 10) : 0,
  };
}

// ---------------------------------------------------------------------------
// Walking directions (last stretch from the final trotro stop to the door, and
// walks between two stops when changing trotro).
// ---------------------------------------------------------------------------

export type WalkingStep = { instruction: string; meters: number };

export type WalkingRoute = {
  path: { latitude: number; longitude: number }[];
  distanceMeters: number;
  durationSeconds: number;
  /** "Head north on Liberation Rd", "Turn left onto …" — the streets to pass. */
  steps: WalkingStep[];
  /** True when this is only a straight line (offline, no key, or Google refused). */
  approximate: boolean;
};

const walkCache = new Map<string, WalkingRoute>();

const straightLine = (a: Coord, b: Coord, meters: number): WalkingRoute => ({
  path: [
    { latitude: a.lat, longitude: a.lng },
    { latitude: b.lat, longitude: b.lng },
  ],
  distanceMeters: meters,
  durationSeconds: 0,
  steps: [],
  approximate: true,
});

/**
 * Walking route with turn-by-turn steps. Never throws: if Google can't be reached the
 * caller gets a straight line flagged `approximate`, so the screen still has something
 * to draw and can fall back to "head north-east for 300 m".
 */
export async function getWalkingRoute(origin: Coord, destination: Coord, straightMeters: number): Promise<WalkingRoute> {
  const key = `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}>${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`;
  const cached = walkCache.get(key);
  if (cached) return cached;
  if (!API_KEY) return straightLine(origin, destination, straightMeters);

  try {
    const res = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask':
          'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration,' +
          'routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: 'WALK',
        languageCode: 'en',
      }),
    });
    if (!res.ok) return straightLine(origin, destination, straightMeters);

    const data = (await res.json()) as {
      routes?: {
        polyline?: { encodedPolyline?: string };
        distanceMeters?: number;
        duration?: string;
        legs?: { steps?: { navigationInstruction?: { instructions?: string }; distanceMeters?: number }[] }[];
      }[];
    };
    const route = data.routes?.[0];
    const encoded = route?.polyline?.encodedPolyline;
    if (!route || !encoded) return straightLine(origin, destination, straightMeters);

    const steps: WalkingStep[] = (route.legs?.[0]?.steps ?? [])
      .filter((s) => s.navigationInstruction?.instructions)
      .map((s) => ({ instruction: s.navigationInstruction?.instructions as string, meters: s.distanceMeters ?? 0 }));

    const result: WalkingRoute = {
      path: decodePolyline(encoded),
      distanceMeters: route.distanceMeters ?? straightMeters,
      durationSeconds: route.duration ? parseInt(route.duration, 10) : 0,
      steps,
      approximate: false,
    };
    walkCache.set(key, result);
    return result;
  } catch {
    return straightLine(origin, destination, straightMeters);
  }
}
