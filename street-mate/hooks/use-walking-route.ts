import { useEffect, useState } from 'react';
import { getWalkingRoute, type WalkingRoute } from '@/utils/directions';
import { haversineMeters } from '@/utils/geo';
import type { Waypoint } from '@/utils/journey-planner';

// Fetches walking directions between two points (cached per pair). While loading, or if
// Google is unreachable, `route` is a straight-line fallback flagged `approximate`.
export function useWalkingRoute(from: Waypoint | null, to: Waypoint | null) {
  const [state, setState] = useState<{ key: string; route: WalkingRoute } | null>(null);

  const key = from && to ? `${from.lat},${from.lng}>${to.lat},${to.lng}` : '';

  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    getWalkingRoute(
      { lat: from.lat, lng: from.lng },
      { lat: to.lat, lng: to.lng },
      haversineMeters(from, to)
    ).then((route) => {
      if (!cancelled) setState({ key, route });
    });
    return () => {
      cancelled = true;
    };
    // `key` captures every coordinate that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const ready = state && state.key === key ? state.route : null;
  return { route: ready, loading: !!key && !ready };
}
