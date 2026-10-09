//sidebar.tsx
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import { Touchable } from '@/components/touchable';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Palette, Radius } from '@/constants/theme';
import { AppText as Text } from '@/components/app-text';
import { Icon, IconButton, type IconName } from '@/components/ui';

const SIDEBAR_WIDTH = Math.min(320, Dimensions.get('window').width * 0.82);

const menuItems: { key: string; label: string; icon: IconName; path?: string }[] = [
  { key: 'home', label: 'Home', icon: 'home-outline' },
  { key: 'recent', label: 'Recent trips', icon: 'time-outline', path: '/recent-trips' },
  { key: 'saved', label: 'Saved places', icon: 'bookmark-outline', path: '/saved-places' },
  { key: 'stops', label: 'Find a stop', icon: 'location-outline', path: '/stops-map' },
  { key: 'routehub', label: 'Route Hub', icon: 'git-network-outline', path: '/route-hub' },
  { key: 'tips', label: 'Trotro tips', icon: 'bulb-outline', path: '/tips' },
];

type SidebarProps = {
  visible: boolean;
  onClose: () => void;
  activeKey?: string;
  onSelect?: (key: string) => void;
};

export function Sidebar({ visible, onClose, activeKey = 'home', onSelect }: SidebarProps) {
  const [slideAnim] = useState(() => new Animated.Value(-SIDEBAR_WIDTH));
  const [overlayAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: visible ? 0 : -SIDEBAR_WIDTH, duration: 250, useNativeDriver: true }),
      Animated.timing(overlayAnim, { toValue: visible ? 1 : 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [visible, slideAnim, overlayAnim]);

  const handleMenuPress = (item: (typeof menuItems)[number]) => {
    onClose();
    onSelect?.(item.key);
    if (item.path) router.push(item.path as never);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
        <Touchable style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.panel, { transform: [{ translateX: slideAnim }] }]}>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          <View style={styles.top}>
            <Image source={require('@/assets/images/streetmate-logo.png')} style={styles.logo} contentFit="contain" />
            <IconButton name="close" size={40} onPress={onClose} accessibilityLabel="Close menu" />
          </View>

          <View style={styles.menuList}>
            {menuItems.map((item) => {
              const isActive = item.key === activeKey;
              return (
                <Touchable
                  key={item.key}
                  style={[styles.menuItem, isActive && styles.menuItemActive]}
                  activeOpacity={0.6}
                  onPress={() => handleMenuPress(item)}>
                  <Icon name={item.icon} size={24} />
                  <Text weight={isActive ? 'bold' : 'medium'} style={styles.menuLabel}>{item.label}</Text>
                </Touchable>
              );
            })}
          </View>

          <Text style={styles.footnote}>Times and fares are estimates. Trotros leave when full.</Text>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0, width: SIDEBAR_WIDTH, backgroundColor: Palette.White, paddingHorizontal: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  logo: { width: 140, height: 28 },
  menuList: { marginTop: 24, gap: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 16, height: 56, paddingHorizontal: 12, borderRadius: Radius.lg },
  menuItemActive: { backgroundColor: Palette.Soft },
  menuLabel: { fontSize: 20, color: Palette.Black },
  footnote: { position: 'absolute', left: 12, right: 12, bottom: 20, fontSize: 12, lineHeight: 17, color: Palette.Placeholder },
});
