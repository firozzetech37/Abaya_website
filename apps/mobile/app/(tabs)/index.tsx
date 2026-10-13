import type { CollectionDto, DesignCard as DesignCardDto } from '@abaya/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  FadeInDown,
  FadeInUp,
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button } from '../../components/button';
import { DesignCard } from '../../components/design-card';
import { DesignImage } from '../../components/design-image';
import { EightPointStar, GlowingStar, StarDivider, StarPattern } from '../../components/ornament';
import { PressableScale } from '../../components/pressable-scale';
import { SectionHeading } from '../../components/screen-header';
import { ErrorState, Skeleton } from '../../components/states';
import { Text } from '../../components/text';
import { strings } from '../../content/strings';
import { errorMessage } from '../../lib/api-client';
import { useCart } from '../../lib/queries/cart';
import { useCollections, useDesigns } from '../../lib/queries/catalog';
import { colors, gold } from '../../lib/theme';

const h = strings.home;
/** Collection tiles take turns in these tones, as on the website. */
const TONES: { from: string; to: string; fg: string; sub: string; pill: string; star: string }[] = [
  { from: colors.accent['700'], to: colors.accent['950'], fg: '#fff', sub: 'rgba(213,236,231,0.85)', pill: 'rgba(255,255,255,0.12)', star: gold[300] },
  { from: '#F5EFE5', to: '#E3D3B8', fg: colors.neutral['900'], sub: colors.neutral['600'], pill: 'rgba(255,255,255,0.6)', star: gold[600] },
  { from: colors.neutral['700'], to: colors.neutral['950'], fg: '#fff', sub: colors.neutral['300'], pill: 'rgba(255,255,255,0.12)', star: gold[300] },
  { from: colors.accent['50'], to: colors.accent['200'], fg: colors.accent['950'], sub: colors.accent['800'], pill: 'rgba(255,255,255,0.6)', star: gold[600] },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const collections = useCollections();
  const designs = useDesigns({ sort: 'newest' }, 8);
  const cart = useCart();
  const scrollRef = useRef<ScrollView>(null);
  const [howY, setHowY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const count = cart.data?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([collections.refetch(), designs.refetch()]);
    setRefreshing(false);
  }, [collections, designs]);

  const newDesigns = designs.data?.pages.flatMap((p) => p.items) ?? [];
  const failed = collections.isError && designs.isError;

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: 130 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ───── Hero ───── */}
      <View style={{ paddingTop: insets.top + 10 }} className="overflow-hidden bg-sand-50 pb-8">
        <StarPattern color={colors.accent['700']} opacity={0.06} tile={70} />
        <View className="absolute -right-24 -top-20 h-80 w-80 rounded-full bg-accent-100/70" />
        <View className="absolute -left-28 top-72 h-72 w-72 rounded-full bg-sand-200/80" />

        {/* Brand bar */}
        <View className="flex-row items-center justify-between px-5 pb-2">
          <View className="flex-row items-center gap-2">
            <EightPointStar size={22} color={colors.accent['700']} />
            <Text className="font-display text-[28px] text-foreground">{strings.appName}</Text>
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={h.bagLabel(count)}
            onPress={() => router.push('/bag')}
            className="h-11 w-11 items-center justify-center rounded-full border border-border bg-surface/90"
          >
            <Ionicons name="bag-handle-outline" size={20} color={colors.accent['800']} />
            {count > 0 ? (
              <View className="absolute -right-0.5 -top-0.5 h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold-400 px-1">
                <Text className="text-[10px] font-bold text-accent-950">{count}</Text>
              </View>
            ) : null}
          </PressableScale>
        </View>

        <View className="px-5 pt-6">
          <Animated.View entering={FadeInDown.duration(600)} className="flex-row items-center gap-2">
            <View className="h-px w-7 bg-gold-400" />
            <EightPointStar size={12} />
            <Text className="text-[11px] font-medium uppercase tracking-[3px] text-accent-700">{h.eyebrow}</Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(120).duration(700)}>
            <Text accessibilityRole="header" className="mt-4 font-display text-[46px] leading-[50px] text-foreground">
              {h.heroTitle.before}
              <Text className="font-display italic text-accent-700">{h.heroTitle.emphasis}</Text>
              {h.heroTitle.after}
            </Text>
            <Svg width={92} height={10} viewBox="0 0 120 12" style={{ marginTop: 4 }}>
              <Path d="M2 9C30 3 70 2 118 6" fill="none" stroke={gold[400]} strokeWidth={2.5} strokeLinecap="round" />
            </Svg>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(240).duration(700)}>
            <Text className="mt-4 text-base leading-6 text-neutral-700">{h.subtitle}</Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(360).duration(700)} className="mt-7 flex-row flex-wrap gap-3">
            <Button label={h.shopCta} trailingIcon="arrow-forward" shine onPress={() => router.push('/shop')} />
            <Button
              label={h.heroSecondary}
              variant="secondary"
              onPress={() => scrollRef.current?.scrollTo({ y: howY - 20, animated: true })}
            />
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(480).duration(700)} className="mt-6 flex-row flex-wrap items-center gap-x-3 gap-y-1">
            {h.heroPoints.map((p, i) => (
              <View key={p} className="flex-row items-center gap-3">
                {i > 0 ? <View className="h-1 w-1 rounded-full bg-gold-400" /> : null}
                <Text className="font-display text-lg italic text-neutral-700">{p}</Text>
              </View>
            ))}
          </Animated.View>
        </View>

        {/* Featured arches carousel */}
        <View className="mt-8">
          {designs.isPending ? (
            <View className="flex-row justify-center gap-4">
              <Skeleton className="h-64 w-40 rounded-t-full rounded-b-2xl" />
              <Skeleton className="h-72 w-48 rounded-t-full rounded-b-2xl" />
            </View>
          ) : newDesigns.length > 0 ? (
            <ArchCarousel designs={newDesigns.slice(0, 6)} />
          ) : null}
        </View>
      </View>

      {/* ───── Trust ───── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 12 }}>
        {h.trustCards.map((t, i) => (
          <Animated.View
            key={t.title}
            entering={FadeInUp.delay(i * 110).duration(600)}
            className="w-56 flex-row items-start gap-3 rounded-2xl border border-border bg-surface p-4"
          >
            <View
              className="h-12 w-10 items-center justify-center bg-accent-50"
              style={{ borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}
            >
              <Ionicons name={t.icon} size={18} color={colors.accent['700']} />
            </View>
            <View className="flex-1">
              <Text className="font-display text-xl leading-6 text-foreground">{t.title}</Text>
              <Text className="mt-1 text-xs leading-4 text-neutral-600">{t.body}</Text>
            </View>
          </Animated.View>
        ))}
      </ScrollView>

      {failed ? (
        <ErrorState message={errorMessage(designs.error)} onRetry={onRefresh} />
      ) : (
        <>
          {/* ───── Collections ───── */}
          <StarDivider style={{ marginTop: 8, marginBottom: 24 }} />
          <SectionHeading eyebrow={h.collectionsEyebrow} title={h.collections} />
          <Text className="-mt-2 mb-4 px-5 text-sm text-neutral-600">{h.collectionsBody}</Text>
          {collections.isPending ? (
            <View className="flex-row gap-3 px-5">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-[292px] w-[210px] rounded-t-full rounded-b-3xl" />
              ))}
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={TILE_W + 16}
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: 20, gap: 16, paddingBottom: 8 }}
            >
              {(collections.data ?? []).map((c, i) => (
                <Animated.View key={c.id} entering={FadeInDown.delay(i * 90).duration(600)}>
                  <CollectionTile collection={c} tone={TONES[i % TONES.length]!} />
                </Animated.View>
              ))}
            </ScrollView>
          )}

          {/* ───── New designs ───── */}
          <View className="mt-12">
            <SectionHeading
              eyebrow={h.newEyebrow}
              title={h.newDesigns}
              right={
                <PressableScale accessibilityRole="link" onPress={() => router.push('/shop')} hitSlop={12} className="min-h-[44px] flex-row items-end gap-1 pb-1">
                  <Text className="text-sm font-semibold text-accent-700">{strings.common.seeAll}</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.accent['700']} />
                </PressableScale>
              }
            />
            {designs.isPending ? (
              <View className="flex-row justify-between px-5">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="aspect-[3/4] w-[47%] rounded-t-full rounded-b-2xl" />
                ))}
              </View>
            ) : (
              <View className="flex-row flex-wrap justify-between gap-y-8 px-5">
                {newDesigns.slice(0, 6).map((d, i) => (
                  <DesignCard key={d.id} design={d} index={i} className="w-[47%]" />
                ))}
              </View>
            )}
          </View>
        </>
      )}

      {/* ───── How it works ───── */}
      <View onLayout={(e) => setHowY(e.nativeEvent.layout.y)} className="mt-14 overflow-hidden bg-accent-900 py-14">
        <StarPattern color={gold[300]} opacity={0.09} tile={80} />
        <View className="absolute -right-32 -top-10 h-80 w-80 rounded-full bg-accent-700/40" />
        <SectionHeading eyebrow={h.howEyebrow} title={h.howItWorks} light />
        <Text className="-mt-2 px-5 text-sm leading-5 text-accent-100/85">{h.howBody}</Text>
        <View className="mt-8 gap-4 px-5">
          {h.steps.map((s, i) => (
            <Animated.View key={s.title} entering={FadeInDown.delay(i * 120).duration(600)} className="flex-row gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <View
                className="h-14 w-12 items-center justify-center border border-gold-300/60 bg-accent-800"
                style={{ borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}
              >
                <Text className="font-display text-2xl text-gold-200">{i + 1}</Text>
              </View>
              <View className="flex-1">
                <Text className="font-display text-2xl text-white">{s.title}</Text>
                <Text className="mt-1 text-sm leading-5 text-accent-100/85">{s.body}</Text>
              </View>
            </Animated.View>
          ))}
        </View>
      </View>

      {/* ───── Closing ───── */}
      <View className="mx-5 mt-12 items-center overflow-hidden rounded-[28px] border border-border bg-sand-100 px-6 py-12">
        <StarPattern color={colors.accent['700']} opacity={0.06} tile={56} />
        <View className="absolute -bottom-6 h-64 w-52 border border-accent-700/10" style={{ borderTopLeftRadius: 999, borderTopRightRadius: 999 }} />
        <GlowingStar size={30} />
        <Text className="mt-3 text-[11px] font-medium uppercase tracking-[3px] text-accent-700">{h.closingEyebrow}</Text>
        <Text className="mt-3 text-center font-display text-[34px] leading-10 text-foreground">{h.closingTitle}</Text>
        <Text className="mt-3 text-center text-sm leading-5 text-neutral-700">{h.closingBody}</Text>
        <Button label={h.closingCta} variant="gold" trailingIcon="arrow-forward" shine className="mt-7" onPress={() => router.push('/shop')} />
      </View>
    </ScrollView>
  );
}

const TILE_W = 210;
const TILE_H = 292;
const ARCH = { borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 } as const;

/** A collection as a tall arch: tone gradient, gold lattice and outline, a crowning star. */
function CollectionTile({ collection: c, tone }: { collection: CollectionDto; tone: (typeof TONES)[number] }) {
  return (
    <PressableScale
      accessibilityRole="link"
      accessibilityLabel={`${c.name}, ${h.collectionCount(c.designCount)}`}
      onPress={() => router.push({ pathname: '/shop', params: { collection: c.slug } })}
      scaleTo={0.96}
      style={{
        width: TILE_W,
        height: TILE_H,
        ...ARCH,
        overflow: 'hidden',
        shadowColor: colors.accent['950'],
        shadowOpacity: 0.22,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 12 },
        elevation: 6,
      }}
    >
      <LinearGradient colors={[tone.from, tone.to]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <StarPattern color={tone.fg} opacity={0.07} tile={46} />
      {/* Gold arch outline, inset */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 9, left: 9, right: 9, bottom: 9, ...ARCH, borderWidth: 1, borderColor: 'rgba(221,187,107,0.6)' }} />
      {/* A large faint star crowning the arch */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 34, left: 0, right: 0, alignItems: 'center', opacity: 0.55 }}>
        <EightPointStar size={58} color={tone.star} />
      </View>

      <View className="flex-1 justify-end px-5 pb-5">
        <Text className="text-[10px] font-semibold uppercase tracking-[2.5px]" style={{ color: tone.star }}>
          {h.collections}
        </Text>
        <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75} className="mt-1 font-display text-[27px] leading-[30px]" style={{ color: tone.fg }}>
          {c.name}
        </Text>
        {c.description ? (
          <Text numberOfLines={2} className="mt-1.5 text-xs leading-4" style={{ color: tone.sub }}>
            {c.description}
          </Text>
        ) : null}
        <View className="mt-4 flex-row items-center justify-between">
          <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: tone.pill }}>
            <Text className="text-[11px] font-medium" style={{ color: tone.fg }}>
              {h.collectionCount(c.designCount)}
            </Text>
          </View>
          <View className="h-9 w-9 items-center justify-center rounded-full bg-gold-400">
            <Ionicons name="arrow-forward" size={16} color={colors.accent['950']} />
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

/** Featured designs as arches: the centre one is large, its neighbours smaller and dimmer. */
function ArchCarousel({ designs }: { designs: DesignCardDto[] }) {
  const { width } = useWindowDimensions();
  const itemW = Math.min(width * 0.58, 260);
  const gap = 14;
  const snap = itemW + gap;
  const side = (width - itemW) / 2;
  const x = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });
  return (
    <Animated.FlatList
      horizontal
      data={designs}
      keyExtractor={(d) => d.id}
      showsHorizontalScrollIndicator={false}
      snapToInterval={snap}
      decelerationRate="fast"
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{ paddingHorizontal: side, gap, paddingVertical: 12 }}
      accessibilityLabel={strings.home.featured}
      renderItem={({ item, index }) => <ArchSlide design={item} index={index} x={x} width={itemW} snap={snap} />}
    />
  );
}

function ArchSlide({ design, index, x, width, snap }: { design: DesignCardDto; index: number; x: SharedValue<number>; width: number; snap: number }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(x.value / snap - index);
    return {
      transform: [{ scale: interpolate(d, [0, 1], [1, 0.84], Extrapolation.CLAMP) }, { translateY: interpolate(d, [0, 1], [0, 18], Extrapolation.CLAMP) }],
      opacity: interpolate(d, [0, 1, 2], [1, 0.75, 0.4], Extrapolation.CLAMP),
    };
  });
  return (
    <Animated.View style={[{ width }, style]}>
      <PressableScale accessibilityRole="link" accessibilityLabel={design.name} onPress={() => router.push(`/design/${design.slug}`)} scaleTo={0.97}>
        <View
          className="overflow-hidden bg-sand-100"
          style={{
            borderTopLeftRadius: 999,
            borderTopRightRadius: 999,
            borderBottomLeftRadius: 22,
            borderBottomRightRadius: 22,
            shadowColor: colors.accent['900'],
            shadowOpacity: 0.3,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 16 },
            elevation: 8,
          }}
        >
          <DesignImage uri={design.primaryImageUrl} name={design.name} className="aspect-[3/4.3] w-full" />
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 8, left: 8, right: 8, bottom: 8, borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderWidth: 1, borderColor: 'rgba(235,213,156,0.8)' }}
          />
          <View className="absolute inset-x-0 bottom-0 bg-black/35 px-4 pb-4 pt-6">
            <Text numberOfLines={1} className="text-center font-display text-xl text-white">
              {design.name}
            </Text>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}
