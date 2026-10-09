import { useState } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Touchable } from '@/components/touchable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { Icon, IconButton, ListRow, PillButton, ScreenHeader, SegmentTab } from '@/components/ui';
import { Palette, Radius } from '@/constants/theme';
import { CURRENT_LOCATION, searchStops } from '@/data/stops';
import { requestLocation } from '@/utils/location-picker';

// Fare input rules — adjust these rather than the logic below.
const CURRENCY_PREFIX = 'GH¢';
const MAX_DECIMAL_PLACES = 2; // real currency: 5 → 5.00
const MAX_WHOLE_DIGITS = 3; // caps fares below 1000

type Tab = 'add' | 'request';

export default function RouteHubScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('add');

  const [startingPoint, setStartingPoint] = useState('');
  const [endPoint, setEndPoint] = useState('');
  const [estimatedFare, setEstimatedFare] = useState('');
  const [stops, setStops] = useState<string[]>([]);
  const [note, setNote] = useState('');

  // Which field the picker sheet is editing
  const [activeField, setActiveField] = useState<'start' | 'end' | null>(null);
  const [fieldQuery, setFieldQuery] = useState('');
  const matches = fieldQuery.trim().length >= 2 ? searchStops(fieldQuery, CURRENT_LOCATION, 6) : [];

  const swap = () => {
    setStartingPoint(endPoint);
    setEndPoint(startingPoint);
  };

  // Digits and a single decimal point only, capped before and after the point.
  const onFareChange = (raw: string) => {
    let cleaned = raw.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    if (firstDot !== -1) cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
    const [whole = '', decimals = ''] = cleaned.split('.');
    let next = whole.slice(0, MAX_WHOLE_DIGITS);
    if (firstDot !== -1) next += '.' + decimals.slice(0, MAX_DECIMAL_PLACES);
    setEstimatedFare(next);
  };

  // 5 → 5.00 when focus leaves
  const onFareBlur = () => {
    const value = parseFloat(estimatedFare);
    setEstimatedFare(Number.isNaN(value) ? '' : value.toFixed(MAX_DECIMAL_PLACES));
  };

  const openField = (field: 'start' | 'end') => {
    setActiveField(field);
    setFieldQuery('');
  };

  const choose = (value: string) => {
    if (activeField === 'start') setStartingPoint(value);
    if (activeField === 'end') setEndPoint(value);
    setActiveField(null);
  };

  const chooseOnMap = () => {
    const field = activeField;
    requestLocation((value) => {
      if (field === 'start') setStartingPoint(value);
      if (field === 'end') setEndPoint(value);
    });
    setActiveField(null);
    router.push({ pathname: '/set-location', params: { mode: 'pick' } });
  };

  const fare = parseFloat(estimatedFare);
  const hasFare = !Number.isNaN(fare) && fare > 0;
  const bothPoints = startingPoint.trim().length > 0 && endPoint.trim().length > 0;
  const canSave = tab === 'add' ? bothPoints && hasFare : bothPoints;

  const save = () => {
    if (!canSave) return;
    // Replace with a real submission to your backend / data store once available.
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Route Hub" onBack={() => router.back()} />

      {/* Two-way toggle (pill) */}
      <View style={styles.tabs}>
        {([['add', 'Add a route'], ['request', 'Request a route']] as const).map(([key, label]) => (
          <SegmentTab key={key} label={label} active={tab === key} onPress={() => setTab(key)} style={styles.tab} textStyle={styles.tabText} />
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          {/* From / to card */}
          <View style={styles.card}>
            <View style={styles.rail}>
              <View style={styles.railDot} />
              <View style={styles.railLine} />
              <View style={styles.railSquare} />
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <Touchable style={styles.field} activeOpacity={0.8} onPress={() => openField('start')}>
                <Text numberOfLines={1} style={startingPoint ? styles.fieldText : styles.fieldPlaceholder}>{startingPoint || 'Starting point'}</Text>
              </Touchable>
              <Touchable style={styles.field} activeOpacity={0.8} onPress={() => openField('end')}>
                <Text numberOfLines={1} style={endPoint ? styles.fieldText : styles.fieldPlaceholder}>{endPoint || 'End point'}</Text>
              </Touchable>
            </View>
            <IconButton name="swap-vertical" size={40} onPress={swap} accessibilityLabel="Swap start and end" />
          </View>

          {tab === 'add' ? (
            <>
              <Text weight="bold" style={styles.label}>Fare</Text>
              <View style={styles.fareWrap}>
                <Text weight="medium" style={styles.farePrefix}>{CURRENCY_PREFIX}</Text>
                <TextInput
                  value={estimatedFare}
                  onChangeText={onFareChange}
                  onBlur={onFareBlur}
                  placeholder="0.00"
                  placeholderTextColor={Palette.Placeholder}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  style={styles.fareInput}
                />
              </View>

              <Text weight="bold" style={styles.label}>Stops in between</Text>
              {stops.map((stop, i) => (
                <View key={i} style={styles.stopRow}>
                  <TextInput
                    value={stop}
                    onChangeText={(v) => setStops((prev) => prev.map((s, j) => (j === i ? v : s)))}
                    placeholder={`Stop ${i + 1}`}
                    placeholderTextColor={Palette.Placeholder}
                    style={styles.stopInput}
                  />
                  <IconButton name="remove" size={40} onPress={() => setStops((prev) => prev.filter((_, j) => j !== i))} accessibilityLabel="Remove stop" />
                </View>
              ))}
              <PillButton label="Add a stop" icon="add" variant="subtle" onPress={() => setStops((prev) => [...prev, ''])} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
            </>
          ) : (
            <>
              <Text weight="bold" style={styles.label}>Anything else we should know?</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Optional"
                placeholderTextColor={Palette.Placeholder}
                multiline
                textAlignVertical="top"
                style={styles.note}
              />
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <PillButton label={tab === 'add' ? 'Submit route' : 'Send request'} onPress={save} disabled={!canSave} />
        </View>
      </KeyboardAvoidingView>

      {/* Field picker */}
      <Modal visible={!!activeField} transparent animationType="slide" onRequestClose={() => setActiveField(null)}>
        <Pressable style={styles.backdrop} onPress={() => setActiveField(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={styles.handle} />
            <Text weight="bold" style={styles.sheetTitle}>{activeField === 'start' ? 'Starting point' : 'End point'}</Text>
            <View style={styles.sheetSearch}>
              <Icon name="search" size={20} />
              <TextInput
                autoFocus
                value={fieldQuery}
                onChangeText={setFieldQuery}
                onSubmitEditing={() => fieldQuery.trim() && choose(fieldQuery.trim())}
                placeholder="Search for a stop"
                placeholderTextColor={Palette.Placeholder}
                returnKeyType="done"
                style={styles.sheetInput}
              />
            </View>
            {matches.map((m) => (
              <ListRow key={m.id} icon="location-outline" title={m.name} onPress={() => choose(m.name)} />
            ))}
            {fieldQuery.trim().length >= 2 && matches.length === 0 && (
              <ListRow icon="create-outline" title={`Use “${fieldQuery.trim()}”`} subtitle="Not in our stops yet" onPress={() => choose(fieldQuery.trim())} />
            )}
            <ListRow icon="navigate-outline" title="Current location" onPress={() => choose('Current location')} />
            <ListRow icon="map-outline" title="Choose on map" onPress={chooseOnMap} noDivider />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.White },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  tab: { flex: 1, height: 44, borderRadius: Radius.pill, backgroundColor: Palette.Soft, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: Palette.Black },
  tabText: { fontSize: 15, color: Palette.Black },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius.xl, borderWidth: 1, borderColor: Palette.LightGray, marginTop: 8 },
  rail: { width: 14, alignItems: 'center', paddingVertical: 20 },
  railDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Palette.Black },
  railLine: { width: 2, height: 28, backgroundColor: Palette.LightGray, marginVertical: 4 },
  railSquare: { width: 10, height: 10, backgroundColor: Palette.Black },
  field: { height: 48, borderRadius: Radius.md, backgroundColor: Palette.Soft, paddingHorizontal: 14, justifyContent: 'center' },
  fieldText: { fontSize: 16, color: Palette.Black, fontFamily: 'HelveticaNow_Medium' },
  fieldPlaceholder: { fontSize: 16, color: Palette.Placeholder, fontFamily: 'HelveticaNow_Medium' },
  label: { fontSize: 18, lineHeight: 24, color: Palette.Black, marginTop: 24, marginBottom: 10 },
  fareWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, borderRadius: Radius.md, backgroundColor: Palette.Soft, paddingHorizontal: 16 },
  farePrefix: { fontSize: 16, color: Palette.DarkGray },
  fareInput: { flex: 1, fontSize: 16, color: Palette.Black, fontFamily: 'HelveticaNow_Medium', padding: 0 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  stopInput: { flex: 1, height: 48, borderRadius: Radius.md, backgroundColor: Palette.Soft, paddingHorizontal: 14, fontSize: 16, color: Palette.Black, fontFamily: 'HelveticaNow_Medium' },
  note: { minHeight: 120, borderRadius: Radius.md, backgroundColor: Palette.Soft, padding: 14, fontSize: 16, color: Palette.Black, fontFamily: 'HelveticaNow_Regular' },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Palette.Soft, backgroundColor: Palette.White },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: Palette.White, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Palette.LightGray, marginBottom: 14 },
  sheetTitle: { fontSize: 22, lineHeight: 28, color: Palette.Black, marginBottom: 12 },
  sheetSearch: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: Radius.pill, backgroundColor: Palette.Soft, paddingHorizontal: 16, marginBottom: 4 },
  sheetInput: { flex: 1, fontSize: 16, color: Palette.Black, fontFamily: 'HelveticaNow_Medium', padding: 0 },
});
