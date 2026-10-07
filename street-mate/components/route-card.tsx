// One route option on the planner. Deliberately short: how long, how much, which trotros, and a
// hint of effort (transfers, walking). Everything else lives on the Trip Overview screen, which
// opens when the card is tapped.

import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text } from '@/components/app-text';
import { Icon } from '@/components/ui';
import { Palette, Radius } from '@/constants/theme';
import { formatMeters, formatMinutes } from '@/utils/geo';
import { formatFare, type Journey } from '@/utils/journey-planner';

/** Total metres on foot: to the first stop, between stops, and from the last stop to the door. */
export function totalWalkMeters(journey: Journey): number {
  let m = journey.lastMile?.meters ?? 0;
  for (const leg of journey.legs) if (leg.kind === 'walk') m += leg.meters;
  return m;
}

/** "Fastest", "Cheapest" and "Direct" are worked out here so one route can carry several. */
export function routeBadges(journey: Journey, all: Journey[]): string[] {
  const badges: string[] = [];
  const fastest = Math.min(...all.map((j) => j.minutes));
  const cheapest = Math.min(...all.map((j) => j.fare.low + j.fare.high));
  if (journey.minutes === fastest) badges.push('Fastest');
  if (all.length > 1 && journey.fare.low + journey.fare.high === cheapest) badges.push('Cheapest');
  if (journey.rideCount === 1) badges.push('Direct');
  return badges.slice(0, 3);
}

function trotroNames(journey: Journey): string[] {
  return journey.legs.flatMap((leg) => (leg.kind === 'ride' ? [leg.trotroName] : []));
}

export function RouteCard({
  journey,
  badges,
  featured,
  onPress,
}: {
  journey: Journey;
  badges: string[];
  featured?: boolean;
  onPress: () => void;
}) {
  const names = trotroNames(journey);
  const walk = totalWalkMeters(journey);
  const trotroWord = journey.rideCount === 1 ? 'trotro' : 'trotros';
  const meta = [
    `${journey.rideCount} ${trotroWord}`,
    journey.transfers > 0 ? `${journey.transfers} ${journey.transfers === 1 ? 'change' : 'changes'}` : null,
    walk >= 50 ? `${formatMeters(walk)} walk` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${formatMinutes(journey.minutes)}, ${formatFare(journey.fare)}. Open trip overview`}
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.card, featured && styles.cardFeatured]}>
      {badges.length > 0 && (
        <View style={styles.badges}>
          {badges.map((b, i) => (
            <View key={b} style={[styles.badge, featured && i === 0 && styles.badgeDark]}>
              <Text weight="medium" style={[styles.badgeText, featured && i === 0 && { color: Palette.White }]}>{b}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.top}>
        <Text weight="bold" style={[styles.time, featured && styles.timeFeatured]}>{formatMinutes(journey.minutes)}</Text>
        <Text weight="bold" style={[styles.fare, featured && styles.fareFeatured]} numberOfLines={1}>{formatFare(journey.fare)}</Text>
      </View>

      {/* Trotros to take. Long names shorten with an ellipsis instead of pushing off the card. */}
      <View style={styles.chain}>
        {names.map((name, i) => (
          <View key={`${name}-${i}`} style={styles.chainItem}>
            {i > 0 && <Icon name="chevron-forward" size={14} color={Palette.Placeholder} />}
            <View style={styles.pill}>
              <Icon name="bus" size={14} />
              <Text weight="medium" numberOfLines={1} style={styles.pillText}>{name}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.bottom}>
        <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
        <View style={styles.go}>
          <Icon name="arrow-forward" size={16} color={Palette.White} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Palette.LightGray,
    backgroundColor: Palette.White,
    padding: 16,
    marginBottom: 10,
  },
  cardFeatured: { borderWidth: 2, borderColor: Palette.Black, padding: 18 },

  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  badge: { backgroundColor: Palette.Soft, borderRadius: Radius.pill, paddingHorizontal: 10, height: 24, justifyContent: 'center' },
  badgeDark: { backgroundColor: Palette.Black },
  badgeText: { fontSize: 12, color: Palette.Black },

  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  time: { fontSize: 22, lineHeight: 28, color: Palette.Black },
  timeFeatured: { fontSize: 30, lineHeight: 36 },
  fare: { fontSize: 17, color: Palette.Black, flexShrink: 1 },
  fareFeatured: { fontSize: 19 },

  chain: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 12 },
  chainItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: Palette.Soft,
    maxWidth: 190,
  },
  pillText: { fontSize: 14, color: Palette.Black, flexShrink: 1 },

  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14 },
  meta: { flex: 1, fontSize: 13, color: Palette.DarkGray },
  go: { width: 32, height: 32, borderRadius: 16, backgroundColor: Palette.Black, alignItems: 'center', justifyContent: 'center' },
});
