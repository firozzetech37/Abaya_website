import { ABAYA_STYLES, type AbayaStyle } from '@abaya/contracts';
import { useLocalSearchParams } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { Text } from '../../components/text';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { Chip } from '../../components/chip';
import { EightPointStar } from '../../components/ornament';
import { PressableScale } from '../../components/pressable-scale';
import { DesignCard } from '../../components/design-card';
import { ScreenHeader } from '../../components/screen-header';
import { DesignGridSkeleton, EmptyState, ErrorState } from '../../components/states';
import { strings } from '../../content/strings';
import { errorMessage } from '../../lib/api-client';
import { type DesignFilters, useCollections, useDesigns } from '../../lib/queries/catalog';
import { colors } from '../../lib/theme';

type Sort = 'newest' | 'price_asc' | 'price_desc';
type PriceKey = (typeof strings.shop.priceRanges)[number]['key'];

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="mb-3">
      <View className="mb-2 flex-row items-center gap-1.5 px-5">
        <EightPointStar size={9} />
        <Text className="text-[10px] font-semibold uppercase tracking-[2.5px] text-accent-700">{label}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        {children}
      </ScrollView>
    </View>
  );
}

export default function ShopScreen() {
  const params = useLocalSearchParams<{ collection?: string; style?: string }>();
  const [style, setStyle] = useState<AbayaStyle | undefined>(undefined);
  const [collection, setCollection] = useState<string | undefined>(params.collection);
  const [price, setPrice] = useState<PriceKey>('any');
  const [sort, setSort] = useState<Sort>('newest');

  // Arriving from a Home collection card (or a deep link) sets the filter.
  useEffect(() => {
    if (params.collection) setCollection(params.collection);
  }, [params.collection]);
  useEffect(() => {
    if (params.style && (ABAYA_STYLES as readonly string[]).includes(params.style)) setStyle(params.style as AbayaStyle);
  }, [params.style]);

  const collections = useCollections();
  const filters = useMemo<DesignFilters>(() => {
    const range = strings.shop.priceRanges.find((r) => r.key === price);
    return {
      style,
      collection,
      sort,
      minPriceInPaise: range && 'min' in range ? range.min : undefined,
      maxPriceInPaise: range && 'max' in range ? range.max : undefined,
    };
  }, [style, collection, price, sort]);
  const designs = useDesigns(filters);
  const items = designs.data?.pages.flatMap((p) => p.items) ?? [];
  const hasFilters = Boolean(style || collection || price !== 'any');
  const [showMore, setShowMore] = useState(Boolean(params.collection));
  const extraCount = (collection ? 1 : 0) + (price !== 'any' ? 1 : 0) + (sort !== 'newest' ? 1 : 0);

  const clear = () => {
    setStyle(undefined);
    setCollection(undefined);
    setPrice('any');
  };

  const header = (
    <View className="pb-3 pt-4">
      <FilterRow label={strings.shop.style}>
        <Chip label={strings.shop.all} selected={!style} onPress={() => setStyle(undefined)} />
        {ABAYA_STYLES.filter((s) => s !== 'OTHER').map((s) => (
          <Chip key={s} label={strings.styles[s]} selected={style === s} onPress={() => setStyle(style === s ? undefined : s)} />
        ))}
      </FilterRow>
      {/* Collection, price and sort fold away behind "Filters" */}
      <View className="flex-row items-center justify-between px-5 pb-2 pt-1">
        <Text className="text-sm text-muted">{designs.data ? strings.shop.results(items.length, Boolean(designs.hasNextPage)) : ' '}</Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityState={{ expanded: showMore }}
          onPress={() => setShowMore((v) => !v)}
          className={`flex-row items-center gap-2 rounded-full border px-4 py-2 ${extraCount > 0 ? 'border-gold-400 bg-gold-50' : 'border-border bg-surface'}`}
        >
          <Ionicons name="options-outline" size={16} color={colors.accent['800']} />
          <Text className="text-sm font-semibold text-accent-900">{strings.shop.filtersCount(extraCount)}</Text>
          <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accent['800']} />
        </PressableScale>
      </View>
      {showMore ? (
      <Animated.View entering={FadeInDown.duration(350)} exiting={FadeOut.duration(200)} className="pt-2">
      {collections.data && collections.data.length > 0 ? (
        <FilterRow label={strings.shop.collection}>
          <Chip label={strings.shop.all} selected={!collection} onPress={() => setCollection(undefined)} />
          {collections.data.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              selected={collection === c.slug}
              onPress={() => setCollection(collection === c.slug ? undefined : c.slug)}
            />
          ))}
        </FilterRow>
      ) : null}
      <FilterRow label={strings.shop.price}>
        {strings.shop.priceRanges.map((r) => (
          <Chip key={r.key} label={r.label} selected={price === r.key} onPress={() => setPrice(r.key)} />
        ))}
      </FilterRow>
      <FilterRow label={strings.shop.sort}>
        {(Object.keys(strings.shop.sortOptions) as Sort[]).map((k) => (
          <Chip key={k} label={strings.shop.sortOptions[k]} selected={sort === k} onPress={() => setSort(k)} />
        ))}
      </FilterRow>
      </Animated.View>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader eyebrow={strings.shop.eyebrow} title={strings.shop.title} />
      <FlatList
        data={items}
        keyExtractor={(d) => d.id}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 20 }}
        contentContainerStyle={{ paddingBottom: 130 }}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => <DesignCard design={item} index={index % 6} className="mb-8 w-[47%]" />}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (designs.hasNextPage && !designs.isFetchingNextPage) void designs.fetchNextPage();
        }}
        refreshControl={
          <RefreshControl
            refreshing={designs.isRefetching && !designs.isFetchingNextPage}
            onRefresh={() => void designs.refetch()}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          designs.isPending ? (
            <DesignGridSkeleton />
          ) : designs.isError ? (
            <ErrorState message={errorMessage(designs.error)} onRetry={() => void designs.refetch()} />
          ) : (
            <EmptyState
              icon="search-outline"
              title={strings.shop.emptyTitle}
              body={strings.shop.emptyBody}
              actionLabel={hasFilters ? strings.shop.clearFilters : undefined}
              onAction={hasFilters ? clear : undefined}
            />
          )
        }
        ListFooterComponent={
          designs.isFetchingNextPage ? <ActivityIndicator className="my-6" color={colors.primary} /> : null
        }
      />
    </View>
  );
}
