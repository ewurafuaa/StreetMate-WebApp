// Connects the pure planner (utils/journey-planner.ts) to the app's real dataset.
// The planner indexes ~2,800 stops and ~600 route-directions once, on first use.

import { routes } from '@/data/routes';
import { stops } from '@/data/stops';
import { createPlanner, type PlanResult, type Waypoint } from '@/utils/journey-planner';

let planner: ReturnType<typeof createPlanner> | null = null;

export function planJourneys(origin: Waypoint, destination: Waypoint): PlanResult {
  if (!planner) {
    planner = createPlanner(
      stops,
      routes.map((r) => ({
        id: r.id,
        routeId: r.routeId,
        ref: r.ref,
        name: r.name,
        headsign: r.headsign,
        stops: r.stops,
        source: r.source,
      }))
    );
  }
  return planner.plan(origin, destination);
}
