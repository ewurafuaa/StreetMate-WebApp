// Draws a planned journey on a react-native-maps <MapView>:
//   • trotro rides   — solid black line through every stop of the ride
//   • walks          — dashed black line (real footpath once directions have loaded)
//   • stops          — small dots; boarding/alighting stops are larger
// Used by both the planner (whole journey) and the live journey screen (active leg emphasised).

import { Polyline } from 'react-native-maps';
import { StopMarker } from '@/components/stop-marker';
import { Palette } from '@/constants/theme';
import type { Journey, Leg } from '@/utils/journey-planner';

type Coord = { latitude: number; longitude: number };
const toCoord = (p: { lat: number; lng: number }): Coord => ({ latitude: p.lat, longitude: p.lng });

type Props = {
  journey: Journey;
  /** Live screen: index of the leg in progress. Others are drawn faint. */
  activeLegIndex?: number | null;
  /** Live screen: stops of the active ride that are already behind the rider. */
  passedIdx?: number;
  /** Live screen: the next stop of the active ride. */
  nextIdx?: number;
  /** Real footpaths, keyed by `walk-<legIndex>` or `last-mile`. */
  walkPaths?: Record<string, Coord[]>;
  /** Show the last-mile line + destination marker. */
  showLastMile?: boolean;
};

const FAINT = '#c4c4c4';

export function JourneyMapLayers({ journey, activeLegIndex = null, passedIdx = -1, nextIdx = -1, walkPaths = {}, showLastMile = true }: Props) {
  const live = activeLegIndex !== null;
  const isFaint = (i: number) => live && i !== activeLegIndex;

  const legPath = (leg: Leg, i: number): Coord[] => {
    if (leg.kind === 'ride') return leg.stops.map(toCoord);
    return walkPaths[`walk-${i}`] ?? [toCoord(leg.from), toCoord(leg.to)];
  };

  const lastMilePath: Coord[] | null = journey.lastMile
    ? walkPaths['last-mile'] ?? [toCoord(journey.lastMile.from), toCoord(journey.lastMile.to)]
    : null;

  return (
    <>
      {journey.legs.map((leg, i) => (
        <Polyline
          key={`line-${i}`}
          coordinates={legPath(leg, i)}
          strokeColor={isFaint(i) ? FAINT : Palette.Black}
          strokeWidth={leg.kind === 'ride' ? 5 : 3}
          lineDashPattern={leg.kind === 'walk' ? [2, 7] : undefined}
          lineCap="round"
          lineJoin="round"
        />
      ))}

      {showLastMile && lastMilePath && (
        <Polyline
          coordinates={lastMilePath}
          strokeColor={live && activeLegIndex !== journey.legs.length ? FAINT : Palette.Black}
          strokeWidth={3}
          lineDashPattern={[2, 7]}
          lineCap="round"
        />
      )}

      {journey.legs.map((leg, i) => {
        if (leg.kind !== 'ride') return null;
        const faint = isFaint(i);
        const isActive = live && i === activeLegIndex;
        const last = leg.stops.length - 1;
        return leg.stops.map((stop, s) => {
          const isEnd = s === 0 || s === last;
          // Intermediate stops: only draw on the selected/active ride to keep the map calm.
          if (!isEnd && faint) return null;
          let kind: 'stop' | 'passed' | 'next' | 'board' | 'alight' = 'stop';
          if (s === 0) kind = 'board';
          else if (s === last) kind = 'alight';
          else if (isActive && s <= passedIdx) kind = 'passed';
          else if (isActive && s === nextIdx) kind = 'next';
          return (
            <StopMarker
              key={`stop-${i}-${stop.id}-${s}`}
              coordinate={toCoord(stop)}
              kind={kind}
              title={stop.name}
              // Stops pop in one after another along the ride, in travel order.
              enterDelay={120 + Math.min(s, 24) * 22}
            />
          );
        });
      })}

      <StopMarker coordinate={toCoord(journey.origin)} kind="origin" title={journey.origin.name} />
      <StopMarker coordinate={toCoord(journey.destination)} kind="destination" title={journey.destination.name} />
    </>
  );
}

/** Every coordinate of a journey, for fitToCoordinates. */
export function journeyCoordinates(journey: Journey): Coord[] {
  const out: Coord[] = [toCoord(journey.origin), toCoord(journey.destination)];
  for (const leg of journey.legs) {
    if (leg.kind === 'ride') out.push(...leg.stops.map(toCoord));
    else out.push(toCoord(leg.from), toCoord(leg.to));
  }
  if (journey.lastMile) out.push(toCoord(journey.lastMile.from));
  return out;
}
