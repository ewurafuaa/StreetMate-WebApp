import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { Icon, ListRow, PillButton, ScreenHeader, type IconName } from '@/components/ui';
import { Palette, Radius } from '@/constants/theme';
import { useSavedPlaces, type SavedPlace } from '@/contexts/saved-places';

const ICONS: Record<SavedPlace['icon'], IconName> = { home: 'home-outline', work: 'briefcase-outline', star: 'star-outline' };

export default function SavedPlacesScreen() {
  const insets = useSafeAreaInsets();
  const { places, removePlace, updatePlace } = useSavedPlaces();
  const [active, setActive] = useState<SavedPlace | null>(null);
  const [renameTarget, setRenameTarget] = useState<SavedPlace | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const edit = (place: SavedPlace) => router.push({ pathname: '/add-place', params: { id: place.id, mode: 'location' } });

  const getThere = (place: SavedPlace) =>
    router.push({
      pathname: '/map',
      params: { destination: place.label, destLat: String(place.lat), destLng: String(place.lng) },
    });

  const saveName = () => {
    const trimmed = renameValue.trim();
    if (renameTarget && trimmed) updatePlace(renameTarget.id, { label: trimmed });
    setRenameTarget(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Saved places" onBack={() => router.replace('/')} />

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {places.map((place) => {
          const hasAddress = place.address.trim().length > 0;
          return (
            <ListRow
              key={place.id}
              icon={ICONS[place.icon]}
              title={hasAddress ? place.label : `Add ${place.label.toLowerCase()}`}
              subtitle={hasAddress ? place.address : 'Tap to choose a spot'}
              onPress={() => (hasAddress ? setActive(place) : edit(place))}
              right={<Icon name="chevron-forward" size={20} color={Palette.Placeholder} />}
            />
          );
        })}
        <ListRow icon="add" title="Add a place" onPress={() => router.push('/add-place')} noDivider />
      </ScrollView>

      {/* Action sheet */}
      <Modal visible={!!active} transparent animationType="slide" onRequestClose={() => setActive(null)}>
        <Pressable style={styles.backdrop} onPress={() => setActive(null)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.handle} />
          <Text weight="bold" style={styles.sheetTitle} numberOfLines={1}>{active?.label}</Text>
          <Text style={styles.sheetSub} numberOfLines={2}>{active?.address}</Text>

          {active?.lat != null && (
            <ListRow icon="navigate-outline" title="Get there by trotro" onPress={() => { const p = active; setActive(null); if (p) getThere(p); }} />
          )}
          {active?.icon === 'star' && (
            <ListRow icon="pencil-outline" title="Edit name" onPress={() => { const p = active; setActive(null); setRenameValue(p?.label ?? ''); setRenameTarget(p); }} />
          )}
          <ListRow icon="location-outline" title="Edit location" onPress={() => { const p = active; setActive(null); if (p) edit(p); }} />
          <ListRow icon="trash-outline" title="Delete" noDivider onPress={() => { const p = active; setActive(null); if (p) removePlace(p.id); }} />
        </View>
      </Modal>

      {/* Rename */}
      <Modal visible={!!renameTarget} transparent animationType="slide" onRequestClose={() => setRenameTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => setRenameTarget(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={styles.handle} />
            <Text weight="bold" style={styles.sheetTitle}>Edit name</Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              selectTextOnFocus
              placeholder="e.g. School"
              placeholderTextColor={Palette.Placeholder}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={saveName}
            />
            <PillButton label="Save" onPress={saveName} disabled={!renameValue.trim()} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.White },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: Palette.White, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Palette.LightGray, marginBottom: 14 },
  sheetTitle: { fontSize: 22, lineHeight: 28, color: Palette.Black },
  sheetSub: { fontSize: 14, lineHeight: 20, color: Palette.DarkGray, marginBottom: 8 },
  input: { height: 52, borderRadius: Radius.md, backgroundColor: Palette.Soft, paddingHorizontal: 16, fontSize: 16, color: Palette.Black, fontFamily: 'HelveticaNow_Medium', marginVertical: 14 },
});
