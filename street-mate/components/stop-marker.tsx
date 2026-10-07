import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { Palette } from '@/constants/theme';

export type StopMarkerKind = 'stop' | 'passed' | 'next' | 'board' | 'alight' | 'origin' | 'destination';

const SIZE: Record<StopMarkerKind, number> = {
  stop: 10,
  passed: 8,
  next: 16,
  board: 18,
  alight: 18,
  origin: 16,
  destination: 18,
};

// Native map markers snapshot their view; they only redraw while tracksViewChanges is on.
// So it stays on briefly after each change (so the new look is captured) and then turns off,
// which keeps long stop lists cheap.
export function StopMarker({
  coordinate,
  kind,
  title,
  onPress,
}: {
  coordinate: { latitude: number; longitude: number };
  kind: StopMarkerKind;
  title?: string;
  onPress?: () => void;
}) {
  const [tracking, setTracking] = useState(true);

  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), 600);
    return () => clearTimeout(timer);
  }, [kind]);

  const size = SIZE[kind];
  return (
    <Marker
      coordinate={coordinate}
      title={onPress ? undefined : title}
      onPress={onPress}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracking}
      zIndex={kind === 'stop' || kind === 'passed' ? 1 : 3}>
      <View style={styles.wrap}>
        {kind === 'destination' ? (
          <View style={[styles.square, { width: size, height: size }]}>
            <View style={styles.squareInner} />
          </View>
        ) : kind === 'origin' ? (
          <View style={[styles.ringBlack, { width: size, height: size, borderRadius: size / 2 }]}>
            <View style={styles.ringInner} />
          </View>
        ) : kind === 'board' || kind === 'alight' ? (
          <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}>
            <View style={[styles.core, kind === 'alight' && { backgroundColor: Palette.White }]} />
          </View>
        ) : kind === 'next' ? (
          <View style={[styles.next, { width: size, height: size, borderRadius: size / 2 }]} />
        ) : (
          <View
            style={[
              styles.dot,
              { width: size, height: size, borderRadius: size / 2 },
              kind === 'passed' && { backgroundColor: Palette.Placeholder },
            ]}
          />
        )}
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 4, alignItems: 'center', justifyContent: 'center' },
  dot: { backgroundColor: Palette.White, borderWidth: 2, borderColor: Palette.Black },
  next: { backgroundColor: Palette.Black, borderWidth: 3, borderColor: Palette.White },
  ring: { backgroundColor: Palette.Black, borderWidth: 3, borderColor: Palette.White, alignItems: 'center', justifyContent: 'center' },
  core: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.White },
  ringBlack: { backgroundColor: Palette.White, borderWidth: 5, borderColor: Palette.Black, alignItems: 'center', justifyContent: 'center' },
  ringInner: { width: 0, height: 0 },
  square: { backgroundColor: Palette.Black, borderWidth: 3, borderColor: Palette.White, alignItems: 'center', justifyContent: 'center' },
  squareInner: { width: 6, height: 6, backgroundColor: Palette.White },
});
