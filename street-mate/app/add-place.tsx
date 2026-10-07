import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { Icon, IconBadge, PillButton, ScreenHeader } from '@/components/ui';
import { Palette, Radius } from '@/constants/theme';
import { useSavedPlaces } from '@/contexts/saved-places';
import { CURRENT_LOCATION } from '@/data/stops';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { autocompletePlaces, getPlaceLocation, newSessionToken, PlacesError, reverseGeocode, type PlaceSuggestion } from '@/utils/places';

type Point = { lat: number; lng: number };

// Choose a place to save (or move an existing one when ?id=… is passed). Search, use
// the current location, or drop a pin on the map.
export default function AddPlaceScreen() {
  const { id, mode } = useLocalSearchParams<{ id?: string; mode?: string }>();
  const { addPlace, updatePlace } = useSavedPlaces();
  const { coords } = useCurrentLocation();

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<{ name: string; point: Point } | null>(null);
  const [placeName, setPlaceName] = useState('');

  const token = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const center: Point = coords ?? { lat: CURRENT_LOCATION.lat, lng: CURRENT_LOCATION.lng };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onChange = (text: string) => {
    setQuery(text);
    if (timer.current) clearTimeout(timer.current);
    requestId.current += 1;
    if (text.trim().length < 2) {
      setSuggestions([]);
      setSearching(false);
      setError(null);
      return;
    }
    setSearching(true);
    const mine = requestId.current;
    timer.current = setTimeout(async () => {
      token.current = token.current ?? newSessionToken();
      try {
        const results = await autocompletePlaces(text.trim(), center, token.current);
        if (mine !== requestId.current) return;
        setSuggestions(results);
        setError(null);
      } catch (e) {
        if (mine !== requestId.current) return;
        setSuggestions([]);
        setError(e instanceof PlacesError ? e.message : 'Something went wrong. Please try again.');
      } finally {
        if (mine === requestId.current) setSearching(false);
      }
    }, 300);
  };

  // Editing an existing place saves straight away; a new one asks for a name first.
  const finish = (name: string, point: Point) => {
    if (id) {
      updatePlace(id, { address: name, lat: point.lat, lng: point.lng });
      router.replace('/saved-places');
    } else {
      setChosen({ name, point });
      setPlaceName('');
    }
  };

  const pick = async (item: PlaceSuggestion) => {
    if (busyId) return;
    setBusyId(item.placeId);
    try {
      const point = await getPlaceLocation(item.placeId, token.current ?? undefined);
      token.current = null;
      finish(item.secondary ? `${item.name}, ${item.secondary}` : item.name, point);
    } catch (e) {
      setError(e instanceof PlacesError ? e.message : "Couldn't open that place. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const useCurrent = async () => {
    if (!coords || busyId) return;
    setBusyId('current');
    const name = await reverseGeocode(coords.lat, coords.lng);
    setBusyId(null);
    finish(name, coords);
  };

  const save = () => {
    if (!chosen || !placeName.trim()) return;
    addPlace(placeName.trim(), chosen.name, chosen.point);
    router.replace('/saved-places');
  };

  if (chosen) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Name this place" onBack={() => setChosen(null)} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.nameBody}>
            <View style={styles.chosenRow}>
              <IconBadge name="location" />
              <Text style={styles.chosenText} numberOfLines={2}>{chosen.name}</Text>
            </View>
            <TextInput
              autoFocus
              value={placeName}
              onChangeText={setPlaceName}
              placeholder="e.g. School"
              placeholderTextColor={Palette.Placeholder}
              style={styles.nameInput}
              returnKeyType="done"
              onSubmitEditing={save}
            />
          </View>
          <View style={styles.footer}>
            <PillButton label="Save place" onPress={save} disabled={!placeName.trim()} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title={id ? 'Change location' : 'Add a place'} onBack={() => router.back()} />

      <View style={styles.searchWrap}>
        <Icon name="search" size={20} />
        <TextInput
          autoFocus
          value={query}
          onChangeText={onChange}
          placeholder="Search for a place"
          placeholderTextColor={Palette.Placeholder}
          style={styles.searchInput}
        />
        {searching && <ActivityIndicator size="small" color={Palette.DarkGray} />}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results} showsVerticalScrollIndicator={false}>
        {suggestions.map((s) => (
          <TouchableOpacity key={s.placeId} style={styles.row} activeOpacity={0.6} onPress={() => pick(s)} disabled={!!busyId}>
            <IconBadge name="location" />
            <View style={{ flex: 1 }}>
              <Text weight="medium" style={styles.rowTitle} numberOfLines={1}>{s.name}</Text>
              {s.secondary ? <Text style={styles.rowSub} numberOfLines={1}>{s.secondary}</Text> : null}
            </View>
            {busyId === s.placeId && <ActivityIndicator size="small" color={Palette.DarkGray} />}
          </TouchableOpacity>
        ))}
        {error && <Text style={styles.error}>{error}</Text>}

        {suggestions.length === 0 && (
          <>
            <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={useCurrent} disabled={!coords || !!busyId}>
              <IconBadge name="navigate" />
              <Text weight="medium" style={[styles.rowTitle, { flex: 1 }]}>{coords ? 'Use current location' : 'Current location unavailable'}</Text>
              {busyId === 'current' && <ActivityIndicator size="small" color={Palette.DarkGray} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => router.push({ pathname: '/set-location', params: id ? { id, mode: mode ?? 'location' } : {} })}>
              <IconBadge name="map" />
              <Text weight="medium" style={[styles.rowTitle, { flex: 1 }]}>Choose on map</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.White },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, marginHorizontal: 16, borderRadius: Radius.pill, paddingHorizontal: 18, backgroundColor: Palette.Soft },
  searchInput: { flex: 1, fontSize: 16, color: Palette.Black, fontFamily: 'HelveticaNow_Medium', padding: 0 },
  results: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Palette.Soft },
  rowTitle: { fontSize: 16, lineHeight: 22, color: Palette.Black },
  rowSub: { fontSize: 14, lineHeight: 20, color: Palette.DarkGray },
  error: { fontSize: 14, color: Palette.DarkGray, paddingVertical: 16 },
  nameBody: { flex: 1, paddingHorizontal: 16 },
  chosenRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  chosenText: { flex: 1, fontSize: 15, lineHeight: 21, color: Palette.DarkGray },
  nameInput: { height: 56, borderRadius: Radius.md, backgroundColor: Palette.Soft, paddingHorizontal: 16, fontSize: 18, color: Palette.Black, fontFamily: 'HelveticaNow_Medium', marginTop: 12 },
  footer: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 8 },
});
