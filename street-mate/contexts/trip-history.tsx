import { createContext, ReactNode, useContext, useState } from 'react';
import type { Journey } from '@/utils/journey-planner';

// Trips the rider has actually started. Kept in memory for the session; swap the
// useState for AsyncStorage if you want history to survive an app restart.
export type TripRecord = {
  id: string;
  startedAt: number;
  origin: { name: string; lat: number; lng: number };
  destination: { name: string; lat: number; lng: number };
  minutes: number;
  fareLow: number;
  fareHigh: number;
  rideCount: number;
  trotros: string[];
};

type Ctx = {
  trips: TripRecord[];
  addTrip: (journey: Journey) => void;
  clearTrips: () => void;
};

const TripHistoryContext = createContext<Ctx | undefined>(undefined);

export function TripHistoryProvider({ children }: { children: ReactNode }) {
  const [trips, setTrips] = useState<TripRecord[]>([]);

  const addTrip = (journey: Journey) => {
    const record: TripRecord = {
      id: `${Date.now()}`,
      startedAt: Date.now(),
      origin: journey.origin,
      destination: journey.destination,
      minutes: journey.minutes,
      fareLow: journey.fare.low,
      fareHigh: journey.fare.high,
      rideCount: journey.rideCount,
      trotros: journey.legs.flatMap((l) => (l.kind === 'ride' ? [l.trotroName] : [])),
    };
    // Same origin → destination as the latest entry replaces it instead of piling up.
    setTrips((prev) =>
      [record, ...prev.filter((t) => !(t.origin.name === record.origin.name && t.destination.name === record.destination.name))].slice(0, 30)
    );
  };

  return (
    <TripHistoryContext.Provider value={{ trips, addTrip, clearTrips: () => setTrips([]) }}>
      {children}
    </TripHistoryContext.Provider>
  );
}

export function useTripHistory() {
  const ctx = useContext(TripHistoryContext);
  if (!ctx) throw new Error('useTripHistory must be used within TripHistoryProvider');
  return ctx;
}

export function formatTripDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}
