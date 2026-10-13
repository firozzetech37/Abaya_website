import { PRODUCTION_STAGE_LABELS } from '@abaya/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Text } from '../../components/text';
import { DesignImage } from '../../components/design-image';
import { StageTimeline } from '../../components/stage-timeline';
import { ErrorState, ListSkeleton } from '../../components/states';
import { strings } from '../../content/strings';
import { errorMessage } from '../../lib/api-client';
import { useAuth } from '../../lib/auth';
import { formatDate, formatINR } from '../../lib/format';
import { useOrder } from '../../lib/queries/orders';
import { colors } from '../../lib/theme';

export default function OrderScreen() {
  const { orderNumber } = useLocalSearchParams<{ orderNumber: string }>();
  const { session, ready } = useAuth();
  const order = useOrder(orderNumber);

  // Deep links (abaya://orders/AB-…) may arrive signed out.
  useEffect(() => {
    if (ready && !session) router.push('/login');
  }, [ready, session]);

  if (!session || order.isPending) return <ListSkeleton rows={4} />;
  if (order.isError) return <ErrorState message={errorMessage(order.error)} onRetry={() => void order.refetch()} />;
  const o = order.data;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={order.isRefetching} onRefresh={() => void order.refetch()} tintColor={colors.primary} />}
    >
      <Stack.Screen options={{ title: o.orderNumber }} />
      <View>
        <Text className="text-sm text-muted">{strings.orders.placedOn(formatDate(o.placedAt ?? o.createdAt))}</Text>
        <View className="mt-2 self-start rounded-full bg-accent-50 px-3 py-1">
          <Text className="text-sm font-medium text-primary">{strings.orderStatus[o.status]}</Text>
        </View>
      </View>

      {o.shipments.map((s) => (
        <View key={s.id} className="gap-2 rounded-3xl border border-border bg-surface p-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="cube-outline" size={20} color={colors.primary} />
            <Text className="text-base font-semibold text-foreground">{strings.orders.shipment}</Text>
          </View>
          {s.carrier && s.trackingNumber ? (
            <Text className="text-sm text-neutral-700">{strings.orders.trackingNumber(s.carrier, s.trackingNumber)}</Text>
          ) : null}
          {s.trackingUrl ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(s.trackingUrl ?? '')}
              className="min-h-[44px] flex-row items-center gap-1"
            >
              <Text className="text-base font-medium text-primary">{strings.orders.track}</Text>
              <Ionicons name="open-outline" size={16} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>
      ))}

      {o.items.map((item) => (
        <View key={item.id} className="rounded-3xl border border-border bg-surface p-4">
          <View className="flex-row gap-3">
            <DesignImage uri={item.design.primaryImageUrl} name={item.design.name} className="h-28 w-20 rounded-lg" initialSize="sm" />
            <View className="flex-1">
              <Text className="text-base font-semibold text-foreground">
                {item.design.name}
                {item.quantity > 1 ? ` × ${item.quantity}` : ''}
              </Text>
              <Text className="mt-1 text-xs text-muted">{item.options.map((op) => op.valueName).join(' · ')}</Text>
              <Text className="mt-1 text-xs text-muted">
                {item.measurements ? strings.orders.measured : strings.orders.size(item.sizeBandCode)}
              </Text>
              <Text className="mt-2 text-sm font-medium text-primary">{PRODUCTION_STAGE_LABELS[item.stage]}</Text>
            </View>
          </View>
          <Text className="mb-3 mt-5 text-sm font-semibold uppercase tracking-widest text-muted">{strings.orders.progress}</Text>
          <StageTimeline stage={item.stage} events={item.stageEvents} />
        </View>
      ))}

      <View className="rounded-3xl border border-border bg-surface p-4">
        <Text className="mb-2 text-sm font-semibold text-foreground">{strings.orders.deliverTo}</Text>
        <Text className="text-sm text-neutral-700">{o.shippingAddress.fullName}</Text>
        <Text className="text-sm text-neutral-700">
          {[o.shippingAddress.line1, o.shippingAddress.line2, o.shippingAddress.city, o.shippingAddress.pincode].filter(Boolean).join(', ')}
        </Text>
      </View>

      <View className="rounded-3xl border border-border bg-surface p-4">
        <Text className="mb-2 text-sm font-semibold text-foreground">{strings.orders.summary}</Text>
        <Row label={strings.orders.subtotal} value={formatINR(o.subtotalInPaise)} />
        <Row label={strings.orders.shipping} value={o.shippingInPaise === 0 ? strings.orders.free : formatINR(o.shippingInPaise)} />
        {o.discountInPaise > 0 ? <Row label={strings.orders.discount} value={`−${formatINR(o.discountInPaise)}`} /> : null}
        <View className="mt-2 border-t border-border pt-2">
          <Row label={strings.orders.total} value={formatINR(o.totalInPaise)} bold />
        </View>
      </View>
      <Text className="text-center text-xs text-muted">{strings.orders.help}</Text>
    </ScrollView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View className="flex-row justify-between py-1">
      <Text className={`text-sm ${bold ? 'font-semibold text-foreground' : 'text-neutral-700'}`}>{label}</Text>
      <Text className={`text-sm ${bold ? 'font-semibold text-foreground' : 'text-neutral-700'}`}>{value}</Text>
    </View>
  );
}
