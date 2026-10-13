import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Text } from '../../components/text';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/button';
import { EmptyState, ErrorState, ListSkeleton } from '../../components/states';
import { strings } from '../../content/strings';
import { errorMessage } from '../../lib/api-client';
import { formatDate } from '../../lib/format';
import { useDeleteMeasurement, useMeasurements } from '../../lib/queries/account';
import { colors } from '../../lib/theme';
import { showAlert } from '../../lib/dialog';

export default function MeasurementsScreen() {
  const list = useMeasurements();
  const remove = useDeleteMeasurement();

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={list.data ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.primary} />}
        renderItem={({ item }) => (
          <View className="rounded-3xl border border-border bg-surface p-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Text className="text-lg font-semibold text-foreground">{item.name}</Text>
                {item.isDefault ? (
                  <View className="rounded-full bg-accent-50 px-2 py-0.5">
                    <Text className="text-xs text-primary">{strings.measurements.isDefault}</Text>
                  </View>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${strings.measurements.delete} ${item.name}`}
                className="h-11 w-11 items-center justify-center"
                onPress={() =>
                  showAlert(strings.measurements.deleteConfirm, item.name, [
                    { text: strings.common.cancel, style: 'cancel' },
                    { text: strings.measurements.delete, style: 'destructive', onPress: () => remove.mutate(item.id) },
                  ])
                }
              >
                <Ionicons name="trash-outline" size={20} color={colors.neutral['600']} />
              </Pressable>
            </View>
            <Text className="text-sm text-neutral-700">{strings.measurements.summary(item.bustCm, item.waistCm, item.fullLengthCm)}</Text>
            <Text className="mt-1 text-xs text-muted">{formatDate(item.updatedAt)}</Text>
          </View>
        )}
        ListEmptyComponent={
          list.isPending ? (
            <ListSkeleton rows={2} />
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
          ) : (
            <EmptyState icon="resize-outline" title={strings.measurements.emptyTitle} body={strings.measurements.emptyBody} />
          )
        }
        ListFooterComponent={
          <Button label={strings.measurements.add} onPress={() => router.push('/measurements/new')} className="mt-2" />
        }
      />
    </View>
  );
}
