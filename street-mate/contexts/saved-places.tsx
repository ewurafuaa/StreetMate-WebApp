import { createContext, useContext, ReactNode } from 'react';
import { usePersistentState } from '@/hooks/use-persistent-state';

export type SavedPlace = {
  id: string;
  label: string;
  address: string;
  icon: 'home' | 'work' | 'star';
  /** Present when the place was picked on the map, so it can be used as a destination. */
  lat?: number;
  lng?: number;
};

type SavedPlacesContextValue = {
  places: SavedPlace[];
  addPlace: (label: string, address: string, point?: { lat: number; lng: number }) => void;
  removePlace: (id: string) => void;
  updatePlace: (id: string, patch: Partial<Omit<SavedPlace, 'id'>>) => void;
};

const SavedPlacesContext = createContext<SavedPlacesContextValue | undefined>(undefined);

// Home and Work exist as slots with no address yet, so the UI prompts
// "Add Home" / "Add Work" until the user sets one.
const initialPlaces: SavedPlace[] = [
  { id: '1', label: 'Home', address: '', icon: 'home' },
  { id: '2', label: 'Work', address: '', icon: 'work' },
];

export function SavedPlacesProvider({ children }: { children: ReactNode }) {
  const [places, setPlaces] = usePersistentState<SavedPlace[]>('streetmate:saved-places', initialPlaces);

  const addPlace = (label: string, address: string, point?: { lat: number; lng: number }) => {
    setPlaces((prev) => [...prev, { id: Date.now().toString(), label, address, icon: 'star', lat: point?.lat, lng: point?.lng }]);
  };

  const removePlace = (id: string) => {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
  };

  const updatePlace = (id: string, patch: Partial<Omit<SavedPlace, 'id'>>) => {
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  return (
    <SavedPlacesContext.Provider value={{ places, addPlace, removePlace, updatePlace }}>
      {children}
    </SavedPlacesContext.Provider>
  );
}

export function useSavedPlaces() {
  const ctx = useContext(SavedPlacesContext);
  if (!ctx) throw new Error('useSavedPlaces must be used within SavedPlacesProvider');
  return ctx;
}
