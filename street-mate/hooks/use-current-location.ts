import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export type Coords = { lat: number; lng: number };
export type LocationStatus = 'loading' | 'granted' | 'denied' | 'unavailable';

// Asks for permission once, shows a quick last-known position if there is one,
// then upgrades to a fresh GPS fix.
export function useCurrentLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<LocationStatus>('loading');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (permission.status !== 'granted') {
          setStatus('denied');
          return;
        }

        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        if (cancelled) return;
        if (last) {
          setCoords({ lat: last.coords.latitude, lng: last.coords.longitude });
          setStatus('granted');
        }

        const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        setCoords({ lat: fresh.coords.latitude, lng: fresh.coords.longitude });
        setStatus('granted');
      } catch {
        if (!cancelled) setStatus((prev) => (prev === 'granted' ? prev : 'unavailable'));
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { coords, status };
}