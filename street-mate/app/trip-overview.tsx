// Trip overview: everything about one route, opened by tapping a route card on the planner.
// A small map shows the route; below it each leg is laid out step by step (walks, each trotro with
// its stops, where to change), then the last stretch, a short summary and "Start journey".

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import MapView from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { JourneyMapLayers, journeyCoordinates } from '@/components/journey-map-layers';
import { LastMilePanel, type LastMileMode } from '@/components/last-mile-panel';
import { routeBadges, totalWalkMeters } from '@/components/route-card';
import { EmptyState, Icon, IconBadge, IconButton, PillButton } from '@/components/ui';
import { STREETMATE_MAP_STYLE } from '@/constants/map-style';
import { Palette, Radius, Shadow } from '@/constants/theme';
import { useTripHistory } from '@/contexts/trip-history';
import { useWalkingRoute } from '@/hooks/use-walking-route';
import { formatMeters, formatMinutes } from '@/utils/geo';
import { formatFare, type Leg } from '@/utils/journey-planner';
import { getPreviewJourney, setActiveJourney } from '@/utils/journey-store';
import { MAP_PROVIDER } from '@/utils/map-provider';

const MAP_HEIGHT = Dimensions.get('window').height * 0.32;
const stopWord = (n: number) => (n === 1 ? 'stop' : 'stops');

export default function TripOverviewScreen() {
  const insets = useSafeAreaInsets();
  const { addTrip } = useTripHistory();
  const params = useLocalSearchParams<{ origin?: string; destination?: string }>();
  const journey = getPreviewJourney();
  const mapRef = useRef<MapView>(null);

  const originName = params.origin ?? journey?.origin.name ?? 'Current location';
  const destName = params.destination ?? journey?.destination.name ?? 'Destination';

  // Last stretch: walk or ride, same behaviour as before, now living on this screen.
  const [mode, setMode] = useState<LastMileMode | null>(null);
  const lastMile = journey?.lastMile ?? null;
  const effectiveMode: LastMileMode = mode ?? (lastMile && lastMile.meters > 700 ? 'ride' : 'walk');
  const { route: walkRoute, loading: walkLoading } = useWalkingRoute(lastMile?.from ?? null, lastMile?.to ?? null);
  const walkPaths = useMemo(
    () => (walkRoute && !walkRoute.approximate ? { 'last-mile': walkRoute.path } : {}),
    [walkRoute]
  );

  useEffect(() => {
    if (!journey) return;
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(journeyCoordinates(journey), {
        edgePadding: { top: insets.top + 70, right: 40, bottom: 56, left: 40 },
        animated: true,
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [journey, insets.top]);

  if (!journey) {
    return (
      <View style={[styles.container, { backgroundColor: Palette.White, paddingTop: insets.top + 8 }]}>
        <View style={{ paddingHorizontal: 16 }}>
          <IconButton name="arrow-back" onPress={() => router.back()} accessibilityLabel="Back" />
        </View>
        <EmptyState icon="bus-outline" title="No trip to show" body="Go back and pick a route to see its details." actionLabel="Back to routes" onAction={() => router.back()} />
      </View>
    );
  }

  const startJourney = () => {
    setActiveJourney(journey);
    addTrip(journey);
    router.push({ pathname: '/journey', params: { origin: originName, destination: destName } });
  };

  const badges = routeBadges(journey, [journey]);
  let rideNumber = 0;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={MAP_PROVIDER}
        customMapStyle={STREETMATE_MAP_STYLE}
        style={styles.map}
        initialRegion={{ latitude: journey.origin.lat, longitude: journey.origin.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}>
        <JourneyMapLayers journey={journey} walkPaths={walkPaths} />
      </MapView>

      <View style={[styles.backWrap, { top: insets.top + 8 }]} pointerEvents="box-none">
        <IconButton name="arrow-back" floating onPress={() => router.back()} accessibilityLabel="Back" />
      </View>

      <View style={[styles.sheet, { top: MAP_HEIGHT - 28 }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}>
          <Text weight="bold" style={styles.title}>Trip overview</Text>

          {/* From → to. Each name keeps to one line and ends in an ellipsis if it is too long. */}
          <View style={styles.routeCard}>
            <View style={styles.rail}>
              <View style={styles.dotOrigin} />
              <View style={styles.railLine} />
              <View style={styles.dotDest} />
            </View>
            <View style={styles.routeText}>
              <Text numberOfLines={1} style={styles.routeFrom}>{originName}</Text>
              <Text numberOfLines={1} weight="medium" style={styles.routeTo}>{destName}</Text>
            </View>
          </View>

          {/* The three numbers that matter */}
          <View style={styles.stats}>
            <Stat icon="time-outline" label="Time" value={formatMinutes(journey.minutes)} />
            <View style={styles.statDivider} />
            <Stat icon="cash-outline" label="Fare" value={formatFare(journey.fare)} />
            <View style={styles.statDivider} />
            <Stat icon="bus-outline" label="Trotros" value={String(journey.rideCount)} />
          </View>

          {badges.length > 0 && (
            <View style={styles.badges}>
              {badges.map((b) => (
                <View key={b} style={styles.badge}>
                  <Text weight="medium" style={styles.badgeText}>{b}</Text>
                </View>
              ))}
            </View>
          )}

          <Text weight="bold" style={styles.sectionTitle}>Your trip</Text>

          {journey.legs.map((leg, i) => {
            if (leg.kind === 'walk') return <WalkRow key={`w-${i}`} leg={leg} />;
            rideNumber += 1;
            const continues = journey.legs.slice(i + 1).some((l) => l.kind === 'ride');
            return <RideCard key={`r-${i}`} leg={leg} number={rideNumber} isTransfer={rideNumber > 1} continues={continues} />;
          })}

          <Text weight="bold" style={styles.sectionTitle}>Last stretch</Text>
          {lastMile ? (
            <View style={styles.lastMileCard}>
              <LastMilePanel lastMile={lastMile} mode={effectiveMode} onModeChange={setMode} route={walkRoute} loading={walkLoading} />
            </View>
          ) : (
            <Text style={styles.arrive}>Your last stop is right at {destName}.</Text>
          )}

          {/* Summary */}
          <View style={styles.summary}>
            <Text weight="bold" style={styles.summaryTitle}>Trip summary</Text>
            <SummaryRow label="Trotros" value={String(journey.rideCount)} />
            <SummaryRow label="Changes" value={String(journey.transfers)} />
            <SummaryRow label="Estimated time" value={formatMinutes(journey.minutes)} />
            <SummaryRow label="Estimated fare" value={formatFare(journey.fare)} />
            <SummaryRow label="Walking" value={formatMeters(totalWalkMeters(journey))} />
          </View>

          <Text style={styles.disclaimer}>Times and fares are estimates. Trotro fares are negotiated and trotros leave when full.</Text>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <PillButton label="Start journey" onPress={startJourney} />
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------

function Stat({ icon, label, value }: { icon: 'time-outline' | 'cash-outline' | 'bus-outline'; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={18} color={Palette.DarkGray} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text weight="bold" style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text weight="medium" style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function WalkRow({ leg }: { leg: Extract<Leg, { kind: 'walk' }> }) {
  const isTransfer = leg.role === 'transfer';
  return (
    <View style={styles.walkRow}>
      <IconBadge name="walk" size={36} />
      <View style={{ flex: 1 }}>
        <Text weight="medium" style={styles.walkTitle} numberOfLines={1}>
          {isTransfer ? 'Walk to the next trotro' : 'Walk to the stop'} · {formatMeters(leg.meters)}
        </Text>
        <Text style={styles.walkSub} numberOfLines={1}>{formatMinutes(leg.minutes)} to {leg.to.name}</Text>
      </View>
    </View>
  );
}

function RideCard({ leg, number, isTransfer, continues }: { leg: Extract<Leg, { kind: 'ride' }>; number: number; isTransfer: boolean; continues: boolean }) {
  const [open, setOpen] = useState(false);
  const first = leg.stops[0];
  const last = leg.stops[leg.stops.length - 1];
  const between = leg.stops.slice(1, -1);
  const hops = leg.stops.length - 1;

  return (
    <View style={styles.ride}>
      <View style={styles.rideHeader}>
        <View style={styles.rideNumber}>
          <Text weight="bold" style={styles.rideNumberText}>{number}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text weight="bold" style={styles.rideTitle} numberOfLines={1}>Take the “{leg.trotroName}” trotro</Text>
          <Text style={styles.rideSub} numberOfLines={1}>{first.name} → {last.name}</Text>
        </View>
        <Icon name="bus" size={20} />
      </View>

      <View style={styles.rideBody}>
        <StopLine name={first.name} label={isTransfer ? 'Change trotro here' : 'Board here'} filled />

        {between.length > 0 && (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.7}
              onPress={() => setOpen((v) => !v)}
              style={styles.stopsToggle}>
              <View style={styles.stopRail}>
                <View style={styles.dotsLine} />
              </View>
              <Text weight="medium" style={styles.stopsToggleText}>
                {between.length} {stopWord(between.length)} on the way
              </Text>
              <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} />
            </TouchableOpacity>
            {open && between.map((s, i) => <StopLine key={`${s.id}-${i}`} name={s.name} />)}
          </>
        )}

        <StopLine name={last.name} label={continues ? 'Get off and change' : 'Get off here'} filled last />
      </View>

      <View style={styles.rideStats}>
        <Mini label="Est. time" value={formatMinutes(leg.minutes)} />
        <Mini label="Est. fare" value={formatFare(leg.fare)} />
        <Mini label="Stops" value={String(hops)} />
      </View>

      <Text style={styles.tip} numberOfLines={2}>
        Listen for the mate calling “{leg.trotroName}”.
        {leg.alsoServing.length > 0 ? ` Also works: ${leg.alsoServing.join(', ')}.` : ''}
      </Text>
    </View>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text weight="bold" style={styles.miniValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function StopLine({ name, label, filled, last }: { name: string; label?: string; filled?: boolean; last?: boolean }) {
  return (
    <View style={styles.stopRow}>
      <View style={styles.stopRail}>
        <View style={[styles.stopDot, filled && styles.stopDotFilled]} />
        {!last && <View style={styles.stopLine} />}
      </View>
      <View style={styles.stopText}>
        <Text weight={filled ? 'medium' : 'regular'} style={styles.stopName} numberOfLines={1}>{name}</Text>
        {label ? <Text style={styles.stopLabel}>{label}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.Soft },
  map: { position: 'absolute', top: 0, left: 0, right: 0, height: MAP_HEIGHT + 40 },
  backWrap: { position: 'absolute', left: 16 },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Palette.White,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    ...Shadow.card,
  },
  scroll: { paddingHorizontal: 16, paddingTop: 22 },
  title: { fontSize: 26, lineHeight: 32, color: Palette.Black, marginBottom: 14 },

  routeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Palette.Soft, borderRadius: Radius.xl, paddingVertical: 12, paddingHorizontal: 16 },
  rail: { alignItems: 'center', width: 12 },
  dotOrigin: { width: 10, height: 10, borderRadius: 5, backgroundColor: Palette.Black },
  railLine: { width: 2, height: 14, backgroundColor: Palette.Placeholder, marginVertical: 2 },
  dotDest: { width: 10, height: 10, backgroundColor: Palette.Black },
  routeText: { flex: 1, gap: 8 },
  routeFrom: { fontSize: 14, color: Palette.DarkGray },
  routeTo: { fontSize: 15, color: Palette.Black },

  stats: { flexDirection: 'row', alignItems: 'stretch', marginTop: 14, borderRadius: Radius.xl, borderWidth: 1, borderColor: Palette.LightGray, paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 6 },
  statLabel: { fontSize: 12, color: Palette.DarkGray },
  statValue: { fontSize: 17, color: Palette.Black },
  statDivider: { width: 1, backgroundColor: Palette.LightGray },

  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  badge: { backgroundColor: Palette.Soft, borderRadius: Radius.pill, paddingHorizontal: 12, height: 28, justifyContent: 'center' },
  badgeText: { fontSize: 13, color: Palette.Black },

  sectionTitle: { fontSize: 20, lineHeight: 26, color: Palette.Black, marginTop: 26, marginBottom: 12 },

  walkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4 },
  walkTitle: { fontSize: 15, color: Palette.Black },
  walkSub: { fontSize: 13, color: Palette.DarkGray, marginTop: 1 },

  ride: { borderRadius: Radius.xl, borderWidth: 1, borderColor: Palette.LightGray, overflow: 'hidden', marginVertical: 6 },
  rideHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Palette.Soft, paddingHorizontal: 14, paddingVertical: 12 },
  rideNumber: { width: 30, height: 30, borderRadius: 8, backgroundColor: Palette.Black, alignItems: 'center', justifyContent: 'center' },
  rideNumberText: { color: Palette.White, fontSize: 15 },
  rideTitle: { fontSize: 16, color: Palette.Black },
  rideSub: { fontSize: 13, color: Palette.DarkGray, marginTop: 1 },
  rideBody: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  rideStats: { flexDirection: 'row', gap: 12, marginHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Palette.Soft },
  miniLabel: { fontSize: 12, color: Palette.DarkGray },
  miniValue: { fontSize: 15, color: Palette.Black, marginTop: 2 },
  tip: { fontSize: 13, lineHeight: 18, color: Palette.DarkGray, paddingHorizontal: 16, paddingBottom: 14 },

  stopRow: { flexDirection: 'row', gap: 12 },
  stopRail: { alignItems: 'center', width: 14 },
  stopDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: Palette.Black, backgroundColor: Palette.White, marginTop: 5 },
  stopDotFilled: { width: 14, height: 14, borderRadius: 7, backgroundColor: Palette.Black, marginTop: 3 },
  stopLine: { width: 2, flex: 1, backgroundColor: Palette.Black, minHeight: 14 },
  stopText: { flex: 1, paddingBottom: 12 },
  stopName: { fontSize: 15, color: Palette.Black },
  stopLabel: { fontSize: 12, color: Palette.DarkGray, marginTop: 1 },
  stopsToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 },
  dotsLine: { width: 2, height: 40, backgroundColor: Palette.Placeholder },
  stopsToggleText: { flex: 1, fontSize: 14, color: Palette.DarkGray },

  lastMileCard: { borderRadius: Radius.xl, borderWidth: 1, borderColor: Palette.LightGray, padding: 16 },
  arrive: { fontSize: 14, color: Palette.DarkGray },

  summary: { marginTop: 26, borderRadius: Radius.xl, backgroundColor: Palette.Soft, padding: 18 },
  summaryTitle: { fontSize: 18, color: Palette.Black, marginBottom: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, gap: 12 },
  summaryLabel: { fontSize: 15, color: Palette.DarkGray },
  summaryValue: { fontSize: 15, color: Palette.Black, flexShrink: 1, textAlign: 'right' },

  disclaimer: { fontSize: 12, lineHeight: 17, color: Palette.Placeholder, marginTop: 18 },

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: Palette.White, borderTopWidth: 1, borderTopColor: Palette.Soft },
});
