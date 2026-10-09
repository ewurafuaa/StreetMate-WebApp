// "How do I get from the last stop to the door?" — Walk or Ride.
//   Walk: turn-by-turn steps (which streets to pass), drawn as a dashed line on the map.
//   Ride: one-tap hand-off to Uber, Yango or Bolt with pickup = the stop, dropoff = destination.

import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Touchable } from '@/components/touchable';
import { AppText as Text } from '@/components/app-text';
import { Icon, IconBadge, PillButton } from '@/components/ui';
import { Palette, Radius } from '@/constants/theme';
import { stops as allStops } from '@/data/stops';
import { notify } from '@/utils/confirm';
import { landmarksAlongPath } from '@/utils/landmarks';
import type { WalkingRoute } from '@/utils/directions';
import { bearingDegrees, compassLabel, formatMeters, formatMinutes } from '@/utils/geo';
import type { LastMile } from '@/utils/journey-planner';
import { openRideProvider, RIDE_PROVIDERS } from '@/utils/ride-hailing';

export type LastMileMode = 'walk' | 'ride';

type Props = {
  lastMile: LastMile;
  mode: LastMileMode;
  onModeChange: (mode: LastMileMode) => void;
  route: WalkingRoute | null;
  loading: boolean;
};

export function LastMilePanel({ lastMile, mode, onModeChange, route, loading }: Props) {
  const [showAllSteps, setShowAllSteps] = useState(false);
  const meters = route && !route.approximate ? route.distanceMeters : lastMile.meters;
  const minutes =
    route && !route.approximate && route.durationSeconds > 0 ? route.durationSeconds / 60 : lastMile.walkMinutes;

  const steps = route?.steps ?? [];
  const visibleSteps = showAllSteps ? steps : steps.slice(0, 4);
  const heading = compassLabel(bearingDegrees(lastMile.from, lastMile.to));

  // Named stops/junctions beside the footpath — what the rider should see on the way.
  const landmarks = useMemo(
    () => (route && !route.approximate ? landmarksAlongPath(route.path, allStops, 5) : []),
    [route]
  );

  const openProvider = async (key: string) => {
    const provider = RIDE_PROVIDERS.find((p) => p.key === key);
    if (!provider) return;
    const ok = await openRideProvider(provider, lastMile.from, lastMile.to);
    if (!ok) notify(`Couldn't open ${provider.name}`, 'Make sure the app is installed, or try another one.');
  };

  return (
    <View>
      <Text weight="bold" style={styles.heading}>
        Last stretch to {lastMile.to.name}
      </Text>
      <Text style={styles.sub}>
        From {lastMile.from.name} · {formatMeters(lastMile.meters)} away
      </Text>

      {/* Walk | Ride */}
      <View style={styles.segment}>
        {(['walk', 'ride'] as const).map((m) => {
          const active = mode === m;
          return (
            <Touchable
              key={m}
              activeOpacity={0.8}
              onPress={() => onModeChange(m)}
              style={[styles.segmentItem, active && styles.segmentItemActive]}>
              <Icon name={m === 'walk' ? 'walk' : 'car'} size={18} color={active ? Palette.White : Palette.Black} />
              <Text weight="medium" style={[styles.segmentText, active && { color: Palette.White }]}>
                {m === 'walk' ? `Walk · ${formatMinutes(minutes)}` : 'Ride'}
              </Text>
            </Touchable>
          );
        })}
      </View>

      {mode === 'walk' ? (
        <View style={styles.block}>
          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Palette.Black} />
              <Text style={styles.sub}>Finding the best footpath…</Text>
            </View>
          )}

          {!loading && steps.length > 0 && (
            <>
              {landmarks.length > 0 && (
                <View style={styles.passBox}>
                  <Icon name="flag-outline" size={18} />
                  <View style={{ flex: 1 }}>
                    <Text weight="medium" style={styles.passTitle}>You&apos;ll pass</Text>
                    <Text style={styles.passText}>{landmarks.join('  ›  ')}</Text>
                  </View>
                </View>
              )}
              <Text weight="medium" style={styles.stepsTitle}>Walk this way</Text>
              {visibleSteps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text weight="bold" style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepText}>{step.instruction}</Text>
                    {step.meters > 0 && <Text style={styles.stepMeters}>{formatMeters(step.meters)}</Text>}
                  </View>
                </View>
              ))}
              {steps.length > 4 && (
                <Touchable onPress={() => setShowAllSteps((v) => !v)} style={styles.moreSteps}>
                  <Text weight="medium" style={styles.moreStepsText}>
                    {showAllSteps ? 'Show fewer steps' : `Show all ${steps.length} steps`}
                  </Text>
                </Touchable>
              )}
            </>
          )}

          {!loading && steps.length === 0 && (
            <View style={styles.fallback}>
              <IconBadge name="navigate" />
              <Text style={styles.fallbackText}>
                Head {heading} for about {formatMeters(meters)}. The dashed line on the map shows the direction to{' '}
                {lastMile.to.name}.
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.block}>
          <Text style={styles.sub}>
            Pickup at {lastMile.from.name}. Fares are set by each app — check the price before you confirm.
          </Text>
          {RIDE_PROVIDERS.map((provider) => (
            <Touchable
              key={provider.key}
              activeOpacity={0.7}
              onPress={() => openProvider(provider.key)}
              style={styles.providerRow}>
              <Image source={provider.logo} style={styles.providerLogo} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text weight="medium" style={styles.providerName}>{provider.name}</Text>
                <Text style={styles.providerSub}>
                  {provider.prefills ? 'Trip pre-filled for you' : `Opens ${provider.name} — enter “${lastMile.to.name}”`}
                </Text>
              </View>
              <PillButton label="Open" small variant="subtle" onPress={() => openProvider(provider.key)} />
            </Touchable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 20, lineHeight: 28, color: Palette.Black },
  sub: { fontSize: 14, color: Palette.DarkGray, marginTop: 2, lineHeight: 20 },
  segment: { flexDirection: 'row', gap: 8, marginTop: 16 },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: Radius.pill,
    backgroundColor: Palette.Soft,
  },
  segmentItemActive: { backgroundColor: Palette.Black },
  segmentText: { fontSize: 15, color: Palette.Black },
  block: { marginTop: 16 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  passBox: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: Palette.Soft, borderRadius: Radius.lg, padding: 12, marginBottom: 14 },
  passTitle: { fontSize: 14, color: Palette.Black },
  passText: { fontSize: 14, lineHeight: 20, color: Palette.DarkGray, marginTop: 1 },
  stepsTitle: { fontSize: 14, color: Palette.DarkGray, marginBottom: 10 },
  stepRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: Palette.Soft, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 12, color: Palette.Black },
  stepText: { fontSize: 15, lineHeight: 21, color: Palette.Black },
  stepMeters: { fontSize: 13, color: Palette.DarkGray, marginTop: 2 },
  moreSteps: { paddingVertical: 6 },
  moreStepsText: { fontSize: 14, color: Palette.Black, textDecorationLine: 'underline' },
  fallback: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: Palette.Soft, borderRadius: Radius.xl, padding: 16 },
  fallbackText: { flex: 1, fontSize: 14, lineHeight: 20, color: Palette.Black },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Palette.LightGray,
  },
  providerLogo: { width: 44, height: 44, borderRadius: 12 },
  providerName: { fontSize: 16, color: Palette.Black },
  providerSub: { fontSize: 13, color: Palette.DarkGray, marginTop: 1 },
});
