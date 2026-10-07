// Small Uber-style building blocks shared by every screen: pill buttons, grey chips,
// circular icon buttons and soft cards. Keeping them here is what keeps the app
// consistent — screens compose these instead of re-inventing borders and radii.

import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { AppText as Text } from '@/components/app-text';
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
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: dark ? Palette.Black : floating ? Palette.White : Palette.Soft,
        },
        floating && Shadow.float,
        style,
      ]}>
      <Icon name={name} size={size * 0.5} color={dark ? Palette.White : Palette.Black} />
    </TouchableOpacity>
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
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        pill.base,
        small ? pill.small : pill.regular,
        { backgroundColor: bg, opacity: disabled ? 0.4 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: Palette.LightGray },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={small ? 16 : 18} color={fg} />}
          <Text weight="medium" style={{ color: fg, fontSize: small ? 14 : 16 }}>
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const pill = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.pill },
  regular: { height: 52, paddingHorizontal: 20 },
  small: { height: 36, paddingHorizontal: 14 },
});

/** Grey category chip (Home / Work / popular places). */
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
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[chip.base, active && { backgroundColor: Palette.Black }]}>
      {icon && <Icon name={icon} size={16} color={active ? Palette.White : Palette.Black} />}
      <Text weight="medium" style={{ fontSize: 14, color: active ? Palette.White : Palette.Black }}>
        {label}
      </Text>
    </TouchableOpacity>
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
    <TouchableOpacity
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
    </TouchableOpacity>
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
