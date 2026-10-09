// The step-by-step plan for a journey: walk → trotro → (walk) → trotro → …
// Every trotro ride can be opened to list ALL the stops it passes between boarding and
// getting off, so the rider can recognise the road as they go.

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Touchable } from '@/components/touchable';
import { AppText as Text } from '@/components/app-text';
import { Chevron, IconBadge } from '@/components/ui';
import { Motion, staggerDelay } from '@/constants/motion';
import { Palette } from '@/constants/theme';
import { formatMeters, formatMinutes } from '@/utils/geo';
import { formatFare, type Journey, type Leg } from '@/utils/journey-planner';

const stopWord = (n: number) => (n === 1 ? 'stop' : 'stops');

function WalkRow({ leg, isLast }: { leg: Extract<Leg, { kind: 'walk' }>; isLast: boolean }) {
  const isTransfer = leg.role === 'transfer';
  return (
    <Animated.View layout={LinearTransition.duration(Motion.duration.base).easing(Motion.easeOut)} style={styles.row}>
      <View style={styles.rail}>
        <IconBadge name="walk" size={36} />
        {!isLast && <View style={styles.railLine} />}
      </View>
      <View style={styles.body}>
        <Text weight="medium" style={styles.title}>
          {isTransfer ? 'Change trotro' : 'Walk'} · {formatMeters(leg.meters)}
        </Text>
        <Text style={styles.sub}>
          {formatMinutes(leg.minutes)} to {leg.to.name}
          {isTransfer ? ' stop' : ''}
        </Text>
      </View>
    </Animated.View>
  );
}

function RideRow({
  leg,
  isLast,
  isTransfer,
  continuesToRide,
}: {
  leg: Extract<Leg, { kind: 'ride' }>;
  isLast: boolean;
  /** Not the first trotro: the rider is changing here. */
  isTransfer: boolean;
  /** Another trotro follows this one: the rider changes at the last stop. */
  continuesToRide: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hops = leg.stops.length - 1;
  const between = leg.stops.slice(1, -1);

  return (
    <Animated.View layout={LinearTransition.duration(Motion.duration.base).easing(Motion.easeOut)} style={styles.row}>
      <View style={styles.rail}>
        <IconBadge name="bus" size={36} dark />
        {!isLast && <View style={styles.railLine} />}
      </View>

      <View style={styles.body}>
        <Text weight="bold" style={styles.title}>
          Take the “{leg.trotroName}” trotro
        </Text>
        <Text style={styles.sub}>
          ~{formatMinutes(leg.minutes)} · {formatFare(leg.fare)} · {hops} {stopWord(hops)}
        </Text>
        <Text style={styles.hint}>Listen for the mate calling “{leg.trotroName}!”</Text>

        {/* Stop timeline: the middle stops unfold one after another, and the rows below slide down. */}
        <Animated.View layout={LinearTransition.duration(Motion.duration.base).easing(Motion.easeOut)} style={styles.stops}>
          <StopLine name={leg.stops[0].name} label={isTransfer ? 'Change trotro here' : 'Board here'} filled />
          {open ? (
            between.map((s, i) => (
              <Animated.View
                key={`${s.id}-${i}`}
                entering={FadeInDown.delay(staggerDelay(i, 22)).duration(Motion.duration.base).easing(Motion.easeOut)}
                exiting={FadeOut.duration(Motion.duration.fast)}>
                <StopLine name={s.name} />
              </Animated.View>
            ))
          ) : (
            between.length > 0 && (
              <Touchable
                style={styles.toggle}
                onPress={() => setOpen(true)}
                activeOpacity={0.7}
                entering={FadeIn.duration(Motion.duration.base)}
                exiting={FadeOut.duration(Motion.duration.fast)}>
                <Chevron open={false} />
                <Text weight="medium" style={styles.toggleText}>
                  Show {between.length} {stopWord(between.length)} on the way
                </Text>
              </Touchable>
            )
          )}
          <StopLine name={leg.stops[leg.stops.length - 1].name} label={continuesToRide ? 'Get off and change' : 'Get off here'} filled last />
          {open && between.length > 0 && (
            <Touchable
              style={styles.toggle}
              onPress={() => setOpen(false)}
              activeOpacity={0.7}
              entering={FadeIn.duration(Motion.duration.base)}
              exiting={FadeOut.duration(Motion.duration.fast)}>
              <Chevron open />
              <Text weight="medium" style={styles.toggleText}>Hide stops</Text>
            </Touchable>
          )}
        </Animated.View>

        {leg.alsoServing.length > 0 && (
          <Text style={styles.also} numberOfLines={2}>
            Also works: {leg.alsoServing.join(', ')}
          </Text>
        )}
      </View>
    </Animated.View>
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
        <Text weight={filled ? 'medium' : 'regular'} style={styles.stopName} numberOfLines={1}>
          {name}
        </Text>
        {label && <Text style={styles.stopLabel}>{label}</Text>}
      </View>
    </View>
  );
}

export function LegTimeline({ journey }: { journey: Journey }) {
  let rideNumber = 0;
  return (
    <View>
      {journey.legs.map((leg, i) => {
        const isLast = i === journey.legs.length - 1 && !journey.lastMile;
        if (leg.kind === 'walk') return <WalkRow key={`w-${i}`} leg={leg} isLast={isLast} />;
        const isTransfer = rideNumber > 0;
        rideNumber += 1;
        const continuesToRide = journey.legs.slice(i + 1).some((l) => l.kind === 'ride');
        return <RideRow key={`r-${i}`} leg={leg} isLast={isLast} isTransfer={isTransfer} continuesToRide={continuesToRide} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14 },
  rail: { alignItems: 'center', width: 36 },
  railLine: { width: 2, flex: 1, backgroundColor: Palette.LightGray, marginVertical: 4, minHeight: 16 },
  body: { flex: 1, paddingBottom: 22 },
  title: { fontSize: 16, color: Palette.Black, lineHeight: 22 },
  sub: { fontSize: 14, color: Palette.DarkGray, marginTop: 2 },
  hint: { fontSize: 13, color: Palette.DarkGray, marginTop: 6 },
  also: { fontSize: 13, color: Palette.DarkGray, marginTop: 10 },
  stops: { marginTop: 14, paddingLeft: 2 },
  stopRow: { flexDirection: 'row', gap: 12 },
  stopRail: { alignItems: 'center', width: 14 },
  stopDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: Palette.Black, backgroundColor: Palette.White, marginTop: 5 },
  stopDotFilled: { width: 14, height: 14, borderRadius: 7, backgroundColor: Palette.Black, marginTop: 3 },
  stopLine: { width: 2, flex: 1, backgroundColor: Palette.Black, minHeight: 14 },
  stopText: { flex: 1, paddingBottom: 12 },
  stopName: { fontSize: 15, color: Palette.Black },
  stopLabel: { fontSize: 12, color: Palette.DarkGray, marginTop: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 26, paddingBottom: 12, paddingTop: 2 },
  toggleText: { fontSize: 14, color: Palette.Black },
});
