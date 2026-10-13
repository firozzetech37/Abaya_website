import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button } from '../../components/button';
import { ListRow } from '../../components/list-row';
import { EightPointStar, GlowingStar, StarPattern } from '../../components/ornament';
import { PressableScale } from '../../components/pressable-scale';
import { ScreenHeader } from '../../components/screen-header';
import { Skeleton } from '../../components/states';
import { Text } from '../../components/text';
import { WhatsAppUpdates } from '../../components/whatsapp-updates';
import { strings } from '../../content/strings';
import { useAuth } from '../../lib/auth';
import { showAlert } from '../../lib/dialog';
import { useMe } from '../../lib/queries/account';
import { colors, gold } from '../../lib/theme';

const a = strings.account;

/** A titled group of rows in a rounded card (gold-star heading). */
function Group({ title, children, delay = 0 }: { title?: string; children: ReactNode; delay?: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(550)} className="mx-5 mt-7">
      {title ? (
        <View className="mb-2.5 flex-row items-center gap-2 px-1">
          <EightPointStar size={10} />
          <Text accessibilityRole="header" className="text-[11px] font-semibold uppercase tracking-[2.5px] text-accent-700">
            {title}
          </Text>
        </View>
      ) : null}
      <View className="overflow-hidden rounded-3xl border border-border bg-surface">{children}</View>
    </Animated.View>
  );
}

const Divider = () => <View className="ml-[68px] h-px bg-border" />;

export default function AccountScreen() {
  const { session, ready, signOut } = useAuth();
  const me = useMe();

  if (ready && !session) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader eyebrow={a.eyebrow} title={a.title} />
        <Animated.View entering={FadeInDown.duration(600)} className="mx-5 mt-6 items-center overflow-hidden rounded-[28px] bg-accent-900 px-6 py-10">
          <StarPattern color={gold[300]} opacity={0.1} tile={56} />
          <GlowingStar size={34} />
          <Text className="mt-4 text-center font-display text-[32px] leading-9 text-white">{a.signedOutTitle}</Text>
          <Text className="mt-2 text-center text-sm leading-5 text-accent-100/85">{a.signedOutBody}</Text>
          <Button label={strings.common.signIn} variant="gold" trailingIcon="arrow-forward" shine onPress={() => router.push('/login')} className="mt-7" />
        </Animated.View>
      </View>
    );
  }

  const confirmSignOut = () =>
    showAlert(a.signOutConfirm, undefined, [
      { text: strings.common.cancel, style: 'cancel' },
      { text: a.signOut, style: 'destructive', onPress: () => void signOut() },
    ]);

  const email = me.data?.email ?? session?.user.email ?? '';
  const name = me.data?.name ?? a.guest;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader eyebrow={a.eyebrow} title={a.title} />
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
        {/* Profile card */}
        <Animated.View entering={FadeInDown.duration(600)} className="mx-5 mt-5 overflow-hidden rounded-[28px] p-5">
          <LinearGradient colors={[colors.accent['700'], colors.accent['900']]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <StarPattern color={gold[300]} opacity={0.1} tile={50} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 28, borderWidth: 1, borderColor: 'rgba(221,187,107,0.35)' }]} />
          <View className="flex-row items-center gap-4">
            <View
              className="h-[72px] w-16 items-center justify-center border border-gold-300 bg-accent-950/40"
              style={{ borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}
            >
              <Text className="font-display text-3xl text-gold-100">{(name || email).charAt(0).toUpperCase()}</Text>
            </View>
            <View className="flex-1">
              {me.isPending ? (
                <>
                  <Skeleton className="h-6 w-36 bg-white/20" />
                  <Skeleton className="mt-2 h-4 w-44 bg-white/20" />
                </>
              ) : (
                <>
                  <Text className="font-display text-[28px] leading-8 text-white">{me.data?.name ? a.greeting(me.data.name) : name}</Text>
                  <Text numberOfLines={1} className="mt-0.5 text-sm text-accent-100/80">
                    {email}
                  </Text>
                  <View className="mt-2 flex-row items-center gap-1.5">
                    <EightPointStar size={10} color={gold[300]} />
                    <Text className="text-[10px] font-medium uppercase tracking-[2px] text-gold-200">{a.memberSince}</Text>
                  </View>
                </>
              )}
            </View>
          </View>
          <PressableScale
            accessibilityRole="button"
            onPress={() => router.push('/orders')}
            className="mt-5 flex-row items-center justify-between rounded-2xl border border-white/15 bg-white/10 px-4 py-3"
          >
            <View className="flex-row items-center gap-3">
              <Ionicons name="receipt-outline" size={18} color={gold[200]} />
              <Text className="font-semibold text-white">{a.orders}</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={gold[200]} />
          </PressableScale>
        </Animated.View>

        <Group title={a.shoppingSection} delay={100}>
          <ListRow icon="receipt-outline" label={a.orders} onPress={() => router.push('/orders')} />
          <Divider />
          <ListRow icon="resize-outline" label={a.measurements} onPress={() => router.push('/measurements')} />
          <Divider />
          <ListRow icon="location-outline" label={a.addresses} onPress={() => router.push('/addresses')} />
          <Divider />
          <ListRow icon="heart-outline" label={a.wishlist} onPress={() => router.push('/wishlist')} />
        </Group>

        {me.data ? (
          <Group title={a.notificationsSection} delay={180}>
            <WhatsAppUpdates me={me.data} />
          </Group>
        ) : null}

        <Group title={a.settingsSection} delay={260}>
          <ListRow icon="shield-checkmark-outline" label={a.privacy} onPress={() => router.push('/privacy')} />
          <Divider />
          <ListRow icon="log-out-outline" label={a.signOut} onPress={confirmSignOut} destructive />
        </Group>
      </ScrollView>
    </View>
  );
}
