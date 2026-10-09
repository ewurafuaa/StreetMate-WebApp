import { useCallback, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import Animated, { FadeIn, LinearTransition, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { StopMarker } from '@/components/stop-marker';
import { IconButton, PillButton } from '@/components/ui';
import { STREETMATE_MAP_STYLE } from '@/constants/map-style';
import { Motion } from '@/constants/motion';
import { Palette, Radius, Shadow } from '@/constants/theme';
import { routesForStop } from '@/data/routes';
import { CURRENT_LOCATION, stopsInRegion, type MergedStop } from '@/data/stops';
import { usePresence } from '@/hooks/use-presence';
import { MAP_PROVIDER } from '@/utils/map-provider';

// Each Marker is a native view, so the full dataset cannot be rendered at once.
const MAX_VISIBLE_STOPS = 120;

const INITIAL_REGION: Region = {
  latitude: CURRENT_LOCATION.lat,
  longitude: CURRENT_LOCATION.lng,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export default function StopsMapScreen() {
  const insets = useSafeAreaInsets();
  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [selected, setSelected] = useState<MergedStop | null>(null);
  const mapRef = useRef<MapView>(null);
  const visibleStops = useMemo(() => stopsInRegion(region, MAX_VISIBLE_STOPS), [region]);

  // Stops that scroll out of view shrink away instead of vanishing; new ones pop in as a quick ripple.
  const shownStops = usePresence(visibleStops, 220);

  // Tapping a stop glides the map so the stop sits above the info card.
  const selectStop = useCallback(
    (stop: MergedStop) => {
      setSelected(stop);
      mapRef.current?.animateToRegion(
        {
          latitude: stop.lat - region.latitudeDelta * 0.18,
          longitude: stop.lng,
          latitudeDelta: region.latitudeDelta,
          longitudeDelta: region.longitudeDelta,
        },
        350
      );
    },
    [region]
  );

  // Which trotros call at the tapped stop: the name the mate shouts for each direction.
  const trotros = useMemo(() => {
    if (!selected) return [];
    const names = new Set<string>();
    // A merged marker stands for the stop on both sides of the road, so gather routes from each.
    for (const id of selected.ids) {
      for (const r of routesForStop(id)) names.add(r.headsign ?? r.to ?? r.name);
    }
    return Array.from(names).slice(0, 12);
  }, [selected]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={MAP_PROVIDER}
        customMapStyle={STREETMATE_MAP_STYLE}
        style={StyleSheet.absoluteFill}
        initialRegion={INITIAL_REGION}
        onRegionChangeComplete={setRegion}
        onPress={() => setSelected(null)}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}>
        {shownStops.map(({ item: stop, leaving, order }) => (
          <StopMarker
            key={stop.id}
            coordinate={{ latitude: stop.lat, longitude: stop.lng }}
            kind={selected?.id === stop.id ? 'next' : 'stop'}
            visible={!leaving}
            enterDelay={Math.min(order, 30) * 10}
            onPress={() => selectStop(stop)}
          />
        ))}
      </MapView>

      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <IconButton name="arrow-back" floating onPress={() => router.back()} accessibilityLabel="Back" />
        <View style={styles.pill}>
          <Text weight="medium" style={styles.pillText}>{visibleStops.length} stops in view</Text>
        </View>
      </View>

      {selected ? (
        <Animated.View
          entering={SlideInDown.springify().damping(Motion.spring.panel.damping).stiffness(Motion.spring.panel.stiffness)}
          exiting={SlideOutDown.duration(Motion.duration.base).easing(Motion.easeInOut)}
          layout={LinearTransition.springify().damping(Motion.spring.panel.damping)}
          style={[styles.card, { bottom: Math.max(insets.bottom, 12) + 8 }]}>
          {/* Keyed by stop, so tapping another stop cross-fades the text while the card stays put. */}
          <Animated.View key={selected.id} entering={FadeIn.duration(Motion.duration.base)}>
            <Text weight="bold" style={styles.cardTitle} numberOfLines={1}>{selected.name}</Text>
            {trotros.length > 0 ? (
              <>
                <Text style={styles.cardSub}>Trotros calling here</Text>
                <Text weight="medium" style={styles.cardList}>{trotros.join(' · ')}</Text>
              </>
            ) : (
              <Text style={styles.cardSub}>No routes recorded for this stop yet.</Text>
            )}
            <PillButton
              label="Go here"
              small
              onPress={() =>
                router.push({
                  pathname: '/map',
                  params: { destination: selected.name, destLat: String(selected.lat), destLng: String(selected.lng) },
                })
              }
              style={{ alignSelf: 'flex-start', marginTop: 14, paddingHorizontal: 22 }}
            />
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.Soft },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pill: { height: 44, borderRadius: Radius.pill, backgroundColor: Palette.White, paddingHorizontal: 18, justifyContent: 'center', ...Shadow.float },
  pillText: { fontSize: 15, color: Palette.Black },
  card: { position: 'absolute', left: 16, right: 16, backgroundColor: Palette.White, borderRadius: Radius.xl, padding: 20, ...Shadow.card },
  cardTitle: { fontSize: 22, lineHeight: 28, color: Palette.Black },
  cardSub: { fontSize: 14, color: Palette.DarkGray, marginTop: 6 },
  cardList: { fontSize: 15, lineHeight: 21, color: Palette.Black, marginTop: 2 },
});
