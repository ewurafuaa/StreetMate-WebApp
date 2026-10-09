// Drop-in replacement for TouchableOpacity that also gives a tiny "press in" scale and
// springs back on release. Every tappable row, card and button in the app uses it, so
// the whole app responds to touch the same way.

import { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Motion } from '@/constants/motion';

export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type LayoutAnimationProps = {
  entering?: React.ComponentProps<typeof Animated.View>['entering'];
  exiting?: React.ComponentProps<typeof Animated.View>['exiting'];
  layout?: React.ComponentProps<typeof Animated.View>['layout'];
};

export type TouchableProps = Omit<PressableProps, 'style' | 'children'> &
  LayoutAnimationProps & {
    style?: StyleProp<ViewStyle>;
    children?: ReactNode;
    /** Opacity while pressed (same meaning as TouchableOpacity). 1 = no dimming. */
    activeOpacity?: number;
    /** Scale while pressed. Defaults to a subtle 0.98; 1 = no shrink. */
    pressScale?: number;
  };

/** Shared press progress (0 → 1) plus the handlers that drive it. */
export function usePressProgress(onPressIn?: PressableProps['onPressIn'], onPressOut?: PressableProps['onPressOut']) {
  const progress = useSharedValue(0);
  return {
    progress,
    onPressIn: ((e) => {
      progress.value = withTiming(1, { duration: Motion.duration.press, easing: Motion.easeOut });
      onPressIn?.(e);
    }) as NonNullable<PressableProps['onPressIn']>,
    onPressOut: ((e) => {
      progress.value = withSpring(0, Motion.spring.press);
      onPressOut?.(e);
    }) as NonNullable<PressableProps['onPressOut']>,
  };
}

export function Touchable({
  activeOpacity = 0.7,
  pressScale,
  style,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: TouchableProps) {
  // A fully opaque "touchable" (e.g. a dimmed backdrop you tap to close) should not shrink either.
  const scaleTo = pressScale ?? (activeOpacity >= 1 ? 1 : 0.98);
  const press = usePressProgress(onPressIn, onPressOut);

  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(press.progress.value, [0, 1], [1, activeOpacity]),
    transform: [{ scale: interpolate(press.progress.value, [0, 1], [1, scaleTo]) }],
  }));

  return (
    <AnimatedPressable {...rest} onPressIn={press.onPressIn} onPressOut={press.onPressOut} style={[style, animated]}>
      {children}
    </AnimatedPressable>
  );
}
