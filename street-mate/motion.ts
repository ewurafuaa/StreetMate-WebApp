// Small Uber-style building blocks shared by every screen: pill buttons, grey chips,
// circular icon buttons and soft cards. Keeping them here is what keeps the app
// consistent — screens compose these instead of re-inventing borders and radii.

import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useEffect } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AppText as Text, ColorText } from '@/components/app-text';
import { AnimatedPressable, Touchable, usePressProgress } from '@/components/touchable';
import { Motion } from '@/constants/motion';
import { Palette, Radius, Shadow } from '@/constants/theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color = Palette.Black }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

/** Round grey (or white, floating) icon button — back, menu, close, locate. */
export function IconButton({
  name,
  onPress,
  size = 44,
  floating,
  dark,
  style,
  accessibilityLabel,
}: {
  name: IconName;
  onPress?: () => void;
  size?: number;
  floating?: boolean;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.7}
      pressScale={0.92}
      onPress={onPress}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: dark ? Palette.Black : floating ? Palette.White : 'transparent',
        },
        floating && Shadow.float,
        style,
      ]}>
      <Icon name={name} size={size * 0.5} color={dark ? Palette.White : Palette.Black} />
    </Touchable>
  );
}

type PillVariant = 'primary' | 'secondary' | 'subtle';

/** The signature pill. One black primary per screen. */
export function PillButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  small,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: PillVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = variant === 'primary' ? Palette.Black : variant === 'secondary' ? Palette.White : Palette.Soft;
  const fg = variant === 'primary' ? Palette.White : Palette.Black;

  const press = usePressProgress();
  const busy = useSharedValue(loading ? 1 : 0);
  const off = useSharedValue(disabled ? 1 : 0);

  // State changes glide instead of snapping: enabling/disabling fades, and a spinner
  // cross-fades with the label (both stay mounted, so the button never changes width).
  useEffect(() => {
    busy.value = withTiming(loading ? 1 : 0, { duration: Motion.duration.base, easing: Motion.easeOut });
  }, [loading, busy]);
  useEffect(() => {
    off.value = withTiming(disabled ? 1 : 0, { duration: Motion.duration.base, easing: Motion.easeOut });
  }, [disabled, off]);

  const containerStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(bg, { duration: Motion.duration.base, easing: Motion.easeOut }),
    opacity: interpolate(off.value, [0, 1], [1, 0.4]),
    transform: [{ scale: interpolate(press.progress.value, [0, 1], [1, 0.97]) }],
  }));
  const pressOverlay = useAnimatedStyle(() => ({
    opacity: interpolate(press.progress.value, [0, 1], [0, 0.14]),
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: 1 - busy.value }));
  const spinnerStyle = useAnimatedStyle(() => ({ opacity: busy.value }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        pill.base,
        small ? pill.small : pill.regular,
        variant === 'secondary' && { borderWidth: 1, borderColor: Palette.LightGray },
        style,
        containerStyle,
      ]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fg }, pressOverlay]} />
      <Animated.View style={[pill.content, labelStyle]}>
        {icon && <Icon name={icon} size={small ? 16 : 18} color={fg} />}
        <Text weight="medium" style={{ color: fg, fontSize: small ? 14 : 16 }}>
          {label}
        </Text>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[pill.spinner, spinnerStyle]}>
        <ActivityIndicator color={fg} animating={!!loading} hidesWhenStopped={false} />
      </Animated.View>
    </AnimatedPressable>
  );
}

const pill = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill, overflow: 'hidden' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  spinner: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  regular: { height: 52, paddingHorizontal: 20 },
  small: { height: 36, paddingHorizontal: 14 },
});

/** Icon that cross-fades between a dark and a light version (used where the colour changes with state). */
function CrossfadeIcon({ name, size, active, inactiveColor, activeColor }: { name: IconName; size: number; active: boolean; inactiveColor: string; activeColor: string }) {
  const on = useAnimatedStyle(() => ({
    opacity: withTiming(active ? 1 : 0, { duration: Motion.duration.base, easing: Motion.easeOut }),
  }));
  const off = useAnimatedStyle(() => ({
    opacity: withTiming(active ? 0 : 1, { duration: Motion.duration.base, easing: Motion.easeOut }),
  }));
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, off]}>
        <Icon name={name} size={size} color={inactiveColor} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, on]}>
        <Icon name={name} size={size} color={activeColor} />
      </Animated.View>
    </View>
  );
}

/** Grey category chip (Home / Work / popular places). Turning active fades to black. */
export function Chip({
  label,
  icon,
  onPress,
  active,
}: {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  active?: boolean;
}) {
  const fill = useAnimatedStyle(() => ({
    backgroundColor: withTiming(active ? Palette.Black : Palette.Soft, { duration: Motion.duration.base, easing: Motion.easeOut }),
  }));
  return (
    <Touchable activeOpacity={0.8} pressScale={0.96} onPress={onPress} style={[chip.base, fill]}>
      {icon && <CrossfadeIcon name={icon} size={16} active={!!active} inactiveColor={Palette.Black} activeColor={Palette.White} />}
      <ColorText weight="medium" color={active ? Palette.White : Palette.Black} style={{ fontSize: 14 }}>
        {label}
      </ColorText>
    </Touchable>
  );
}

/** Chevron that turns over (instead of swapping icons) when a section opens or closes. */
export function Chevron({ open, size = 16, color = Palette.Black }: { open: boolean; size?: number; color?: string }) {
  const turn = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(open ? '180deg' : '0deg', { duration: Motion.duration.base, easing: Motion.easeOut }) }],
  }));
  return (
    <Animated.View style={turn}>
      <Icon name="chevron-down" size={size} color={color} />
    </Animated.View>
  );
}

/** Two-way / multi-way segmented tab: the black fill and white label fade in when selected. */
export function SegmentTab({
  label,
  active,
  onPress,
  style,
  textStyle,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const fill = useAnimatedStyle(() => ({
    opacity: withTiming(active ? 1 : 0, { duration: Motion.duration.base, easing: Motion.easeOut }),
  }));
  return (
    <Touchable activeOpacity={0.8} pressScale={0.97} onPress={onPress} style={[{ overflow: 'hidden' }, style]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: Palette.Black, borderRadius: Radius.pill }, fill]} />
      <ColorText weight="medium" color={active ? Palette.White : Palette.Black} style={textStyle}>
        {label}
      </ColorText>
    </Touchable>
  );
}

const chip = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    backgroundColor: Palette.Soft,
  },
});

/** Soft grey card (16px). `dark` flips to the black promo card. */
export function Card({
  children,
  dark,
  style,
}: {
  children: ReactNode;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ borderRadius: Radius.xl, padding: 20, backgroundColor: dark ? Palette.Black : Palette.Soft }, style]}>
      {children}
    </View>
  );
}

export const Divider = ({ inset = 0 }: { inset?: number }) => (
  <View style={{ height: 1, backgroundColor: Palette.LightGray, marginLeft: inset }} />
);

/** Round grey badge holding an icon — used at the start of list rows. */
export function IconBadge({ name, size = 40, dark }: { name: IconName; size?: number; dark?: boolean }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: dark ? Palette.Black : Palette.Soft,
      }}>
      <Icon name={name} size={size * 0.46} color={dark ? Palette.White : Palette.Black} />
    </View>
  );
}

/** Page header used on every secondary screen: round back button + left-aligned title. */
export function ScreenHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
      <IconButton name="arrow-back" onPress={onBack} accessibilityLabel="Back" />
      <Text weight="bold" style={{ flex: 1, fontSize: 24, lineHeight: 32, color: Palette.Black }} numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}

/** Icon + title + optional subtitle row with a hairline underneath (Uber list row). */
export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
  noDivider,
  dark,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  noDivider?: boolean;
  dark?: boolean;
}) {
  return (
    <Touchable
      activeOpacity={0.6}
      onPress={onPress}
      disabled={!onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        borderBottomWidth: noDivider ? 0 : 1,
        borderBottomColor: Palette.Soft,
      }}>
      {icon && <IconBadge name={icon} dark={dark} />}
      <View style={{ flex: 1 }}>
        <Text weight="medium" style={{ fontSize: 16, lineHeight: 22, color: Palette.Black }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 14, lineHeight: 20, color: Palette.DarkGray }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Touchable>
  );
}

/** Quiet empty state: icon, one line of what's missing, one action. */
export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 72, gap: 8 }}>
      <IconBadge name={icon} size={64} />
      <Text weight="bold" style={{ fontSize: 22, lineHeight: 28, color: Palette.Black, marginTop: 12 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 15, lineHeight: 22, color: Palette.DarkGray, textAlign: 'center' }}>{body}</Text>
      {actionLabel && onAction ? <PillButton label={actionLabel} onPress={onAction} style={{ marginTop: 16, alignSelf: 'stretch' }} /> : null}
    </View>
  );
}
