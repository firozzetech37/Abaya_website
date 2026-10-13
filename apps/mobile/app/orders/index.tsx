import { PRODUCTION_STAGE_LABELS } from '@abaya/contracts';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { EightPointStar } from '../../components/ornament';
import { PressableScale } from '../../components/pressable-scale';
import { Text } from '../../components/text';
import { DesignImage } from '../../components/design-image';
import { EmptyState, ErrorState, ListSkeleton } from '../../components/states';
import { strings } from '../../content/strings';
import { errorMessage } from '../../lib/api-client';
import { formatDate, formatINR } from '../../lib/format';
import { useOrders } from '../../lib/queries/orders';
import { colors } from '../../lib/theme';

export default function OrdersScreen() {
  const orders = useOrders();
  const items = orders.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <FlatList
      className="flex-1 bg-background"
      data={items}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: 20, gap: 14, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={orders.isRefetching && !orders.isFetchingNextPage} onRefresh={() => void orders.refetch()} tintColor={colors.primary} />}
      onEndReached={() => {
        if (orders.hasNextPage && !orders.isFetchingNextPage) void orders.fetchNextPage();
      }}
      renderItem={({ item, index }) => (
        <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 70).duration(500)}>
        <PressableScale
          accessibilityRole="link"
          accessibilityLabel={strings.orders.order(item.orderNumber)}
          onPress={() => router.push(`/orders/${item.orderNumber}`)}
          scaleTo={0.98}
          className="flex-row gap-4 rounded-3xl border border-border bg-surface p-3.5"
        >
          <View style={{ borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: 'hidden' }}>
            <DesignImage uri={item.primaryImageUrl} name={item.orderNumber.replace(/^AB-/, '')} className="h-28 w-20" initialSize="sm" />
          </View>
          <View className="flex-1 justify-center">
            <View className="flex-row items-center gap-1.5">
              <EightPointStar size={10} />
              <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-accent-700">{strings.orders.order('').trim()}</Text>
            </View>
            <Text className="mt-0.5 font-display text-2xl text-foreground">{item.orderNumber}</Text>
            <Text className="text-xs text-muted">
              {strings.orders.placedOn(formatDate(item.placedAt ?? item.createdAt))} · {strings.orders.items(item.itemCount)}
            </Text>
            <View className="mt-2.5 flex-row items-center justify-between gap-2">
              <View className="flex-row items-center gap-1.5 rounded-full border border-gold-200 bg-gold-50 px-3 py-1">
                <View className="h-1.5 w-1.5 rounded-full bg-gold-500" />
                <Text className="text-xs font-medium text-accent-900">
                  {item.status === 'PAID' && item.headlineStage
                    ? PRODUCTION_STAGE_LABELS[item.headlineStage]
                    : strings.orderStatus[item.status]}
                </Text>
              </View>
              <Text className="text-sm font-semibold text-accent-900">{formatINR(item.totalInPaise)}</Text>
            </View>
          </View>
        </PressableScale>
        </Animated.View>
      )}
      ListEmptyComponent={
        orders.isPending ? (
          <ListSkeleton rows={3} />
        ) : orders.isError ? (
          <ErrorState message={errorMessage(orders.error)} onRetry={() => void orders.refetch()} />
        ) : (
          <EmptyState icon="receipt-outline" title={strings.orders.emptyTitle} body={strings.orders.emptyBody} actionLabel={strings.home.shopCta} onAction={() => router.push('/shop')} />
        )
      }
      ListFooterComponent={orders.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null}
    />
  );
}
