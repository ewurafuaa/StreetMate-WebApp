// The dot beside each stop in the live trip list. As the trotro moves, a stop goes
// upcoming → next → current → passed; the dot morphs between those looks (size, shape, colour)
// instead of switching to a different view.

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Motion } from '@/constants/motion';
import { Palette } from '@/constants/theme';

export type StopDotState = 'passed' | 'current' | 'next' | 'board' | 'alight' | 'upcoming';

type Look = { size: number; radius: number; borderWidth: number; fill: string; border: string };

const LOOK: Record<StopDotState, Look> = {
  upcoming: { size: 12, radius: 6, borderWidth: 2, fill: Palette.White, border: Palette.Black },
  board: { size: 12, radius: 6, borderWidth: 2, fill: Palette.Black, border: Palette.Black },
  current: { size: 12, radius: 6, borderWidth: 2, fill: Palette.Black, border: Palette.Black },
  passed: { size: 12, radius: 6, borderWidth: 2, fill: Palette.Placeholder, border: Palette.Placeholder },
  next: { size: 18, radius: 9, borderWidth: 4, fill: Palette.White, border: Palette.Black },
  alight: { size: 16, radius: 0, borderWidth: 0, fill: Palette.Black, border: Palette.Black },
};

export function StopDot({ state }: { state: StopDotState }) {
  const look = LOOK[state];
  const size = useSharedValue(look.size);
  const radius = useSharedValue(look.radius);
  const borderWidth = useSharedValue(look.borderWidth);
  const fill = useSharedValue(look.fill);
  const border = useSharedValue(look.border);

  useEffect(() => {
    const color = { duration: Motion.duration.base, easing: Motion.easeOut };
    size.value = withSpring(look.size, Motion.spring.marker);
    radius.value = withSpring(look.radius, Motion.spring.marker);
    borderWidth.value = withTiming(look.borderWidth, color);
    fill.value = withTiming(look.fill, color);
    border.value = withTiming(look.border, color);
  }, [look, size, radius, borderWidth, fill, border]);

  const dot = useAnimatedStyle(() => ({
    width: size.value,
    height: size.value,
    borderRadius: radius.value,
    borderWidth: borderWidth.value,
    backgroundColor: fill.value,
    borderColor: border.value,
  }));

  return (
    <View style={styles.box}>
      <Animated.View style={dot} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
});
