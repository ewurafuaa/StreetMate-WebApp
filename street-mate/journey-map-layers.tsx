import { Text as RNText, TextProps } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Motion } from '@/constants/motion';

type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

// Helvetica Now Display ships in assets/fonts and is the closest match to Uber's own
// type. Headlines use bold, buttons and emphasis use medium, body copy uses regular.
export const FONT_FILES = {
  HelveticaNow_Regular: require('@/assets/fonts/HelveticaNowDisplay-Regular.otf'),
  HelveticaNow_Medium: require('@/assets/fonts/HelveticaNowDisplay-Medium.otf'),
  HelveticaNow_Bold: require('@/assets/fonts/HelveticaNowDisplay-Bold.otf'),
};

const fontMap: Record<Weight, string> = {
  regular: 'HelveticaNow_Regular',
  medium: 'HelveticaNow_Medium',
  semibold: 'HelveticaNow_Bold',
  bold: 'HelveticaNow_Bold',
};

type AppTextProps = TextProps & {
  weight?: Weight;
};

export function AppText({ style, weight = 'regular', ...props }: AppTextProps) {
  return <RNText style={[{ fontFamily: fontMap[weight] }, style]} {...props} />;
}

/** Text whose colour glides to its new value (e.g. a chip or tab turning active). */
export function ColorText({
  color,
  style,
  weight = 'regular',
  ...props
}: AppTextProps & { color: string }) {
  const animated = useAnimatedStyle(() => ({
    color: withTiming(color, { duration: Motion.duration.base, easing: Motion.easeOut }),
  }));
  return <Animated.Text style={[{ fontFamily: fontMap[weight] }, style, animated]} {...props} />;
}
