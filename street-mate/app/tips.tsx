import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { IconBadge, ScreenHeader, type IconName } from '@/components/ui';
import { Palette } from '@/constants/theme';

// General rider know-how. Fares are negotiated and vary, so these are habits, not prices.
const tips: { icon: IconName; title: string; body: string }[] = [
  { icon: 'chatbubble-ellipses-outline', title: 'Listen for the mate', body: 'The mate calls out the last stop of the route. If you hear your direction, flag the trotro down.' },
  { icon: 'cash-outline', title: 'Ask the fare before you sit', body: 'Fares are set by the driver and change with distance, time of day and traffic. Check the range in StreetMate, then confirm with the mate.' },
  { icon: 'wallet-outline', title: 'Keep small change ready', body: 'Having the exact fare avoids delays and disputes at the end of the ride.' },
  { icon: 'notifications-outline', title: 'Tell the mate your stop early', body: 'Say it a stop or two before, so the driver can pull over safely. StreetMate warns you when you are close.' },
  { icon: 'swap-horizontal-outline', title: 'Check the direction', body: 'The same road has trotros going both ways. Confirm the destination before you get in.' },
  { icon: 'shield-checkmark-outline', title: 'Keep your phone and bag close', body: 'Hold valuables on your lap and keep windows between you and the road when you can.' },
];

export default function TipsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.White }} edges={['top']}>
      <ScreenHeader title="Trotro tips" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {tips.map((t, i) => (
          <View
            key={t.title}
            style={{
              flexDirection: 'row',
              gap: 16,
              paddingVertical: 18,
              borderBottomWidth: i === tips.length - 1 ? 0 : 1,
              borderBottomColor: Palette.Soft,
            }}>
            <IconBadge name={t.icon} size={44} />
            <View style={{ flex: 1 }}>
              <Text weight="bold" style={{ fontSize: 18, lineHeight: 24, color: Palette.Black }}>{t.title}</Text>
              <Text style={{ fontSize: 15, lineHeight: 22, color: Palette.DarkGray, marginTop: 2 }}>{t.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
