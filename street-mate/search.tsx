import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, ScrollView, StyleSheet, View } from 'react-native';
import { Touchable } from '@/components/touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { Sidebar } from '@/components/sidebar';
import { Chip, Icon, IconBadge, IconButton, ListRow, PillButton } from '@/components/ui';
import { Palette, Radius } from '@/constants/theme';
import { formatTripDate, useTripHistory, type TripRecord } from '@/contexts/trip-history';

const popularPlaces = ['Madina', 'Circle', 'Atomic Junction', 'Achimota', 'Kaneshie', 'Tema Station'];

const shortcuts = [
  { label: 'Recent trips', icon: 'time-outline', path: '/recent-trips' },
  { label: 'Saved places', icon: 'bookmark-outline', path: '/saved-places' },
  { label: 'Find a stop', icon: 'location-outline', path: '/stops-map' },
] as const;

const HEADLINES = ["LET'S HIT THE STREETS!", 'YƐN KƆ!'];

// Swaps between the headlines every 5 seconds: the current one fades and slides up,
// then the next one slides up into place.
function RotatingHeadline() {
  const [index, setIndex] = useState(0);
  const [opacity] = useState(() => new Animated.Value(1));
  const [shift] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const timer = setInterval(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(shift, { toValue: -14, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        setIndex((i) => (i + 1) % HEADLINES.length);
        shift.setValue(14);
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(shift, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start();
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [opacity, shift]);

  return (
    <View style={styles.headlineWrap}>
      <Animated.View style={{ opacity, transform: [{ translateY: shift }] }}>
        <Text weight="bold" numberOfLines={1} adjustsFontSizeToFit style={styles.headline}>
          {HEADLINES[index]}
        </Text>
      </Animated.View>
    </View>
  );
}

export default function HomeScreen() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { trips } = useTripHistory();

  const repeatTrip = (t: TripRecord) =>
    router.push({
      pathname: '/map',
      params: {
        origin: t.origin.name,
        originLat: String(t.origin.lat),
        originLng: String(t.origin.lng),
        destination: t.destination.name,
        destLat: String(t.destination.lat),
        destLng: String(t.destination.lng),
      },
    });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <IconButton name="menu" onPress={() => setSidebarOpen(true)} accessibilityLabel="Open menu" />
        <Image source={require('@/assets/images/streetmate-logo.png')} style={styles.logo} contentFit="contain" />
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <RotatingHeadline/>

        {/* The one thing to do on this screen */}
        <Touchable style={styles.search} activeOpacity={0.8} onPress={() => router.push('/search')}>
          <Icon name="search" size={22} />
          <Text weight="medium" style={styles.searchText}>Where to?</Text>
        </Touchable>

        <View style={styles.tiles}>
          {shortcuts.map((s) => (
            <Touchable key={s.label} style={styles.tile} activeOpacity={0.7} onPress={() => router.push(s.path)}>
              <Icon name={s.icon} size={24} />
              <Text weight="medium" style={styles.tileLabel}>{s.label}</Text>
            </Touchable>
          ))}
        </View>

        {trips.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text weight="bold" style={styles.sectionTitle}>Recent</Text>
              <Touchable onPress={() => router.push('/recent-trips')}>
                <Text weight="medium" style={styles.link}>See all</Text>
              </Touchable>
            </View>
            {trips.slice(0, 3).map((t, i, arr) => (
              <ListRow
                key={t.id}
                icon="time-outline"
                title={t.destination.name}
                subtitle={`From ${t.origin.name} · ${formatTripDate(t.startedAt)}`}
                onPress={() => repeatTrip(t)}
                noDivider={i === arr.length - 1}
              />
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text weight="bold" style={styles.sectionTitle}>Popular places</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {popularPlaces.map((place) => (
              <Chip key={place} label={place} icon="location-outline" onPress={() => router.push({ pathname: '/search', params: { q: place } })} />
            ))}
          </ScrollView>
        </View>

        {/* Black promo band, as on Uber */}
        <View style={styles.promoDark}>
          <Image source={require('@/assets/images/route-hub.png')} style={styles.promoImage} contentFit="cover" />
          <Text weight="bold" style={styles.promoDarkTitle}>Know a route we missed?</Text>
          <Text style={styles.promoDarkBody}>Add it, or ask for one. Every route you share helps the next rider.</Text>
          <PillButton label="Open Route Hub" variant="secondary" onPress={() => router.push('/route-hub')} style={styles.promoButton} />
        </View>

        <Touchable style={styles.promoLight} activeOpacity={0.9} onPress={() => router.push('/tips')}>
          <Image source={require('@/assets/images/trotro-tips.png')} style={styles.promoImage} contentFit="cover" />
          <View style={styles.promoLightRow}>
            <View style={{ flex: 1 }}>
              <Text weight="bold" style={styles.promoLightTitle}>New to trotros?</Text>
              <Text style={styles.promoLightBody}>A few tips for a smoother ride.</Text>
            </View>
            <IconBadge name="arrow-forward" dark />
          </View>
        </Touchable>
      </ScrollView>

      <Sidebar visible={sidebarOpen} onClose={() => setSidebarOpen(false)} activeKey="home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.White },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  logo: { width: 140, height: 28 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  headline: { fontSize: 28, lineHeight: 44, color: Palette.Black },
  headlineWrap: { height: 44, marginTop: 12, justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 56,
    borderRadius: Radius.pill,
    paddingHorizontal: 20,
    backgroundColor: Palette.Soft,
    marginTop: 16,
  },
  searchText: { fontSize: 18, color: Palette.Black },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 14 },
  tile: { flex: 1, height: 88, borderRadius: Radius.xl, backgroundColor: Palette.Soft, padding: 14, justifyContent: 'space-between' },
  tileLabel: { fontSize: 14, lineHeight: 18, color: Palette.Black },
  section: { marginTop: 28 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 20, lineHeight: 28, color: Palette.Black, marginBottom: 6 },
  link: { fontSize: 14, color: Palette.Black, textDecorationLine: 'underline' },
  chips: { gap: 8, paddingTop: 8, paddingRight: 16 },
  promoDark: { backgroundColor: Palette.Black, borderRadius: Radius.xl, padding: 24, marginTop: 32 },
  promoImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.lg },
  promoDarkTitle: { fontSize: 24, lineHeight: 32, color: Palette.White, marginTop: 20 },
  promoDarkBody: { fontSize: 15, lineHeight: 22, color: Palette.LightGray, marginTop: 6 },
  promoButton: { marginTop: 20, alignSelf: 'flex-start', paddingHorizontal: 24 },
  promoLight: { backgroundColor: Palette.White, borderRadius: Radius.xl, padding: 24, marginTop: 16, borderWidth: 1, borderColor: Palette.LightGray },
  promoLightRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 20 },
  promoLightTitle: { fontSize: 24, lineHeight: 32, color: Palette.Black },
  promoLightBody: { fontSize: 15, lineHeight: 22, color: Palette.DarkGray, marginTop: 2 },
});
