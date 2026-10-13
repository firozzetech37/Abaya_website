import type { DesignDetail, OptionGroupCode, QuoteBody } from '@abaya/contracts';
import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { EightPointStar, StarPattern } from '../../components/ornament';
import { PressableScale } from '../../components/pressable-scale';
import { Text } from '../../components/text';
import { DesignImage } from '../../components/design-image';
import { PriceBar } from '../../components/price-bar';
import { RedesignSheet } from '../../components/redesign-sheet';
import { EmptyState, ErrorState, InlineError, Skeleton } from '../../components/states';
import { strings } from '../../content/strings';
import { ApiError, errorMessage } from '../../lib/api-client';
import { useAuth } from '../../lib/auth';
import { formatINR } from '../../lib/format';
import { useMeasurements, useToggleWishlist, useWishlist } from '../../lib/queries/account';
import { useAddToCart } from '../../lib/queries/cart';
import { useDesign, useQuote } from '../../lib/queries/catalog';
import {
  defaultOptionIds,
  estimatePrice,
  missingRequiredGroups,
  type RedesignSelection,
  toggleOption,
} from '../../lib/redesign';
import { colors, gold } from '../../lib/theme';
import { useDebouncedValue } from '../../lib/use-debounced-value';

export default function DesignScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const design = useDesign(slug);

  if (design.isPending) return <DesignSkeleton />;
  if (design.isError) {
    const notFound = design.error instanceof ApiError && design.error.status === 404;
    return (
      <View className="flex-1 justify-center bg-background">
        {notFound ? (
          <EmptyState icon="shirt-outline" title={strings.design.notFound} actionLabel={strings.home.shopCta} onAction={() => router.replace('/shop')} />
        ) : (
          <ErrorState message={errorMessage(design.error)} onRetry={() => void design.refetch()} />
        )}
      </View>
    );
  }
  return <DesignView key={design.data.id} design={design.data} />;
}

function DesignSkeleton() {
  return (
    <View className="flex-1 bg-background">
      <Skeleton className="aspect-[3/4] w-full rounded-none" />
      <View className="gap-3 p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-6 w-32" />
      </View>
    </View>
  );
}

function Gallery({ design }: { design: DesignDetail }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const images = design.images.length > 0 ? design.images : [{ url: design.primaryImageUrl ?? '', alt: design.name }];
  return (
    <View>
      <FlatList
        horizontal
        pagingEnabled
        data={images}
        keyExtractor={(img, i) => `${img.url}-${i}`}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => (
          <View style={{ width }} accessibilityLabel={strings.design.gallery(i + 1, images.length)}>
            <DesignImage uri={item.url || null} name={design.name} alt={item.alt} className="aspect-[3/4] w-full" />
          </View>
        )}
      />
      {/* Soft fade from the photo into the page */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(250,249,247,0)', 'rgba(250,249,247,0.9)', colors.background]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 90 }}
      />
      {images.length > 1 ? (
        <View className="absolute bottom-5 w-full flex-row justify-center gap-1.5" importantForAccessibility="no-hide-descendants">
          {images.map((img, i) => (
            <View key={`${img.url}-${i}`} className={`h-1.5 rounded-full ${i === index ? 'w-6 bg-gold-500' : 'w-1.5 bg-accent-900/25'}`} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function DesignView({ design }: { design: DesignDetail }) {
  const { session } = useAuth();
  const signedIn = Boolean(session);
  const sheetRef = useRef<BottomSheetModal>(null);

  const [selection, setSelection] = useState<RedesignSelection>(() => ({
    optionValueIds: defaultOptionIds(design),
    size: null,
  }));
  const [sizeMode, setSizeMode] = useState<'BAND' | 'MEASUREMENTS'>('BAND');
  const [showMissing, setShowMissing] = useState(false);
  const [added, setAdded] = useState(false);

  const profiles = useMeasurements(signedIn);
  const wishlist = useWishlist();
  const toggleWishlist = useToggleWishlist();
  const addToCart = useAddToCart();
  const saved = wishlist.data?.some((w) => w.designId === design.id) ?? false;

  const missing = useMemo(() => missingRequiredGroups(design, selection.optionValueIds), [design, selection.optionValueIds]);
  const estimate = useMemo(() => estimatePrice(design, selection), [design, selection]);

  const body = useMemo<QuoteBody | null>(() => {
    if (missing.length > 0 || !selection.size) return null;
    return {
      designId: design.id,
      selectedOptionValueIds: selection.optionValueIds,
      quantity: 1,
      ...(selection.size.kind === 'BAND'
        ? { sizeBandId: selection.size.sizeBandId }
        : { measurementProfileId: selection.size.measurementProfileId }),
    };
  }, [design.id, missing.length, selection]);
  const debouncedBody = useDebouncedValue(body, 300);
  const quote = useQuote(debouncedBody);
  const quoteIsCurrent =
    body !== null && debouncedBody === body && Boolean(quote.data) && !quote.isPlaceholderData && !quote.isFetching;
  const price = quoteIsCurrent && quote.data ? quote.data.totalInPaise : (estimate?.totalInPaise ?? null);
  const breakdown = quoteIsCurrent && quote.data ? quote.data : estimate;

  const onToggle = useCallback(
    (groupCode: OptionGroupCode, valueId: string) => {
      const group = design.optionGroups.find((g) => g.code === groupCode);
      if (!group) return;
      setAdded(false);
      setSelection((s) => ({ ...s, optionValueIds: toggleOption(design, s.optionValueIds, group, valueId) }));
    },
    [design],
  );

  // Selecting a new profile from "Add measurements" should pick it automatically.
  const profileCount = profiles.data?.length ?? 0;
  const prevCount = useRef(profileCount);
  useEffect(() => {
    const newest = profiles.data?.[profiles.data.length - 1];
    if (profileCount > prevCount.current && newest && sizeMode === 'MEASUREMENTS') {
      setSelection((s) => ({ ...s, size: { kind: 'MEASUREMENTS', measurementProfileId: newest.id } }));
    }
    prevCount.current = profileCount;
  }, [profileCount, profiles.data, sizeMode]);

  let hint: string | null = null;
  if (showMissing && missing.length > 0) hint = strings.design.selectionIncomplete;
  else if (showMissing && !selection.size) hint = strings.design.chooseSize;
  else if (body && quote.isError) hint = errorMessage(quote.error);

  const onAddToBag = useCallback(() => {
    if (!signedIn) {
      router.push('/login');
      return;
    }
    if (!body) {
      setShowMissing(true);
      sheetRef.current?.present();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      return;
    }
    addToCart.mutate(body, {
      onSuccess: () => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        setAdded(true);
        sheetRef.current?.dismiss();
      },
    });
  }, [signedIn, body, addToCart]);

  const chosenNames = design.optionGroups.flatMap((g) =>
    g.values.filter((v) => selection.optionValueIds.includes(v.id)).map((v) => v.name),
  );
  const size = selection.size;
  let sizeText: string = strings.design.chooseSize;
  if (size?.kind === 'BAND') sizeText = design.sizeBands.find((b) => b.id === size.sizeBandId)?.label ?? sizeText;
  if (size?.kind === 'MEASUREMENTS') {
    sizeText = profiles.data?.find((p) => p.id === size.measurementProfileId)?.name ?? strings.design.myMeasurements;
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerRight: () =>
            signedIn ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={saved ? strings.design.wishlistRemove : strings.design.wishlistAdd}
                accessibilityState={{ selected: saved }}
                onPress={() => toggleWishlist.mutate({ designId: design.id, saved })}
                className="h-11 w-11 items-center justify-center rounded-full border border-gold-200 bg-surface/95"
              >
                <Animated.View key={String(saved)} entering={ZoomIn.springify()}>
                  <Ionicons name={saved ? 'heart' : 'heart-outline'} size={21} color={saved ? colors.danger : colors.accent['800']} />
                </Animated.View>
              </Pressable>
            ) : null,
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Gallery design={design} />
        <Animated.View entering={FadeInDown.duration(600)} className="-mt-4 px-5">
          <View className="flex-row items-center gap-2">
            <View className="h-px w-6 bg-gold-400" />
            <EightPointStar size={11} />
            <Text className="text-[11px] font-medium uppercase tracking-[3px] text-accent-700">{strings.styles[design.style]}</Text>
          </View>
          <Text accessibilityRole="header" className="mt-2 font-display text-[40px] leading-[44px] text-foreground">
            {design.name}
          </Text>
          <Text className="mt-2 font-display text-[28px] text-accent-800">{strings.shop.from(formatINR(design.fromPriceInPaise))}</Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            <View className="flex-row items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5">
              <Ionicons name="time-outline" size={14} color={colors.accent['700']} />
              <Text className="text-xs text-neutral-700">{strings.design.leadTime(design.leadTimeDays)}</Text>
            </View>
            {strings.design.perks.map((p) => (
              <View key={p} className="flex-row items-center gap-1.5 rounded-full border border-gold-200 bg-gold-50 px-3 py-1.5">
                <EightPointStar size={10} />
                <Text className="text-xs text-accent-900">{p}</Text>
              </View>
            ))}
          </View>

          {added ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/bag')}
              className="mt-5 flex-row items-center gap-3 rounded-xl bg-accent-50 p-4"
            >
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <Text className="flex-1 text-sm text-foreground">{strings.design.added}</Text>
              <Text className="text-sm font-semibold text-primary">{strings.common.viewBag}</Text>
            </Pressable>
          ) : null}
          {addToCart.isError ? (
            <View className="mt-4">
              <InlineError message={errorMessage(addToCart.error)} />
            </View>
          ) : null}

          {/* Redesign entry: a deep-green card with the gold lattice */}
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`${strings.design.redesign}. ${chosenNames.join(', ')}. ${sizeText}`}
            onPress={() => sheetRef.current?.present()}
            scaleTo={0.98}
            className="mt-7 overflow-hidden rounded-3xl p-5"
          >
            <LinearGradient colors={[colors.accent['700'], colors.accent['900']]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <StarPattern color={gold[300]} opacity={0.1} tile={52} />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 24, borderWidth: 1, borderColor: 'rgba(221,187,107,0.4)' }]} />
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2.5">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-white/10">
                  <Ionicons name="color-palette-outline" size={18} color={gold[200]} />
                </View>
                <Text className="font-display text-[26px] text-white">{strings.design.redesign}</Text>
              </View>
              <View className="h-9 w-9 items-center justify-center rounded-full bg-gold-400">
                <Ionicons name="chevron-up" size={18} color={colors.accent['950']} />
              </View>
            </View>
            <Text className="mt-2 text-sm text-accent-100/85">{strings.design.redesignHint}</Text>
            <View className="mt-4 flex-row flex-wrap gap-1.5">
              {chosenNames.map((n) => (
                <View key={n} className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
                  <Text className="text-xs text-white">{n}</Text>
                </View>
              ))}
              <View className={`rounded-full px-3 py-1 ${selection.size ? 'border border-white/15 bg-white/10' : 'bg-gold-300'}`}>
                <Text className={`text-xs ${selection.size ? 'text-white' : 'font-semibold text-accent-950'}`}>{sizeText}</Text>
              </View>
            </View>
          </PressableScale>

          {breakdown ? (
            <View className="mt-6 rounded-3xl border border-border bg-surface p-5">
              <View className="mb-3 flex-row items-center gap-2">
                <EightPointStar size={11} />
                <Text className="text-[11px] font-semibold uppercase tracking-[2.5px] text-accent-700">{strings.design.breakdown}</Text>
              </View>
              {breakdown.lines.map((l, i) => (
                <View key={`${l.label}-${i}`} className="flex-row justify-between py-1">
                  <Text className="text-sm text-neutral-700">{l.label}</Text>
                  <Text className="text-sm text-neutral-700">
                    {l.kind === 'BASE' ? formatINR(l.amountInPaise) : l.amountInPaise > 0 ? `+${formatINR(l.amountInPaise)}` : strings.design.included}
                  </Text>
                </View>
              ))}
              <View className="mt-3 flex-row items-baseline justify-between border-t border-dashed border-gold-300 pt-3">
                <Text className="text-sm font-semibold text-foreground">
                  {quoteIsCurrent ? strings.design.confirmed : strings.design.estimate}
                </Text>
                <Text className="font-display text-2xl text-accent-900">{formatINR(breakdown.totalInPaise)}</Text>
              </View>
            </View>
          ) : null}

          {design.description ? (
            <View className="mt-7">
              <Text className="mb-2 font-display text-2xl text-foreground">{strings.design.description}</Text>
              <Text className="text-base leading-6 text-neutral-700">{design.description}</Text>
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>

      <PriceBar
        priceInPaise={price}
        confirmed={quoteIsCurrent}
        actionLabel={strings.design.addToBag}
        onAction={onAddToBag}
        loading={addToCart.isPending}
        hint={hint}
      />

      <RedesignSheet
        ref={sheetRef}
        design={design}
        selection={selection}
        sizeMode={sizeMode}
        onSizeModeChange={setSizeMode}
        onToggle={onToggle}
        onSizeChange={(size) => {
          setAdded(false);
          setSelection((s) => ({ ...s, size }));
        }}
        missing={missing}
        showMissing={showMissing}
        priceInPaise={price}
        confirmed={quoteIsCurrent}
        onAddToBag={onAddToBag}
        adding={addToCart.isPending}
        hint={hint}
        profiles={profiles.data ?? []}
        signedIn={signedIn}
        onAddMeasurements={() => {
          sheetRef.current?.dismiss();
          router.push('/measurements/new');
        }}
        onSignIn={() => {
          sheetRef.current?.dismiss();
          router.push('/login');
        }}
      />
    </View>
  );
}
