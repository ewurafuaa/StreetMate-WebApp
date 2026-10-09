import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Touchable } from '@/components/touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { EmptyState, IconBadge, ScreenHeader } from '@/components/ui';
import { Palette } from '@/constants/theme';
import { formatTripDate, useTripHistory, type TripRecord } from '@/contexts/trip-history';
import { formatMinutes } from '@/utils/geo';

const fare = (t: TripRecord) => {
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return t.fareLow === t.fareHigh ? `GH¢ ${f(t.fareLow)}` : `GH¢ ${f(t.fareLow)}–${f(t.fareHigh)}`;
};

const DAY = 86400000;
const sectionOf = (ts: number) => {
  const age = Date.now() - ts;
  return age < DAY ? 'Today' : age < 7 * DAY ? 'This week' : 'Earlier';
};

export default function RecentTripsScreen() {
  const { trips, clearTrips } = useTripHistory();

  const repeat = (t: TripRecord) =>
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

  const sections = trips.reduce<{ title: string; items: TripRecord[] }[]>((acc, t) => {
    const title = sectionOf(t.startedAt);
    const found = acc.find((s) => s.title === title);
    if (found) found.items.push(t);
    else acc.push({ title, items: [t] });
    return acc;
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="Recent trips"
        onBack={() => router.back()}
        right={
          trips.length > 0 ? (
            <Touchable onPress={clearTrips} hitSlop={10}>
              <Text weight="medium" style={styles.clear}>Clear</Text>
            </Touchable>
          ) : undefined
        }
      />

      {trips.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title="No trips yet"
          body="Trips you start will show up here, so you can repeat them in one tap."
          actionLabel="Plan a trip"
          onAction={() => router.replace('/search')}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text weight="bold" style={styles.sectionTitle}>{section.title}</Text>
              {section.items.map((t, i) => (
                <Touchable
                  key={t.id}
                  activeOpacity={0.6}
                  style={[styles.row, i === section.items.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => repeat(t)}>
                  <IconBadge name="time-outline" />
                  <View style={{ flex: 1 }}>
                    <Text weight="medium" style={styles.title} numberOfLines={1}>{t.destination.name}</Text>
                    <Text style={styles.sub} numberOfLines={1}>From {t.origin.name}</Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {formatTripDate(t.startedAt)} · {formatMinutes(t.minutes)} · {fare(t)} · {t.rideCount} {t.rideCount === 1 ? 'trotro' : 'trotros'}
                    </Text>
                  </View>
                </Touchable>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.White },
  clear: { fontSize: 15, color: Palette.Black, textDecorationLine: 'underline' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  section: { marginTop: 8 },
  sectionTitle: { fontSize: 20, lineHeight: 28, color: Palette.Black, marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Palette.Soft },
  title: { fontSize: 16, lineHeight: 22, color: Palette.Black },
  sub: { fontSize: 14, lineHeight: 20, color: Palette.DarkGray },
});
