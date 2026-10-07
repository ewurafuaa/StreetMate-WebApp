import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { IconButton, PillButton } from '@/components/ui';
import { STREETMATE_MAP_STYLE } from '@/constants/map-style';
import { Palette, Radius, Shadow } from '@/constants/theme';
import { useSavedPlaces } from '@/contexts/saved-places';
import { CURRENT_LOCATION } from '@/data/stops';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { cancelLocationRequest, deliverLocation, hasPendingLocationRequest } from '@/utils/location-picker';
import { MAP_PROVIDER } from '@/utils/map-provider';
import { reverseGeocode } from '@/utils/places';

// Pick a spot by dragging the map under a fixed pin. Used three ways:
//   mode=pick      → hands the spot back to whichever screen asked (search, Route Hub)
//   mode=location  → changes the location of an existing saved place (id=…)
//   (no params)    → adds a new saved place, asking for a name after the spot is chosen
export default function SetLocationScreen() {
  const insets = useSafeAreaInsets();
  const { id, mode } = useLocalSearchParams<{ id?: string; mode?: string }>();
  const isEditingLocation = !!id && mode === 'location';

  // A registered handler is what proves a screen is waiting for a value; the param alone can
  // be carried over from an earlier navigation.
  const isPickingForField = mode === 'pick' && hasPendingLocationRequest();

  const { addPlace, updatePlace } = useSavedPlaces();
  const { coords } = useCurrentLocation();
  const mapRef = useRef<MapView>(null);

  const [center, setCenter] = useState<{ lat: number; lng: number }>({ lat: CURRENT_LOCATION.lat, lng: CURRENT_LOCATION.lng });
  const [address, setAddress] = useState('');
  const [resolving, setResolving] = useState(false);
  const [naming, setNaming] = useState(false);
  const [placeName, setPlaceName] = useState('');
  const lookupId = useRef(0);
  const centredOnUser = useRef(false);

  // Any exit that isn't a confirm would otherwise leave the handler registered.
  useEffect(() => () => cancelLocationRequest(), []);

  // Move to the rider's real position once, the first time it arrives.
  useEffect(() => {
    if (!coords || centredOnUser.current) return;
    centredOnUser.current = true;
    mapRef.current?.animateToRegion({ latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
  }, [coords]);

  const onRegionChangeComplete = async (r: Region) => {
    const point = { lat: r.latitude, lng: r.longitude };
    setCenter(point);
    const mine = ++lookupId.current;
    setResolving(true);
    const name = await reverseGeocode(point.lat, point.lng);
    if (mine !== lookupId.current) return; // a newer drag superseded this lookup
    setAddress(name);
    setResolving(false);
  };

  const confirm = () => {
    const name = address || `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
    if (isPickingForField) {
      deliverLocation(name, center);
      router.back();
      return;
    }
    if (isEditingLocation && id) {
      updatePlace(id, { address: name, lat: center.lat, lng: center.lng });
      router.replace('/saved-places');
      return;
    }
    setNaming(true);
  };

  const save = () => {
    if (!placeName.trim()) return;
    addPlace(placeName.trim(), address, center);
    router.replace('/saved-places');
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={MAP_PROVIDER}
        customMapStyle={STREETMATE_MAP_STYLE}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: CURRENT_LOCATION.lat, longitude: CURRENT_LOCATION.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
      />

      {/* Fixed pin: the map moves underneath it */}
      <View style={styles.pinWrap} pointerEvents="none">
        <View style={styles.pinHead}>
          <View style={styles.pinCore} />
        </View>
        <View style={styles.pinStem} />
      </View>

      <View style={[styles.top, { top: insets.top + 8 }]}>
        <IconButton name="arrow-back" floating onPress={() => (naming ? setNaming(false) : router.back())} accessibilityLabel="Back" />
        {coords && (
          <IconButton
            name="locate"
            floating
            onPress={() =>
              mapRef.current?.animateToRegion({ latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 400)
            }
            accessibilityLabel="Go to my location"
          />
        )}
      </View>

      <KeyboardAvoidingView style={styles.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <View style={styles.handle} />
          {naming ? (
            <>
              <Text weight="bold" style={styles.title}>Name this place</Text>
              <TextInput
                autoFocus
                value={placeName}
                onChangeText={setPlaceName}
                placeholder="e.g. School"
                placeholderTextColor={Palette.Placeholder}
                style={styles.input}
                returnKeyType="done"
                onSubmitEditing={save}
              />
              <PillButton label="Save place" onPress={save} disabled={!placeName.trim()} />
            </>
          ) : (
            <>
              <Text weight="bold" style={styles.title} numberOfLines={2}>
                {address || 'Move the map to pick a spot'}
              </Text>
              <View style={styles.hintRow}>
                {resolving && <ActivityIndicator size="small" color={Palette.DarkGray} />}
                <Text style={styles.hint}>{resolving ? 'Finding the address…' : 'Drag the map to put the pin on the spot.'}</Text>
              </View>
              <PillButton label="Confirm location" onPress={confirm} disabled={resolving && !address} style={{ marginTop: 16 }} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.Soft },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  pinWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 54 },
  pinHead: { width: 32, height: 32, borderRadius: 16, backgroundColor: Palette.Black, alignItems: 'center', justifyContent: 'center', ...Shadow.float },
  pinCore: { width: 10, height: 10, backgroundColor: Palette.White },
  pinStem: { width: 3, height: 22, backgroundColor: Palette.Black },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: { backgroundColor: Palette.White, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, paddingHorizontal: 20, paddingTop: 10, ...Shadow.card },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Palette.LightGray, marginBottom: 14 },
  title: { fontSize: 22, lineHeight: 28, color: Palette.Black },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  hint: { fontSize: 14, color: Palette.DarkGray },
  input: { height: 52, borderRadius: Radius.md, backgroundColor: Palette.Soft, paddingHorizontal: 16, fontSize: 16, color: Palette.Black, fontFamily: 'HelveticaNow_Medium', marginVertical: 14 },
});
