import { useEffect, useState } from 'react';
import type { Journey } from '@/utils/journey-planner';
import { applyLiveTraffic } from '@/utils/traffic';

// Shows the planner's estimate straight away, then swaps in live-traffic times when Google
// answers. If Google can't be reached the estimates simply stay.
export function useLiveTimes(planned: Journey[]): Journey[] {
  const [live, setLive] = useState<{ key: string; journeys: Journey[] } | null>(null);
  const key = planned.map((j) => j.id).join('|');

  useEffect(() => {
    if (planned.length === 0) return;
    let cancelled = false;
    applyLiveTraffic(planned).then((journeys) => {
      if (!cancelled && journeys) setLive({ key, journeys });
    });
    return () => {
      cancelled = true;
    };
    // `key` identifies exactly which journeys are being timed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return live && live.key === key ? live.journeys : planned;
}
