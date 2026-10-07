import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { IconBadge, IconButton } from '@/components/ui';
import { Palette, Radius } from '@/constants/theme';
import { useSavedPlaces } from '@/contexts/saved-places';
import { requestLocation } from '@/utils/location-picker';
import { CURRENT_LOCATION, formatDistance } from '@/data/stops';
import { useCurrentLocation } from '@/hooks/use-current-location';
import {
  autocompletePlaces,
  getPlaceLocation,
  newSessionToken,
  PlacesError,
  reverseGeocode,
  type PlaceSuggestion,
} from '@/utils/places';

function HighlightedName({ name, query }: { name: string; query: string }) {
  if (!query) {
    return <Text numberOfLines={1} style={styles.resultName}>{name}</Text>;
  }
  const index = name.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) {
    return <Text numberOfLines={1} style={styles.resultName}>{name}</Text>;
  }
  const before = name.slice(0, index);
  const match = name.slice(index, index + query.length);
  const after = name.slice(index + query.length);
  return (
    <Text numberOfLines={1} style={styles.resultName}>
      {before}
      <Text weight="bold" style={styles.resultName}>{match}</Text>
      {after}
    </Text>
  );
}

type Field = 'origin' | 'destination';
type Point = { lat: number; lng: number };
type CustomOrigin = Point & { name: string };

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

// Used only when the phone's location is switched off or unavailable.
const FALLBACK_POINT: Point = { lat: CURRENT_LOCATION.lat, lng: CURRENT_LOCATION.lng };

export default function SearchScreen() {
  const { coords, status } = useCurrentLocation();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const { places: savedPlaces } = useSavedPlaces();

  // Origin field
  const [originMode, setOriginMode] = useState<'current' | 'custom'>('current');
  const [customOrigin, setCustomOrigin] = useState<CustomOrigin | null>(null);
  const [originQuery, setOriginQuery] = useState('');
  const [originFocused, setOriginFocused] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);
  const [resolvingAddress, setResolvingAddress] = useState(false);

  // Destination field
  const [destQuery, setDestQuery] = useState(q ?? '');

  // Shared search state: only one field is active at a time
  const [activeField, setActiveField] = useState<Field>('destination');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const originInputRef = useRef<TextInput>(null);
  const destInputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0); // lets a slow, older response be ignored
  const sessionTokenRef = useRef<string | null>(null);
  const addressKeyRef = useRef<string | null>(null); // which GPS spot currentAddress belongs to
  const skipFocusSearchRef = useRef(false); // set when we move focus to the destination ourselves

  // A place tapped on the home screen arrives as ?q=… and is searched immediately.
  useEffect(() => {
    if (q && q.trim().length >= MIN_QUERY_LENGTH) startSearch(q, FALLBACK_POINT, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stops a pending search from firing after the screen is closed.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Where the rider is starting from, for the map and for ranking results.
  const gpsPoint: Point = coords ?? FALLBACK_POINT;
  const originPoint: Point = originMode === 'custom' && customOrigin ? customOrigin : gpsPoint;
  const originLabel =
    originMode === 'custom' && customOrigin
      ? customOrigin.name
      : coords
        ? 'Current location'
        : CURRENT_LOCATION.name;

  // What the origin box shows while it is NOT being edited.
  const originDisplay =
    originMode === 'custom' && customOrigin
      ? customOrigin.name
      : status === 'loading'
        ? 'Finding your location…'
        : coords
          ? 'Current location'
          : 'Location off. Using a default area';

  const activeQuery = (activeField === 'origin' ? originQuery : destQuery).trim();

  const resetSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current += 1;
    setSuggestions([]);
    setSearching(false);
    setHasSearched(false);
    setError(null);
  };

  const runSearch = async (text: string, center: Point) => {
    const requestId = ++requestIdRef.current;
    const token = sessionTokenRef.current ?? newSessionToken();
    sessionTokenRef.current = token;

    try {
      const results = await autocompletePlaces(text, center, token);
      if (requestId !== requestIdRef.current) return;
      setSuggestions(results);
      setError(null);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setSuggestions([]);
      setError(e instanceof PlacesError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      if (requestId === requestIdRef.current) {
        setSearching(false);
        setHasSearched(true);
      }
    }
  };

  const startSearch = (text: string, center: Point, delay: number = DEBOUNCE_MS) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = text.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      requestIdRef.current += 1; // cancels any search still in flight
      setSuggestions([]);
      setSearching(false);
      setHasSearched(false);
      setError(null);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(() => runSearch(trimmed, center), delay);
  };

  // --- Origin field ---------------------------------------------------------

  const handleOriginFocus = async () => {
    setOriginFocused(true);
    setActiveField('origin');
    resetSearch();

    if (originMode === 'custom' && customOrigin) {
      setOriginQuery(customOrigin.name);
      return;
    }
    if (!coords) {
      setOriginQuery(status === 'loading' ? '' : CURRENT_LOCATION.name);
      return;
    }

    // Tapping "Current location" swaps the label for the real address.
    const key = `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}`;
    if (currentAddress && addressKeyRef.current === key) {
      setOriginQuery(currentAddress);
      return;
    }

    setOriginQuery('');
    setResolvingAddress(true);
    const address = await reverseGeocode(coords.lat, coords.lng);
    addressKeyRef.current = key;
    setCurrentAddress(address);
    setResolvingAddress(false);
    // Only fill it in if the rider hasn't already started typing something else.
    setOriginQuery((prev) => (prev === '' ? address : prev));
  };

  const handleOriginBlur = () => {
    setOriginFocused(false);
  };

  const handleOriginChange = (text: string) => {
    setOriginQuery(text);
    startSearch(text, gpsPoint);
  };

  const handleUseCurrentLocation = () => {
    setOriginMode('current');
    setCustomOrigin(null);
    resetSearch();
    skipFocusSearchRef.current = true;
    originInputRef.current?.blur();
    destInputRef.current?.focus();
    if (destQuery.trim().length >= MIN_QUERY_LENGTH) startSearch(destQuery, gpsPoint, 0);
  };

  // --- Destination field ----------------------------------------------------

  const handleDestFocus = () => {
    setActiveField('destination');
    if (skipFocusSearchRef.current) {
      skipFocusSearchRef.current = false;
      return;
    }
    resetSearch();
    if (destQuery.trim().length >= MIN_QUERY_LENGTH) startSearch(destQuery, originPoint, 0);
  };

  const handleDestChange = (text: string) => {
    setDestQuery(text);
    startSearch(text, originPoint);
  };

  const openPlanner = (name: string, point: Point) =>
    router.push({
      pathname: '/map',
      params: {
        origin: originLabel,
        destination: name,
        destLat: String(point.lat),
        destLng: String(point.lng),
        originLat: String(originPoint.lat),
        originLng: String(originPoint.lng),
      },
    });

  // "Choose on map": the map screen hands back a name + coordinates.
  const handleChooseOnMap = () => {
    const field = activeField;
    requestLocation((name, point) => {
      if (!point) return;
      if (field === 'origin') {
        setCustomOrigin({ name, ...point });
        setOriginMode('custom');
      } else {
        openPlanner(name, point);
      }
    });
    router.push({ pathname: '/set-location', params: { mode: 'pick' } });
  };

  // --- Picking a result -----------------------------------------------------

  // A suggestion has no coordinates yet, so one more call fetches them first.
  const handleSelect = async (item: PlaceSuggestion) => {
    if (resolvingId) return;
    setResolvingId(item.placeId);
    setError(null);

    try {
      const place = await getPlaceLocation(item.placeId, sessionTokenRef.current ?? undefined);
      sessionTokenRef.current = null; // session finished; the next search starts a new one

      if (activeField === 'origin') {
        // The rider chose a different starting point. Move on to the destination box.
        const picked: CustomOrigin = { name: item.name, lat: place.lat, lng: place.lng };
        setCustomOrigin(picked);
        setOriginMode('custom');
        resetSearch();
        skipFocusSearchRef.current = true;
        originInputRef.current?.blur();
        destInputRef.current?.focus();
        if (destQuery.trim().length >= MIN_QUERY_LENGTH) startSearch(destQuery, picked, 0);
      } else {
        openPlanner(item.name, place);
      }
    } catch (e) {
      setError(e instanceof PlacesError ? e.message : "Couldn't open that place. Please try again.");
    } finally {
      setResolvingId(null);
    }
  };

  const showIdle = suggestions.length === 0 && !searching && !error && !hasSearched;
  const savedWithPoint = savedPlaces.filter((p) => p.address.trim() && p.lat != null && p.lng != null);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.keyboardAvoider} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <View style={styles.header}>
          <IconButton name="arrow-back" onPress={() => router.back()} accessibilityLabel="Back" />
          <Text weight="bold" style={styles.headerTitle}>Plan your trip</Text>
        </View>

        {/* Stacked from / to card, with the dot-line-square rail */}
        <View style={styles.card}>
          <View style={styles.rail}>
            <View style={styles.railDot} />
            <View style={styles.railLine} />
            <View style={styles.railSquare} />
          </View>
          <View style={styles.fields}>
            <View style={[styles.field, originFocused && styles.fieldFocused]}>
              <TextInput
                ref={originInputRef}
                value={originFocused ? originQuery : originDisplay}
                onChangeText={handleOriginChange}
                onFocus={handleOriginFocus}
                onBlur={handleOriginBlur}
                selectTextOnFocus
                returnKeyType="search"
                placeholder={resolvingAddress ? 'Finding your address…' : 'Search a starting point'}
                placeholderTextColor={Palette.Placeholder}
                style={styles.input}
              />
              {originFocused && resolvingAddress && <ActivityIndicator size="small" color={Palette.DarkGray} />}
            </View>
            <View style={[styles.field, !originFocused && styles.fieldFocused]}>
              <TextInput
                ref={destInputRef}
                autoFocus
                value={destQuery}
                onChangeText={handleDestChange}
                onFocus={handleDestFocus}
                placeholder="Where to?"
                placeholderTextColor={Palette.Placeholder}
                style={styles.input}
              />
              {searching && activeField === 'destination' && <ActivityIndicator size="small" color={Palette.DarkGray} />}
            </View>
          </View>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {activeField === 'origin' && originFocused && originMode === 'custom' && (
            <TouchableOpacity style={styles.row} onPress={handleUseCurrentLocation} activeOpacity={0.6}>
              <IconBadge name="navigate" />
              <Text weight="medium" style={styles.rowText}>Use current location</Text>
            </TouchableOpacity>
          )}

          {suggestions.map((item) => (
            <TouchableOpacity
              key={item.placeId}
              style={styles.row}
              activeOpacity={0.6}
              disabled={resolvingId !== null}
              onPress={() => handleSelect(item)}>
              <IconBadge name="location" />
              <View style={styles.resultTextGroup}>
                <HighlightedName name={item.name} query={activeQuery} />
                {item.secondary ? <Text numberOfLines={1} style={styles.resultAddress}>{item.secondary}</Text> : null}
              </View>
              {resolvingId === item.placeId ? (
                <ActivityIndicator size="small" color={Palette.DarkGray} />
              ) : item.distanceMeters != null ? (
                <Text style={styles.resultDistance}>{formatDistance(item.distanceMeters / 1000)}</Text>
              ) : null}
            </TouchableOpacity>
          ))}

          {error && (
            <View style={styles.empty}>
              <Text weight="medium" style={styles.emptyTitle}>{error}</Text>
            </View>
          )}

          {hasSearched && !searching && !error && suggestions.length === 0 && (
            <View style={styles.empty}>
              <Text weight="medium" style={styles.emptyTitle}>No places match that search</Text>
              <Text style={styles.emptyHint}>Try a nearby landmark, junction or area name.</Text>
            </View>
          )}

          {suggestions.length > 0 && <Text style={styles.attribution}>Powered by Google</Text>}

          {/* Shortcuts, shown until the rider starts typing */}
          {(showIdle || activeField === 'origin') && suggestions.length === 0 && (
            <>
              {activeField === 'destination' &&
                savedWithPoint.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.row}
                    activeOpacity={0.6}
                    onPress={() => openPlanner(p.label, { lat: p.lat as number, lng: p.lng as number })}>
                    <IconBadge name={p.icon === 'home' ? 'home' : p.icon === 'work' ? 'briefcase' : 'star'} />
                    <View style={styles.resultTextGroup}>
                      <Text weight="medium" style={styles.resultName}>{p.label}</Text>
                      <Text numberOfLines={1} style={styles.resultAddress}>{p.address}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              <TouchableOpacity style={styles.row} onPress={handleChooseOnMap} activeOpacity={0.6}>
                <IconBadge name="map" />
                <Text weight="medium" style={styles.rowText}>Choose on map</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.row} onPress={() => router.push('/saved-places')} activeOpacity={0.6}>
                <IconBadge name="bookmark" />
                <Text weight="medium" style={styles.rowText}>Saved places</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.White },
  keyboardAvoider: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 24, lineHeight: 32, color: Palette.Black },

  card: { flexDirection: 'row', gap: 12, marginHorizontal: 16, padding: 12, borderRadius: Radius.xl, backgroundColor: Palette.White, borderWidth: 1, borderColor: Palette.LightGray },
  rail: { width: 14, alignItems: 'center', paddingVertical: 22 },
  railDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Palette.Black },
  railLine: { width: 2, flex: 1, backgroundColor: Palette.LightGray, marginVertical: 4 },
  railSquare: { width: 10, height: 10, backgroundColor: Palette.Black },
  fields: { flex: 1, gap: 8 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, borderRadius: Radius.md, paddingHorizontal: 14, backgroundColor: Palette.Soft, borderWidth: 2, borderColor: 'transparent' },
  fieldFocused: { borderColor: Palette.Black, backgroundColor: Palette.White },
  input: { flex: 1, padding: 0, fontSize: 16, color: Palette.Black, fontFamily: 'HelveticaNow_Medium' },

  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Palette.Soft },
  rowText: { flex: 1, fontSize: 16, color: Palette.Black },
  resultTextGroup: { flex: 1 },
  resultName: { fontSize: 16, lineHeight: 22, color: Palette.Black },
  resultAddress: { fontSize: 14, lineHeight: 20, color: Palette.DarkGray },
  resultDistance: { fontSize: 13, color: Palette.DarkGray },
  empty: { paddingVertical: 24 },
  emptyTitle: { fontSize: 16, color: Palette.Black, marginBottom: 4 },
  emptyHint: { fontSize: 14, color: Palette.DarkGray },
  attribution: { fontSize: 12, color: Palette.Placeholder, textAlign: 'right', paddingTop: 10 },
});
