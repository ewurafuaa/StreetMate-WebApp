// Keeps items on screen for a moment after they leave the list, so they can animate out
// instead of vanishing. Used for map stops that scroll out of view while the rider pans.

import { useEffect, useState } from 'react';

export type PresenceEntry<T> = {
  item: T;
  /** True while the item is on its way out (render it with visible={false}). */
  leaving: boolean;
  /** 0, 1, 2… among the items that arrived together — handy for staggering their entrance. */
  order: number;
};

function merge<T extends { id: string }>(prev: PresenceEntry<T>[], items: T[]): PresenceEntry<T>[] {
  const incoming = new Map(items.map((item) => [item.id, item]));
  const known = new Set(prev.map((e) => e.item.id));
  const next: PresenceEntry<T>[] = [];

  for (const e of prev) {
    const current = incoming.get(e.item.id);
    next.push(current ? { item: current, leaving: false, order: e.order } : { ...e, leaving: true });
  }
  let arrived = 0;
  for (const item of items) {
    if (!known.has(item.id)) next.push({ item, leaving: false, order: arrived++ });
  }
  return next;
}

export function usePresence<T extends { id: string }>(items: T[], exitMs = 220): PresenceEntry<T>[] {
  const [entries, setEntries] = useState<PresenceEntry<T>[]>(() =>
    items.map((item, order) => ({ item, leaving: false, order }))
  );
  const [lastItems, setLastItems] = useState(items);

  // When the list changes, update the entries right here during render (React's recommended way
  // to derive state from a changing prop) rather than in an effect, so there is no extra render pass.
  if (items !== lastItems) {
    setLastItems(items);
    setEntries(merge(entries, items));
  }

  // Once something has been leaving for `exitMs`, drop it. The timer only starts from a callback.
  const leavingKey = entries
    .filter((e) => e.leaving)
    .map((e) => e.item.id)
    .join('|');
  useEffect(() => {
    if (!leavingKey) return;
    const timer = setTimeout(() => setEntries((prev) => prev.filter((e) => !e.leaving)), exitMs);
    return () => clearTimeout(timer);
  }, [leavingKey, exitMs]);

  return entries;
}