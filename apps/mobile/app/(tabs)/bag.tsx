import type { CartItemDto } from '@abaya/contracts';
import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, FadeOutLeft, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../components/text';
import { Button } from '../../components/button';
import { DesignImage } from '../../components/design-image';
import { ScreenHeader } from '../../components/screen-header';
import { EmptyState, ErrorState, InlineError, ListSkeleton } from '../../components/states';
import { strings } from '../../content/strings';
import { errorMessage } from '../../lib/api-client';
import { useAuth } from '../../lib/auth';
import { formatINR } from '../../lib/format';
import { useCart, useRemoveCartItem, useUpdateCartItem } from '../../lib/queries/cart';
import { colors } from '../../lib/theme';

function QtyButton({ icon, label, onPress, disabled }: { icon: 'add' | 'remove'; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={`h-11 w-11 items-center justify-center ${disabled ? 'opacity-30' : 'active:bg-neutral-100'}`}
    >
      <Ionicons name={icon} size={18} color={colors.foreground} />
    </Pressable>
  );
}

function CartRow({ item }: { item: CartItemDto }) {
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();
  const busy = update.isPending || remove.isPending;
  const sizeText =
    item.size.kind === 'BAND' ? strings.bag.sizeBand(item.size.code) : strings.bag.sizeProfile(item.size.profileName);
  const err = update.error ?? remove.error;

  return (
    <Animated.View
      entering={FadeInDown.duration(500)}
      exiting={FadeOutLeft.duration(250)}
      layout={LinearTransition.springify().damping(18)}
      className={`mx-5 mb-4 rounded-3xl border bg-surface p-4 ${item.problem ? 'border-danger' : 'border-border'} ${busy ? 'opacity-60' : ''}`}
    >
      <View className="flex-row gap-3">
        <Link href={`/design/${item.design.slug}`} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={item.design.name}>
            <View style={{ borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: 'hidden' }}>
              <DesignImage uri={item.design.primaryImageUrl} name={item.design.name} className="h-32 w-24" initialSize="sm" />
            </View>
          </Pressable>
        </Link>
        <View className="flex-1">
          <Text className="font-display text-[22px] leading-6 text-foreground" numberOfLines={2}>
            {item.design.name}
          </Text>
          <Text className="mt-1 text-xs text-muted" numberOfLines={3}>
            {item.selectedOptions.map((o) => o.valueName).join(' · ')}
          </Text>
          <Text className="mt-1 text-xs text-muted">{sizeText}</Text>
          <Text className="mt-2 text-lg font-semibold text-accent-800">
            {item.price ? formatINR(item.price.totalInPaise) : '—'}
          </Text>
        </View>
      </View>
      {item.problem ? (
        <View className="mt-3">
          <InlineError message={item.problem} />
        </View>
      ) : null}
      <InlineError message={err ? errorMessage(err) : null} />
      <View className="mt-3 flex-row items-center justify-between">
        <View className="flex-row items-center rounded-full border border-gold-200 bg-sand-50" accessibilityLabel={strings.bag.qty}>
          <QtyButton
            icon="remove"
            label={strings.bag.decrease}
            disabled={busy || item.quantity <= 1}
            onPress={() => update.mutate({ id: item.id, quantity: item.quantity - 1 })}
          />
          <Text className="w-8 text-center text-base text-foreground">{item.quantity}</Text>
          <QtyButton
            icon="add"
            label={strings.bag.increase}
            disabled={busy || item.quantity >= 10}
            onPress={() => update.mutate({ id: item.id, quantity: item.quantity + 1 })}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${strings.common.remove} ${item.design.name}`}
          disabled={busy}
          onPress={() => remove.mutate(item.id)}
          className="min-h-[44px] flex-row items-center gap-1 px-2"
        >
          <Ionicons name="trash-outline" size={18} color={colors.neutral['600']} />
          <Text className="text-sm text-neutral-600">{strings.common.remove}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

export default function BagScreen() {
  const { session, ready } = useAuth();
  const insets = useSafeAreaInsets();
  const cart = useCart();

  if (ready && !session) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader eyebrow={strings.bag.eyebrow} title={strings.bag.title} />
        <EmptyState
          icon="bag-handle-outline"
          title={strings.bag.signedOutTitle}
          body={strings.bag.signedOutBody}
          actionLabel={strings.common.signIn}
          onAction={() => router.push('/login')}
        />
      </View>
    );
  }

  const items = cart.data?.items ?? [];
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader eyebrow={strings.bag.eyebrow} title={strings.bag.title} />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <CartRow item={item} />}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: items.length > 0 ? 24 : 130, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={cart.isRefetching} onRefresh={() => void cart.refetch()} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          cart.isPending ? (
            <ListSkeleton rows={3} />
          ) : cart.isError ? (
            <ErrorState message={errorMessage(cart.error)} onRetry={() => void cart.refetch()} />
          ) : (
            <EmptyState
              icon="bag-handle-outline"
              title={strings.bag.emptyTitle}
              body={strings.bag.emptyBody}
              actionLabel={strings.home.shopCta}
              onAction={() => router.push('/shop')}
            />
          )
        }
      />
      {cart.data && items.length > 0 ? (
        // Sits above the floating tab bar.
        <Animated.View
          entering={FadeInUp.duration(500)}
          className="mx-4 overflow-hidden rounded-3xl border border-gold-200 bg-surface px-5 pt-4"
          style={{ marginBottom: insets.bottom + 92, paddingBottom: 16, shadowColor: colors.accent['900'], shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}
        >
          {!cart.data.canCheckout ? <Text className="mb-2 text-xs text-danger">{strings.bag.notReady}</Text> : null}
          <View className="mb-3 flex-row items-baseline justify-between">
            <Text className="text-base text-foreground">{strings.bag.subtotal}</Text>
            <Text className="font-display text-3xl text-accent-900">{formatINR(cart.data.subtotalInPaise)}</Text>
          </View>
          <Text className="mb-3 text-xs text-muted">{strings.bag.shippingNote}</Text>
          <Button
            label={strings.bag.checkout}
            disabled={!cart.data.canCheckout}
            trailingIcon="lock-closed"
            shine
            onPress={() => router.push('/checkout')}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
