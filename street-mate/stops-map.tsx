//app/_layout.tsx
import { DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown, SlideInDown, SlideInRight } from 'react-native-reanimated';
import { FONT_FILES } from '@/components/app-text';
import { SavedPlacesProvider } from '@/contexts/saved-places';
import { TripHistoryProvider } from '@/contexts/trip-history';
import { Motion } from '@/constants/motion';

// Web only: browsers draw their own focus outline (the box) around text fields. The app's fields
// already show focus through their container, so the outline is removed and only the cursor remains.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = 'input, textarea { outline: none !important; box-shadow: none !important; }';
  document.head.appendChild(style);
}

export const unstable_settings = {
  anchor: '(tabs)',
};

const SPLASH_MS = 2500;

// The UI is designed as a phone screen (bottom sheets, full-bleed maps). On a wide browser window
// it is shown as a centred phone-width column instead of being stretched across the screen.
function WebFrame({ children }: ViewProps) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={styles.webOuter}>
      <View style={styles.webInner}>{children}</View>
    </View>
  );
}

// Phones get native push / pop animations from the Stack. Browsers have none, so on web each
// screen plays an entrance when it opens: pushed screens slide in, the search sheet rises from
// the bottom, the home screen simply fades in.
function WebScreen({ name, children }: { name: string; children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  const entering =
    name === '(tabs)'
      ? FadeIn.duration(Motion.duration.slow)
      : name === 'search'
        ? SlideInDown.duration(Motion.duration.slow).easing(Motion.easeOut)
        : name === 'journey'
          ? FadeInDown.duration(Motion.duration.slow).easing(Motion.easeOut)
          : SlideInRight.duration(Motion.duration.slow).easing(Motion.easeOut);
  return (
    <Animated.View entering={entering} style={styles.flexFill}>
      {children}
    </Animated.View>
  );
}

// The app is light-only: the Uber-style design is a black-and-white system, so the
// navigation theme is pinned to the default (white) theme regardless of the phone's setting.
const AppTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: '#FFFFFF', card: '#FFFFFF', text: '#000000', border: '#E2E2E2', primary: '#000000' } };

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);
  const [fontsLoaded] = useFonts(FONT_FILES);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash || !fontsLoaded) {
    return (
      <WebFrame>
        <GestureHandlerRootView style={styles.flexFill}>
          <View style={styles.splashContainer}>
            <Image source={require('@/assets/images/streetmate-logo.gif')} style={styles.splashImage} contentFit="contain" />
          </View>
        </GestureHandlerRootView>
      </WebFrame>
    );
  }

  return (
    <WebFrame>
    <GestureHandlerRootView style={styles.flexFill}>
      {/* The app fades in as the splash leaves, instead of cutting straight to it. */}
      <Animated.View entering={FadeIn.duration(Motion.duration.slow)} style={styles.flexFill}>
      <SavedPlacesProvider>
        <TripHistoryProvider>
          <ThemeProvider value={AppTheme}>
            <Stack
              screenLayout={({ route, children }) => <WebScreen name={route.name}>{children}</WebScreen>}
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#FFFFFF' },
                // Pushed screens slide in from the right (and can be swiped back from anywhere on iOS).
                animation: 'slide_from_right',
                animationDuration: Motion.duration.slow,
                fullScreenGestureEnabled: true,
              }}>
              <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: true, title: 'Modal' }} />
              <Stack.Screen name="search" options={{ animation: 'slide_from_bottom' }} />
              {/* Planner and live trip rise softly over the previous screen rather than sliding sideways. */}
              <Stack.Screen name="map" options={{ animation: 'fade_from_bottom' }} />
              <Stack.Screen name="journey" options={{ gestureEnabled: false, animation: 'fade_from_bottom' }} />
              <Stack.Screen name="recent-trips" />
              <Stack.Screen name="saved-places" />
              <Stack.Screen name="add-place" />
              <Stack.Screen name="set-location" />
              <Stack.Screen name="route-hub" />
              <Stack.Screen name="stops-map" />
              <Stack.Screen name="tips" />
            </Stack>
            <StatusBar style="dark" />
          </ThemeProvider>
        </TripHistoryProvider>
      </SavedPlacesProvider>
      </Animated.View>
    </GestureHandlerRootView>
    </WebFrame>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1 },
  webOuter: { flex: 1, alignItems: 'center', backgroundColor: '#EDEDED' },
  webInner: { flex: 1, width: '100%', maxWidth: 480, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  splashContainer: { flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center' },
  splashImage: { width: 300, height: 300 },
});
