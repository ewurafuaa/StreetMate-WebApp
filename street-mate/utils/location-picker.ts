// Bridges the "set location on map" flow back to whichever screen requested it.
// The requesting screen registers a handler before navigating; set-location calls
// deliverLocation on confirm, then pops back. Using router.back() rather than
// pushing params onto a fresh screen keeps the requester mounted, so its other
// fields keep whatever the user already entered.

export type PickedPoint = { lat: number; lng: number };
type LocationHandler = (value: string, point?: PickedPoint) => void;

let pendingHandler: LocationHandler | null = null;

export function requestLocation(handler: LocationHandler) {
  pendingHandler = handler;
}

export function deliverLocation(value: string, point?: PickedPoint) {
  const handler = pendingHandler;
  pendingHandler = null;
  handler?.(value, point);
}

export function cancelLocationRequest() {
  pendingHandler = null;
}

export function hasPendingLocationRequest() {
  return pendingHandler !== null;
}
