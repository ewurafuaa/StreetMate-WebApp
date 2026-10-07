// Trip planner. Shows the best trotro route for origin → destination first (the fastest and
// cheapest), with the other options one tap away under "All routes". Each route is a short card;
// tapping it opens the Trip Overview screen with every detail (stops, walks, last stretch).

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { JourneyMapLayers, journeyCoordinates } from '@/components/journey-map-layers';
import { RouteCard, routeBadges } from '@/components/route-card';
import { Icon, IconButton, PillButton } from '@/components/ui';
import { STREETMATE_MAP_STYLE } from '@/constants/map-style';
import { Palette, Radius, Shadow } from '@/constants/theme';
import { useTripHistory } from '@/contexts/trip-history';
import { CURRENT_LOCATION } from '@/data/stops';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useWalkingRoute } from '@/hooks/use-walking-route';
import { setActiveJourney, setPreviewJourney } from '@/utils/journey-store';
import type { Journey, PlanResult } from '@/utils/journey-planner';
import { MAP_PROVIDER } from '@/utils/map-provider';
import { planJourneys } from '@/utils/plan-journey';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SNAPS = [SCREEN_HEIGHT * 0.3, SCREEN_HEIGHT * 0.56, SCREEN_HEIGHT * 0.88];
type Tab = 'best' | 'all';

const toPoint = (lat?: string, lng?: string) => {
  const la = Number(lat);
  const ln = Number(lng);
  if (!lat || !lng || Number.isNaN(la) || Number.isNaN(ln)) return null;
  return { lat: la, lng: ln };
};

const EMPTY_MESSAGES: Record<PlanResult['reason'], { title: string; body: string }> = {
  ok: { title: '', body: '' },
  'origin-far': {
    title: 'No trotro stops near you',
    body: 'We have no mapped stops within a short walk of your starting point. Try a starting point on a main road.',
  },
  'destination-far': {
    title: 'No trotro stops near that place',
    body: 'We have no mapped stops close to this destination yet. Try a nearby junction or landmark.',
  },
  'no-route': {
    title: 'No trotro route found',
    body: 'We could not connect these two places with the routes we have. Know one? Add it in Route Hub.',
  },
};

export default function PlannerScreen() {
  const insets = useSafeAreaInsets();
  const { addTrip } = useTripHistory();
  const params = useLocalSearchParams<{
    origin?: string;
    destination?: string;
    destLat?: string;
    destLng?: string;
    originLat?: string;
    originLng?: string;
  }>();

  // Start from the origin the rider chose; with none (e.g. "Get there" on a saved place) use their GPS.
  const { coords, status: locationStatus } = useCurrentLocation();
  const paramOrigin = toPoint(params.originLat, params.originLng);
  const originPoint = paramOrigin ?? coords ?? { lat: CURRENT_LOCATION.lat, lng: CURRENT_LOCATION.lng };
  const originReady = !!paramOrigin || locationStatus !== 'loading';
  const destPoint = toPoint(params.destLat, params.destLng);
  const originName = params.origin ?? 'Current location';
  const destName = params.destination ?? 'Destination';

  const mapRef = useRef<MapView>(null);

  // --- Planning (deferred one tick so the screen paints first) ---
  const [result, setResult] = useState<PlanResult | null>(null);
  useEffect(() => {
    if (!destPoint || !originReady) return;
    const timer = setTimeout(() => {
      setResult(
        planJourneys({ name: originName, ...originPoint }, { name: destName, ...destPoint })
      );
    }, 40);
    return () => clearTimeout(timer);
    // Params are stable for this screen's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.destLat, params.destLng, params.originLat, params.originLng, originReady]);

  const journeys = useMemo(() => result?.journeys ?? [], [result]);
  const [tab, setTab] = useState<Tab>('best');

  // The planner already ranks by time (with a small penalty per change), so the first one is the
  // best: the fastest, and cheapest where it can be both.
  const best: Journey | null = journeys[0] ?? null;
  const others = journeys.slice(1);

  // Real footpath for the last stretch of the best route, so the map line follows streets.
  const lastMile = best?.lastMile ?? null;
  const { route: walkRoute } = useWalkingRoute(lastMile?.from ?? null, lastMile?.to ?? null);
  const walkPaths = useMemo(
    () => (walkRoute && !walkRoute.approximate ? { 'last-mile': walkRoute.path } : {}),
    [walkRoute]
  );

  // --- Sheet (drag between three heights) ---
  const [sheetHeight] = useState(() => new Animated.Value(SNAPS[1]));
  const sheetValue = useRef(SNAPS[1]);
  const dragStart = useRef(SNAPS[1]);
  useEffect(() => {
    const id = sheetHeight.addListener(({ value }) => {
      sheetValue.current = value;
    });
    return () => sheetHeight.removeListener(id);
  }, [sheetHeight]);

  const snapTo = (h: number) =>
    Animated.spring(sheetHeight, { toValue: h, useNativeDriver: false, friction: 9, tension: 70 }).start();

  const [panResponder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = sheetValue.current;
      },
      onPanResponderMove: (_, g) => {
        const next = Math.min(SNAPS[2], Math.max(SNAPS[0], dragStart.current - g.dy));
        sheetHeight.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const projected = sheetValue.current - g.vy * 120;
        const nearest = SNAPS.reduce((a, b) => (Math.abs(b - projected) < Math.abs(a - projected) ? b : a));
        snapTo(nearest);
      },
    })
  );

  // Frame the selected journey above the sheet.
  useEffect(() => {
    if (!best) return;
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(journeyCoordinates(best), {
        edgePadding: { top: insets.top + 140, right: 50, bottom: SNAPS[1] + 30, left: 50 },
        animated: true,
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [best, insets.top]);

  const openOverview = (journey: Journey) => {
    setPreviewJourney(journey);
    router.push({ pathname: '/trip-overview', params: { origin: originName, destination: destName } });
  };

  const startJourney = () => {
    if (!best) return;
    setActiveJourney(best);
    addTrip(best);
    router.push({ pathname: '/journey', params: { origin: originName, destination: destName } });
  };

  const loading = destPoint !== null && result === null;
  const empty = result && result.journeys.length === 0 ? EMPTY_MESSAGES[result.reason] : null;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={MAP_PROVIDER}
        customMapStyle={STREETMATE_MAP_STYLE}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: originPoint.lat,
          longitude: originPoint.lng,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}>
        {best && <JourneyMapLayers journey={best} walkPaths={walkPaths} />}
      </MapView>

      {/* Back + route card */}
      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <IconButton name="arrow-back" floating onPress={() => router.back()} accessibilityLabel="Back" />
        <TouchableOpacity style={styles.routeCard} activeOpacity={0.9} onPress={() => router.back()}>
          <View style={styles.routeRail}>
            <View style={styles.routeDotOrigin} />
            <View style={styles.routeRailLine} />
            <View style={styles.routeDotDest} />
          </View>
          <View style={styles.routeText}>
            <Text numberOfLines={1} weight="medium" style={styles.routeFrom}>{originName}</Text>
            <Text numberOfLines={1} weight="medium" style={styles.routeTo}>{destName}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Bottom sheet */}
      <Animated.View style={[styles.sheet, { height: sheetHeight }]}>
        <View {...panResponder.panHandlers} style={styles.handleZone}>
          <View style={styles.handle} />
        </View>

        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator color={Palette.Black} />
            <Text weight="medium" style={styles.centeredText}>Finding trotros…</Text>
          </View>
        )}

        {!destPoint && (
          <View style={styles.centered}>
            <Text weight="bold" style={styles.emptyTitle}>Choose a destination</Text>
            <Text style={styles.emptyBody}>Go back and search for where you want to go.</Text>
          </View>
        )}

        {empty && (
          <View style={styles.centered}>
            <Icon name="bus-outline" size={36} color={Palette.Placeholder} />
            <Text weight="bold" style={styles.emptyTitle}>{empty.title}</Text>
            <Text style={styles.emptyBody}>{empty.body}</Text>
            <PillButton label="Route Hub" variant="subtle" small onPress={() => router.push('/route-hub')} style={{ marginTop: 14 }} />
          </View>
        )}

        {best && (
          <>
            {/* Best route | All routes */}
            <View style={styles.tabRow}>
              <View style={styles.tabs}>
                {(['best', 'all'] as const).map((t) => {
                  const active = tab === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      activeOpacity={0.8}
                      onPress={() => setTab(t)}
                      style={[styles.tab, active && styles.tabActive]}>
                      <Text weight="medium" style={[styles.tabText, active && styles.tabTextActive]}>
                        {t === 'best' ? 'Best route' : 'All routes'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.count}>{journeys.length} {journeys.length === 1 ? 'route' : 'routes'}</Text>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.scroll, { paddingBottom: (tab === 'best' ? 110 : 24) + insets.bottom }]}>
              <Text weight="bold" style={styles.sectionLabel}>Recommended</Text>
              <RouteCard journey={best} badges={routeBadges(best, journeys)} featured onPress={() => openOverview(best)} />

              {tab === 'best' && others.length > 0 && (
                <TouchableOpacity style={styles.moreLink} activeOpacity={0.7} onPress={() => setTab('all')}>
                  <Text weight="medium" style={styles.moreText}>
                    See {others.length} other {others.length === 1 ? 'route' : 'routes'}
                  </Text>
                  <Icon name="chevron-forward" size={16} />
                </TouchableOpacity>
              )}

              {tab === 'all' && others.length > 0 && (
                <>
                  <Text weight="bold" style={[styles.sectionLabel, { marginTop: 18 }]}>Other routes</Text>
                  {others.map((journey) => (
                    <RouteCard
                      key={journey.id}
                      journey={journey}
                      badges={routeBadges(journey, journeys)}
                      onPress={() => openOverview(journey)}
                    />
                  ))}
                </>
              )}
            </ScrollView>

            {tab === 'best' && (
              <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
                <PillButton label="Start journey" onPress={startJourney} />
              </View>
            )}
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.Soft },

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
  handleZone: { alignItems: 'center', paddingTop: 10, paddingBottom: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Palette.LightGray },
  scroll: { paddingHorizontal: 16 },

  tabRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14, gap: 12 },
  tabs: { flexDirection: 'row', backgroundColor: Palette.Soft, borderRadius: Radius.pill, padding: 4 },
  tab: { height: 36, paddingHorizontal: 16, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: Palette.Black },
  tabText: { fontSize: 14, color: Palette.DarkGray },
  tabTextActive: { color: Palette.White },
  count: { fontSize: 13, color: Palette.DarkGray },

  sectionLabel: { fontSize: 15, color: Palette.Black, marginBottom: 10, paddingHorizontal: 2 },
  moreLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44 },
  moreText: { fontSize: 15, color: Palette.Black },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Palette.White,
    borderTopWidth: 1,
    borderTopColor: Palette.Soft,
  },

  centered: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 24, gap: 10 },
  centeredText: { fontSize: 15, color: Palette.DarkGray },
  emptyTitle: { fontSize: 20, color: Palette.Black, textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 20, color: Palette.DarkGray, textAlign: 'center' },
});
