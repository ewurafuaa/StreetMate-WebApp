import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

// Works like useState, but the value is saved on the device and restored on the next visit.
// On the web it lives in the browser's storage; in the Android app, in the phone's storage.
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  // Load the saved value once, when the app starts.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          setValue(JSON.parse(raw) as T);
        } catch {
          // unreadable data: keep the starting value
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Save every change, but only after loading, so the empty starting value never overwrites saved data.
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
  }, [key, value, loaded]);

  return [value, setValue] as const;
}