import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Text } from '../components/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddressForm, formatAddress } from '../components/address-form';
import { Button } from '../components/button';
import { DesignImage } from '../components/design-image';
import { PushPromptAfterOrder } from '../components/push-prompt';
import { EmptyState, ErrorState, InlineError, ListSkeleton } from '../components/states';
import { TextField } from '../components/text-field';
import { strings } from '../content/strings';
import { errorMessage } from '../lib/api-client';
import { useAuth } from '../lib/auth';
import { formatINR } from '../lib/format';
import { useAddresses, useMe } from '../lib/queries/account';
import { useCart } from '../lib/queries/cart';
import { type CheckoutResult, useCheckout, usePaymentConfig, useSimulatePayment, useVerifyPayment } from '../lib/queries/orders';
import { getRazorpay } from '../lib/razorpay';
import { colors } from '../lib/theme';

type Step = 'address' | 'review' | 'success';

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { session, ready } = useAuth();
  const me = useMe();
  const cart = useCart();
  const addresses = useAddresses();
  const checkout = useCheckout();
  const verify = useVerifyPayment();
  const simulate = useSimulatePayment();
  const paymentConfig = usePaymentConfig();
  const razorpay = getRazorpay();

  const [step, setStep] = useState<Step>('address');
  const [addressId, setAddressId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');
  const [order, setOrder] = useState<CheckoutResult | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const testMode = paymentConfig.data?.mode === 'test' || order?.paymentMode === 'test';

  useEffect(() => {
    if (ready && !session) router.replace('/login');
  }, [ready, session]);

  // Pre-select the default (or only) address.
  useEffect(() => {
    if (addressId || !addresses.data?.length) return;
    setAddressId((addresses.data.find((a) => a.isDefault) ?? addresses.data[0])?.id ?? null);
  }, [addresses.data, addressId]);

  const address = addresses.data?.find((a) => a.id === addressId) ?? null;

  const pay = async () => {
    if (!address) return;
    setPayError(null);
    setPaying(true);
    try {
      // Re-use the order if the customer is retrying a failed/cancelled payment.
      const result = order ?? (await checkout.mutateAsync({ addressId: address.id, customerNote: note.trim() || undefined }));
      setOrder(result);
      if (result.paymentMode === 'test') {
        // Development test mode: no Razorpay; the API marks the order paid.
        await simulate.mutateAsync(result.orderNumber);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        setStep('success');
        return;
      }
      if (!razorpay) {
        setPayError(strings.checkout.paymentsNeedDevBuild);
        return;
      }
      const payment = await razorpay.open({
        key: result.razorpay.keyId,
        order_id: result.razorpay.orderId,
        amount: result.razorpay.amount,
        currency: result.razorpay.currency,
        name: strings.appName,
        description: strings.orders.order(result.orderNumber),
        prefill: { name: address.fullName, email: me.data?.email ?? undefined, contact: address.phone },
        theme: { color: colors.primary },
      });
      await verify.mutateAsync({
        razorpayOrderId: payment.razorpay_order_id ?? result.razorpay.orderId,
        razorpayPaymentId: payment.razorpay_payment_id,
        razorpaySignature: payment.razorpay_signature ?? '',
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setStep('success');
    } catch (e) {
      // Razorpay rejects with { code, description } when the sheet is closed or payment fails.
      const description =
        typeof e === 'object' && e !== null && 'description' in e && typeof e.description === 'string'
          ? e.description
          : null;
      setPayError(description ? `${strings.checkout.paymentCancelled} (${description})` : errorMessage(e));
    } finally {
      setPaying(false);
    }
  };

  if (step === 'success' && order) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 24, paddingBottom: insets.bottom + 24 }}
      >
        <Stack.Screen options={{ headerBackVisible: false, gestureEnabled: false, title: '' }} />
        <View className="h-20 w-20 items-center justify-center rounded-full bg-accent-50">
          <Ionicons name="checkmark" size={40} color={colors.primary} />
        </View>
        <Text accessibilityRole="header" className="mt-6 font-display text-4xl text-foreground">
          {strings.checkout.successTitle}
        </Text>
        <Text className="mt-3 text-center text-base text-neutral-700">{strings.checkout.successBody(order.orderNumber)}</Text>
        <Button label={strings.checkout.viewOrder} onPress={() => router.replace(`/orders/${order.orderNumber}`)} className="mt-8 w-full" />
        <Button label={strings.checkout.keepShopping} variant="ghost" onPress={() => router.replace('/')} className="mt-2 w-full" />
        <PushPromptAfterOrder />
      </ScrollView>
    );
  }

  if (cart.isPending || addresses.isPending) return <ListSkeleton rows={3} />;
  if (cart.isError) return <ErrorState message={errorMessage(cart.error)} onRetry={() => void cart.refetch()} />;
  if (cart.data.items.length === 0) {
    return <EmptyState icon="bag-handle-outline" title={strings.checkout.emptyBag} actionLabel={strings.home.shopCta} onAction={() => router.replace('/shop')} />;
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      {/* Stepper */}
      <View className="flex-row gap-2 px-4 pb-2 pt-1">
        {(['address', 'review'] as const).map((s, i) => {
          const on = step === s;
          return (
            <View key={s} className="flex-1">
              <View className={`h-1 rounded-full ${on || (s === 'address' && step === 'review') ? 'bg-primary' : 'bg-neutral-200'}`} />
              <Text className={`mt-1 text-xs ${on ? 'font-semibold text-foreground' : 'text-muted'}`}>
                {i + 1}. {s === 'address' ? strings.checkout.stepAddress : strings.checkout.stepReview}
              </Text>
            </View>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {step === 'address' ? (
          <>
            {addresses.data?.map((a) => {
              const on = a.id === addressId;
              return (
                <Pressable
                  key={a.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    setAddressId(a.id);
                    setOrder(null);
                  }}
                  className={`flex-row gap-3 rounded-xl border p-4 ${on ? 'border-primary bg-accent-50' : 'border-border bg-surface'}`}
                >
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.primary : colors.neutral['400']} />
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-foreground">{a.fullName}</Text>
                    <Text className="mt-1 text-sm text-neutral-700">{formatAddress(a)}</Text>
                    <Text className="mt-1 text-sm text-muted">{a.phone}</Text>
                  </View>
                </Pressable>
              );
            })}
            {adding || addresses.data?.length === 0 ? (
              <View className="rounded-3xl border border-border bg-surface p-4">
                <Text className="mb-4 font-display text-2xl text-foreground">{strings.checkout.addNew}</Text>
                <AddressForm
                  defaultChecked={addresses.data?.length === 0}
                  onSaved={(a) => {
                    setAddressId(a.id);
                    setAdding(false);
                    setOrder(null);
                  }}
                />
              </View>
            ) : (
              <Button label={strings.checkout.addNew} variant="secondary" size="md" onPress={() => setAdding(true)} />
            )}
          </>
        ) : (
          <>
            <View className="rounded-3xl border border-border bg-surface p-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-foreground">{strings.checkout.deliverTo}</Text>
                <Pressable accessibilityRole="button" onPress={() => setStep('address')} className="min-h-[44px] justify-center px-2">
                  <Text className="text-sm font-medium text-primary">{strings.checkout.change}</Text>
                </Pressable>
              </View>
              {address ? (
                <>
                  <Text className="text-base text-foreground">{address.fullName}</Text>
                  <Text className="text-sm text-neutral-700">{formatAddress(address)}</Text>
                </>
              ) : null}
            </View>

            <View className="rounded-3xl border border-border bg-surface p-4">
              <Text className="mb-2 text-sm font-semibold text-foreground">{strings.checkout.items}</Text>
              {cart.data.items.map((item, i) => (
                <View key={item.id} className={`flex-row gap-3 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <DesignImage uri={item.design.primaryImageUrl} name={item.design.name} className="h-20 w-14 rounded-md" initialSize="sm" />
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-foreground">
                      {item.design.name} × {item.quantity}
                    </Text>
                    <Text className="text-xs text-muted" numberOfLines={2}>
                      {item.selectedOptions.map((o) => o.valueName).join(' · ')}
                    </Text>
                  </View>
                  <Text className="text-sm text-foreground">{item.price ? formatINR(item.price.totalInPaise) : '—'}</Text>
                </View>
              ))}
            </View>

            <TextField
              label={strings.checkout.note}
              placeholder={strings.checkout.notePlaceholder}
              value={note}
              onChangeText={(t) => {
                setNote(t);
                setOrder(null);
              }}
              maxLength={300}
              multiline
            />

            {testMode ? (
              <View className="flex-row gap-2 rounded-lg bg-warning/10 p-3">
                <Ionicons name="flask-outline" size={18} color={colors.warning} />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-neutral-900">{strings.checkout.testModeTitle}</Text>
                  <Text className="mt-1 text-sm text-neutral-800">{strings.checkout.testModeBody}</Text>
                </View>
              </View>
            ) : null}
            {!cart.data.canCheckout ? <InlineError message={strings.bag.notReady} /> : null}
            <InlineError message={payError} />
          </>
        )}
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom + 12 }} className="border-t border-border bg-surface px-4 pt-3">
        <View className="mb-3 flex-row items-baseline justify-between">
          <Text className="text-base text-foreground">{strings.checkout.total}</Text>
          <Text className="text-xl font-semibold text-foreground">
            {formatINR(order?.totalInPaise ?? cart.data.subtotalInPaise)}
          </Text>
        </View>
        {step === 'address' ? (
          <Button label={strings.checkout.useAddress} disabled={!address || adding} onPress={() => setStep('review')} />
        ) : (
          <Button
            label={
              verify.isPending
                ? strings.checkout.verifying
                : paying
                  ? strings.checkout.paying
                  : testMode
                    ? strings.checkout.simulatePay(formatINR(order?.totalInPaise ?? cart.data.subtotalInPaise))
                    : strings.checkout.pay(formatINR(order?.totalInPaise ?? cart.data.subtotalInPaise))
            }
            loading={paying}
            disabled={!address || (!cart.data.canCheckout && !order)}
            onPress={() => void pay()}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
