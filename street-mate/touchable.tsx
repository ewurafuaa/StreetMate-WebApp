import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Motion } from '@/constants/motion';
import { Palette } from '@/constants/theme';

export type StopMarkerKind = 'stop' | 'passed' | 'next' | 'board' | 'alight' | 'origin' | 'destination';

// Every kind is the same animated dot with different numbers, so changing kind (a stop becoming
// "next", then "passed") morphs smoothly in size, colour and shape instead of swapping views.
type Look = {
  size: number;
  fill: string;
  border: string;
  borderWidth: number;
  /** Corner radius as a fraction of size: 0.5 = circle, small = square. */
  round: number;
  /** Size of the small white centre mark (0 = none) and whether it is round. */
  core: number;
  coreRound: number;
};

const LOOK: Record<StopMarkerKind, Look> = {
  stop: { size: 10, fill: Palette.White, border: Palette.Black, borderWidth: 2, round: 0.5, core: 0, coreRound: 0.5 },
  passed: { size: 8, fill: Palette.Placeholder, border: Palette.Black, borderWidth: 2, round: 0.5, core: 0, coreRound: 0.5 },
  next: { size: 16, fill: Palette.Black, border: Palette.White, borderWidth: 3, round: 0.5, core: 0, coreRound: 0.5 },
  board: { size: 18, fill: Palette.Black, border: Palette.White, borderWidth: 3, round: 0.5, core: 6, coreRound: 0.5 },
  alight: { size: 18, fill: Palette.Black, border: Palette.White, borderWidth: 3, round: 0.5, core: 6, coreRound: 0.5 },
  origin: { size: 16, fill: Palette.White, border: Palette.Black, borderWidth: 5, round: 0.5, core: 0, coreRound: 0.5 },
  destination: { size: 18, fill: Palette.Black, border: Palette.White, borderWidth: 3, round: 0.17, core: 6, coreRound: 0 },
};

// Biggest dot (18) + padding, fixed so the native marker bitmap never changes size mid-animation.
const BOX = 26;

// Native map markers snapshot their view; they only redraw while tracksViewChanges is on.
// So it stays on while an animation plays (entrance, morph, exit) and then turns off,
// which keeps long stop lists cheap.
const TRACK_MS = 900;

export function StopMarker({
  coordinate,
  kind,
  title,
  onPress,
  visible = true,
  enterDelay = 0,
}: {
  coordinate: { latitude: number; longitude: number };
  kind: StopMarkerKind;
  title?: string;
  onPress?: () => void;
  /** Set to false to play the exit animation (the parent removes the marker afterwards). */
  visible?: boolean;
  /** Wait this many ms before popping in — used to ripple a group of stops along the map. */
  enterDelay?: number;
}) {
  const look = LOOK[kind];
  const [tracking, setTracking] = useState(true);

  // 0 = hidden, 1 = shown. Enter springs up with a slight overshoot; exit is a quick fade-shrink.
  const presence = useSharedValue(0);
  useEffect(() => {
    presence.value = visible
      ? withDelay(enterDelay, withSpring(1, Motion.spring.marker))
      : withTiming(0, { duration: Motion.duration.fast, easing: Motion.easeInOut });
    // enterDelay only matters for the first entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, presence]);

  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), TRACK_MS + enterDelay);
    return () => clearTimeout(timer);
    // enterDelay only matters for the first entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, visible]);

  // One shared value per property of the look; when `kind` changes each one animates to its
  // new target on the UI thread (the style callbacks below only read them, so nothing restarts).
  const size = useSharedValue(look.size);
  const radius = useSharedValue(look.size * look.round);
  const borderWidth = useSharedValue(look.borderWidth);
  const fill = useSharedValue(look.fill);
  const border = useSharedValue(look.border);
  const coreSize = useSharedValue(look.core);
  const coreRadius = useSharedValue(look.core * look.coreRound);

  useEffect(() => {
    const color = { duration: Motion.duration.base, easing: Motion.easeOut };
    size.value = withSpring(look.size, Motion.spring.marker);
    radius.value = withSpring(look.size * look.round, Motion.spring.marker);
    borderWidth.value = withTiming(look.borderWidth, color);
    fill.value = withTiming(look.fill, color);
    border.value = withTiming(look.border, color);
    coreSize.value = withSpring(look.core, Motion.spring.marker);
    coreRadius.value = withSpring(look.core * look.coreRound, Motion.spring.marker);
  }, [look, size, radius, borderWidth, fill, border, coreSize, coreRadius]);

  const dot = useAnimatedStyle(() => ({
    width: size.value,
    height: size.value,
    borderRadius: radius.value,
    borderWidth: borderWidth.value,
    backgroundColor: fill.value,
    borderColor: border.value,
    opacity: Math.min(1, Math.max(0, presence.value)),
    transform: [{ scale: Math.max(0, presence.value) }],
  }));

  const core = useAnimatedStyle(() => ({
    width: coreSize.value,
    height: coreSize.value,
    borderRadius: coreRadius.value,
  }));

  return (
    <Marker
      coordinate={coordinate}
      title={onPress ? undefined : title}
      onPress={onPress}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracking}
      zIndex={kind === 'stop' || kind === 'passed' ? 1 : 3}>
      <View style={styles.wrap}>
        <Animated.View style={[styles.dot, dot]}>
          <Animated.View style={[styles.core, core]} />
        </Animated.View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  wrap: { width: BOX, height: BOX, alignItems: 'center', justifyContent: 'center' },
  dot: { alignItems: 'center', justifyContent: 'center' },
  core: { backgroundColor: Palette.White },
});
