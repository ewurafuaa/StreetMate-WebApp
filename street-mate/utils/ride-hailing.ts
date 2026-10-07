// Hand-off to ride-hailing apps for the last mile (stop → destination).
//
// What is verified vs best-effort:
//  • Uber   — pickup/dropoff deep link is documented (developer.uber.com/docs/deep-linking).
//  • Yango  — Yango's partner documentation publishes a `yango.go.link/route` link with
//             start/end coordinates and a web fallback; that is what is used here.
//  • Bolt   — Bolt publishes no public pickup/dropoff link, so this opens the Bolt app (or
//             Bolt's site if it isn't installed). The rider types the destination themselves.
//
// Each provider tries its URLs in order until one opens, so a missing app degrades to the
// web page instead of failing. Edit the builders below if a provider changes its format.

import { Linking, Platform } from 'react-native';
import type { Waypoint } from '@/utils/journey-planner';

export type RideProviderKey = 'uber' | 'yango' | 'bolt';

export type RideProvider = {
  key: RideProviderKey;
  name: string;
  logo: number; // require() asset id
  /** True when the destination is pre-filled in the app. */
  prefills: boolean;
  urls: (pickup: Waypoint, dropoff: Waypoint) => string[];
};

const enc = encodeURIComponent;

export const RIDE_PROVIDERS: RideProvider[] = [
  {
    key: 'uber',
    name: 'Uber',
    logo: require('@/assets/images/icons/uber-logo.jpg'),
    prefills: true,
    urls: (p, d) => {
      const query =
        `action=setPickup` +
        `&pickup%5Blatitude%5D=${p.lat}&pickup%5Blongitude%5D=${p.lng}&pickup%5Bnickname%5D=${enc(p.name)}` +
        `&dropoff%5Blatitude%5D=${d.lat}&dropoff%5Blongitude%5D=${d.lng}&dropoff%5Bnickname%5D=${enc(d.name)}`;
      return [`uber://?${query}`, `https://m.uber.com/ul/?${query}`];
    },
  },
  {
    key: 'yango',
    name: 'Yango',
    logo: require('@/assets/images/icons/yango-logo.jpg'),
    prefills: true,
    urls: (p, d) => {
      const fallback = `https://yango.com/en_int/order/?gfrom=${p.lng},${p.lat}&gto=${d.lng},${d.lat}`;
      return [
        `https://yango.go.link/route?start-lat=${p.lat}&start-lon=${p.lng}&end-lat=${d.lat}&end-lon=${d.lng}` +
          `&adj_deeplink_js=1&adj_fallback=${enc(fallback)}`,
        fallback,
      ];
    },
  },
  {
    key: 'bolt',
    name: 'Bolt',
    logo: require('@/assets/images/icons/bolt-logo.png'),
    prefills: false,
    urls: () => ['bolt://', 'https://bolt.eu/en-gh/'],
  },
];

/** Opens the provider with the first URL the phone can handle. Returns false if none worked. */
export async function openRideProvider(provider: RideProvider, pickup: Waypoint, dropoff: Waypoint): Promise<boolean> {
  // A browser can't open app schemes like uber:// or bolt://, so on web only the https links are tried.
  const urls = provider.urls(pickup, dropoff).filter((u) => Platform.OS !== 'web' || u.startsWith('http'));
  for (const url of urls) {
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank', 'noopener');
        return true;
      }
      await Linking.openURL(url);
      return true;
    } catch {
      // Not installed / not handled — try the next URL.
    }
  }
  return false;
}
