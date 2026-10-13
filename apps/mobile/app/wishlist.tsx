import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Text } from '../components/text';
import { DesignImage } from '../components/design-image';
import { DesignGridSkeleton, EmptyState, ErrorState } from '../components/states';
import { strings } from '../content/strings';
import { errorMessage } from '../lib/api-client';
import { formatINR } from '../lib/format';
import { useWishlist } from '../lib/queries/account';
import { colors } from '../lib/theme';

export default function WishlistScreen() {
  const list = useWishlist();
  return (
    <FlatList
      className="flex-1 bg-background"
      data={list.data ?? []}
      keyExtractor={(w) => w.designId}
      numColumns={2}
      columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 16 }}
      contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.primary} />}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={item.name}
          disabled={!item.available}
          onPress={() => router.push(`/design/${item.slug}`)}
          className={`mb-6 w-[48%] ${item.available ? 'active:opacity-80' : 'opacity-50'}`}
        >
          <DesignImage uri={item.primaryImageUrl} name={item.name} className="aspect-[3/4] w-full rounded-xl" />
          <Text className="mt-3 text-sm font-medium text-foreground" numberOfLines={2}>
            {item.name}
          </Text>
          <Text className="text-sm text-neutral-600">
            {item.available ? strings.shop.from(formatINR(item.fromPriceInPaise)) : strings.wishlist.unavailable}
          </Text>
        </Pressable>
      )}
      ListEmptyComponent={
        list.isPending ? (
          <DesignGridSkeleton count={4} />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
        ) : (
          <View className="flex-1 justify-center">
            <EmptyState icon="heart-outline" title={strings.wishlist.emptyTitle} body={strings.wishlist.emptyBody} actionLabel={strings.home.shopCta} onAction={() => router.push('/shop')} />
          </View>
        )
      }
    />
  );
}
