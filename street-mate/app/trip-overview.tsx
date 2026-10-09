// Trip overview: everything about one route, opened by tapping a route card on the planner.
// A small map shows the route; below it each leg is laid out step by step (walks, each trotro with
// its stops, where to change), then the last stretch, a short summary and "Start journey".

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated as RNAnimated, Dimensions, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Touchable } from '@/components/touchable';
import MapView from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { JourneyMapLayers, journeyCoordinates } from '@/components/journey-map-layers';
import { LastMilePanel, type LastMileMode } from '@/components/last-mile-panel';
import { routeBadges, totalWalkMeters } from '@/components/route-card';
import { EmptyState, Icon, IconBadge, IconButton, PillButton } from '@/components/ui';
import { STREETMATE_MAP_STYLE } from '@/constants/map-style';
import { Motion, staggerDelay } from '@/constants/motion';
import { Palette, Radius, Shadow } from '@/constants/theme';
import { useTripHistory } from '@/contexts/trip-history';
import { useWalkingRoute } from '@/hooks/use-walking-route';
import { formatMeters, formatMinutes } from '@/utils/geo';
import { formatFare, type Leg } from '@/utils/journey-planner';
import { getPreviewJourney, setActiveJourney } from '@/utils/journey-store';
import { MAP_PROVIDER } from '@/utils/map-provider';

const MAP_HEIGHT = Dimensions.get('window').height * 0.32;
const stopWord = (n: number) => (n === 1 ? 'stop' : 'stops');

// Same shape as the (unexported) Coord type in journey-map-layers.tsx.
type MapCoord = { latitude: number; longitude: number };

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
  // Built step by step (not with a `cond ? {...} : {}` ternary) so TypeScript sees exactly
  // Record<string, MapCoord[]> rather than a union with `{ 'last-mile'?: undefined }`.
  const walkPaths = useMemo(() => {
    const paths: Record<string, MapCoord[]> = {};
    if (walkRoute && !walkRoute.approximate) paths['last-mile'] = walkRoute.path;
    return paths;
  }, [walkRoute]);

  useEffect(() => {
    if (!journey) return;
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(journeyCoordinates(journey), {
        edgePadding: { top: insets.top + 100, right: 40, bottom: 56, left: 40 },
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

  // The search screen holds the editable From / To fields (with place search), so editing either
  // one takes the rider back there. It is still mounted underneath, so their entries are kept.
  const editTrip = () => router.dismissTo('/search');

  const startJourney = () => {
    setActiveJourney(journey);
    addTrip(journey);
    router.push({ pathname: '/journey', params: { origin: originName, destination: destName } });
  };

  const badges = routeBadges(journey, [journey]);

  // Running ride count for each leg, derived up front so nothing is reassigned during render.
  // For a ride leg, rideNumbers[i] is that ride's number (1, 2, 3...).
  const rideNumbers = journey.legs.reduce<number[]>((acc, leg, i) => {
    const prev = i === 0 ? 0 : acc[i - 1];
    acc.push(leg.kind === 'ride' ? prev + 1 : prev);
    return acc;
  }, []);

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

      {/* Back + route card, same as the map screen. Tap the card to change the trip. */}
      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <IconButton name="arrow-back" floating onPress={() => router.back()} accessibilityLabel="Back" />
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={`From ${originName} to ${destName}. Tap to change`}
          activeOpacity={0.9}
          pressScale={1}
          onPress={editTrip}
          style={styles.routeCard}>
          <View style={styles.routeRail}>
            <View style={styles.routeDotOrigin} />
            <View style={styles.routeRailLine} />
            <View style={styles.routeDotDest} />
          </View>
          <View style={styles.routeText}>
            <Text numberOfLines={1} weight="medium" style={styles.routeFrom}>{originName}</Text>
            <Text numberOfLines={1} weight="medium" style={styles.routeTo}>{destName}</Text>
          </View>
        </Touchable>
      </View>

      <View style={[styles.sheet, { top: MAP_HEIGHT - 28 }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}>
          <View style={[styles.titleRow, { marginBottom: journey.legs[0]?.kind === 'walk' ? 6 : 10 }]}>
            <Text weight="bold" style={styles.title}>Trip overview</Text>
            {badges.length > 0 && (
              <View style={styles.badges}>
                {badges.map((b) => (
                  <View key={b} style={styles.badge}>
                    <Text weight="medium" style={styles.badgeText}>{b}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {journey.legs.map((leg, i) => {
            if (leg.kind === 'walk') return <WalkRow key={`w-${i}`} leg={leg} />;
            return <RideCard key={`r-${i}`} leg={leg} number={rideNumbers[i]} />;
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
    <Animated.View layout={LinearTransition.duration(Motion.duration.base).easing(Motion.easeOut)} style={styles.walkRow}>
      <IconBadge name="walk" size={36} />
      <View style={{ flex: 1 }}>
        <Text weight="medium" style={styles.walkTitle} numberOfLines={1}>
          {isTransfer ? 'Walk to the next trotro' : 'Walk to the stop'} · {formatMeters(leg.meters)}
        </Text>
        <Text style={styles.walkSub} numberOfLines={1}>{formatMinutes(leg.minutes)} to {leg.to.name}</Text>
      </View>
    </Animated.View>
  );
}

function RideCard({ leg, number }: { leg: Extract<Leg, { kind: 'ride' }>; number: number }) {
  const [open, setOpen] = useState(false);
  const first = leg.stops[0];
  const last = leg.stops[leg.stops.length - 1];
  const between = leg.stops.slice(1, -1);
  const hops = leg.stops.length - 1;
  const [trotrosOpen, setTrotrosOpen] = useState(false);
  // Every trotro that can be taken for this stretch: the main one first, then the others that serve it.
  const trotros = Array.from(new Set([leg.trotroName, ...leg.alsoServing]));

  return (
    <Animated.View layout={LinearTransition.duration(Motion.duration.base).easing(Motion.easeOut)} style={styles.ride}>
      <View style={styles.rideHeader}>
        <View style={styles.rideNumber}>
          <Text weight="bold" style={styles.rideNumberText}>{number}</Text>
        </View>
        <Text weight="bold" style={styles.rideTitle} numberOfLines={1}>{first.name} → {last.name}</Text>
        <Touchable
          accessibilityRole="button"
          accessibilityLabel="Show available trotros"
          activeOpacity={0.6}
          pressScale={0.95}
          onPress={() => setTrotrosOpen(true)}
          style={styles.rideIconBox}>
          <Icon name="bus-outline" size={18} color={Palette.Black} />
        </Touchable>
      </View>

      <Animated.View layout={LinearTransition.duration(Motion.duration.base).easing(Motion.easeOut)} style={styles.rideBody}>
        <StopLine name={first.name} last={!open && between.length > 0} tight={!open && between.length > 0} />

        {between.length > 0 &&
          (open ? (
            // Opened: the stops on the way, in soft grey. Tap them to fold the list away again.
            <Touchable
              accessibilityRole="button"
              accessibilityLabel="Hide stops"
              activeOpacity={0.7}
              pressScale={1}
              onPress={() => setOpen(false)}>
              {between.map((s, i) => (
                <Animated.View
                  key={`${s.id}-${i}`}
                  entering={FadeInDown.delay(staggerDelay(i, 22)).duration(Motion.duration.base).easing(Motion.easeOut)}
                  exiting={FadeOut.duration(Motion.duration.fast)}>
                  <StopLine name={s.name} muted />
                </Animated.View>
              ))}
            </Touchable>
          ) : (
            // Folded: one quiet row with a dotted rail, "6 stops".
            <Touchable
              accessibilityRole="button"
              accessibilityLabel={`Show ${between.length} ${stopWord(between.length)} on the way`}
              activeOpacity={0.7}
              pressScale={1}
              onPress={() => setOpen(true)}
              style={styles.stopsToggle}>
              <View style={[styles.stopRail, styles.toggleRail]}>
                <View style={styles.toggleLine} />
                <View style={styles.railDots}>
                  <View style={styles.railDot} />
                  <View style={styles.railDot} />
                  <View style={styles.railDot} />
                </View>
              </View>
              <Text style={styles.stopsToggleText}>
                {between.length} {stopWord(between.length)}
              </Text>
            </Touchable>
          ))}

        <StopLine name={last.name} last />
      </Animated.View>

      <Animated.View layout={LinearTransition.duration(Motion.duration.base).easing(Motion.easeOut)} style={styles.rideStats}>
        <Mini label="Est. time" value={formatMinutes(leg.minutes)} />
        <Mini label="Est. fare" value={formatFare(leg.fare)} />
        <Mini label="Stops" value={String(hops)} />
      </Animated.View>

      {trotrosOpen && <TrotroSheet names={trotros} onClosed={() => setTrotrosOpen(false)} />}
    </Animated.View>
  );
}

// "Available Trotros": a card that slides up over a blurred screen. Tapping the blurred area (or the
// Android back button) slides it back down, and only then is it removed.
const SCREEN_HEIGHT = Dimensions.get('window').height;

function TrotroSheet({ names, onClosed }: { names: string[]; onClosed: () => void }) {
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new RNAnimated.Value(0));
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    RNAnimated.timing(progress, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [progress]);

  const close = () => {
    if (closing) return;
    setClosing(true);
    RNAnimated.timing(progress, { toValue: 0, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(onClosed);
  };

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_HEIGHT, 0] });

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={close}>
      <View style={styles.sheetRoot}>
        <RNAnimated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
        </RNAnimated.View>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />

        <RNAnimated.View style={[styles.trotroSheet, { paddingBottom: Math.max(insets.bottom, 12) + 16, transform: [{ translateY }] }]}>
          <Text weight="bold" style={styles.trotroSheetTitle}>Available Trotros</Text>
          {names.map((name) => (
            <View key={name} style={styles.trotroSheetRow}>
              <Icon name="bus-outline" size={16} color={Palette.DarkGray} />
              <Text style={styles.trotroSheetName} numberOfLines={1}>{name}</Text>
            </View>
          ))}
        </RNAnimated.View>
      </View>
    </Modal>
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

// One stop on the rail. The first and last stops are solid black dots with black names; stops
// "on the way" are small hollow grey dots with soft grey names.
function StopLine({ name, muted, last, tight }: { name: string; muted?: boolean; last?: boolean; tight?: boolean }) {
  return (
    <View style={styles.stopRow}>
      <View style={styles.stopRail}>
        <View style={muted ? styles.dotMuted : styles.dotEnd} />
        {!last && <View style={[styles.railSegment, muted ? styles.railGapMuted : styles.railGapEnd]} />}
      </View>
      <View style={[styles.stopText, tight && styles.stopTextTight]}>
        <Text style={[styles.stopName, muted && styles.stopNameMuted]} numberOfLines={1}>{name}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.Soft },
  map: { position: 'absolute', top: 0, left: 0, right: 0, height: MAP_HEIGHT + 40 },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  routeCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Palette.White,
    borderRadius: Radius.xl,
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...Shadow.float,
  },
  routeRail: { alignItems: 'center', width: 12 },
  routeDotOrigin: { width: 10, height: 10, borderRadius: 5, backgroundColor: Palette.Black },
  routeRailLine: { width: 2, height: 14, backgroundColor: Palette.LightGray, marginVertical: 2 },
  routeDotDest: { width: 10, height: 10, backgroundColor: Palette.Black },
  routeText: { flex: 1, gap: 8 },
  routeFrom: { fontSize: 14, color: Palette.DarkGray },
  routeTo: { fontSize: 15, color: Palette.Black },

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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 26, lineHeight: 32, color: Palette.Black, flexShrink: 1 },


  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 },
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
  rideTitle: { flex: 1, fontSize: 16, color: Palette.Black },
  rideIconBox: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: Palette.DarkGray, alignItems: 'center', justifyContent: 'center' },
  rideBody: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  rideStats: { flexDirection: 'row', gap: 12, marginHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Palette.Soft },
  miniLabel: { fontSize: 12, color: Palette.DarkGray },
  miniValue: { fontSize: 15, color: Palette.Black, marginTop: 2 },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  trotroSheet: { backgroundColor: Palette.White, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, paddingHorizontal: 20, paddingTop: 20, ...Shadow.card },
  trotroSheetTitle: { fontSize: 17, lineHeight: 24, color: Palette.Black, marginBottom: 10 },
  trotroSheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  trotroSheetName: { flex: 1, fontSize: 16, lineHeight: 22, color: Palette.Black },

  stopRow: { flexDirection: 'row', gap: 14 },
  stopRail: { alignItems: 'center', width: 14, alignSelf: 'stretch' },
  dotEnd: { width: 10, height: 10, borderRadius: 5, backgroundColor: Palette.Black, marginTop: 7 },
  dotMuted: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: '#C6C6C6', backgroundColor: Palette.White, marginTop: 8 },
  // Connector between two dots. Its top gap equals the dot's own top offset below, so the space
  // above and below the line is the same (7 for solid dots, 8 for hollow ones).
  railSegment: { width: 1.5, flex: 1, minHeight: 14, backgroundColor: '#DADADA' },
  railGapEnd: { marginTop: 7 },
  railGapMuted: { marginTop: 8 },
  // Folded "N stops" row: a full-height soft line runs behind the dots, and the dots sit in the
  // middle on a white patch so the line appears to break around them.
  toggleRail: { justifyContent: 'center' },
  toggleLine: { position: 'absolute', top: 0, bottom: 0, left: 6.25, width: 1.5, backgroundColor: '#DADADA' },
  railDots: { gap: 3, paddingVertical: 5, backgroundColor: Palette.White },
  railDot: { width: 2.5, height: 2.5, borderRadius: 1.25, backgroundColor: Palette.Placeholder },
  stopText: { flex: 1, paddingBottom: 14 },
  stopTextTight: { paddingBottom: 0 },
  stopName: { fontSize: 17, lineHeight: 24, color: Palette.Black },
  stopNameMuted: { color: '#C2C2C2' },
  stopsToggle: { flexDirection: 'row', gap: 14, minHeight: 44 },
  stopsToggleText: { flex: 1, fontSize: 14, lineHeight: 20, color: Palette.DarkGray, alignSelf: 'center' },

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