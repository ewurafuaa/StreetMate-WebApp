import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import type { LatLng } from '@/utils/geo';

export type LivePositionStatus = 'waiting' | 'live' | 'denied' | 'unavailable' | 'demo';

type Options = {
  /** Watch the phone's GPS. Set false to pause. */
  enabled?: boolean;
  /** When set, replays this track instead of reading GPS (demo mode). */
  demoTrack?: LatLng[] | null;
  /** How often the demo track advances, in ms. */
  demoIntervalMs?: number;
};

// Streams the rider's position while a journey is active. In demo mode it replays a
// synthetic track at the same cadence so the same code path drives the screen.
export function useLivePosition({ enabled = true, demoTrack = null, demoIntervalMs = 700 }: Options = {}) {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [status, setStatus] = useState<LivePositionStatus>('waiting');
  const demoIndex = useRef(0);

  // Demo replay
  useEffect(() => {
    if (!demoTrack || demoTrack.length === 0) return;
    demoIndex.current = 0;
    const timer = setInterval(() => {
      const i = Math.min(demoIndex.current, demoTrack.length - 1);
      setPosition(demoTrack[i]);
      setSpeed(null);
      setStatus('demo');
      demoIndex.current = i + 1;
      if (i >= demoTrack.length - 1) clearInterval(timer);
    }, demoIntervalMs);
    return () => clearInterval(timer);
  }, [demoTrack, demoIntervalMs]);

  // Real GPS
  useEffect(() => {
    if (!enabled || demoTrack) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (permission.status !== 'granted') {
          setStatus('denied');
          return;
        }
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 8 },
          (fix) => {
            if (cancelled) return;
            setPosition({ lat: fix.coords.latitude, lng: fix.coords.longitude });
            setSpeed(fix.coords.speed != null && fix.coords.speed >= 0 ? fix.coords.speed : null);
            setStatus('live');
          }
        );
        if (cancelled) subscription.remove();
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled, demoTrack]);

  return { position, speed, status };
}
