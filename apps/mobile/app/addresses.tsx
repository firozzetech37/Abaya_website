import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Text } from '../components/text';
import { AddressForm, formatAddress } from '../components/address-form';
import { Button } from '../components/button';
import { EmptyState, ErrorState, ListSkeleton } from '../components/states';
import { strings } from '../content/strings';
import { errorMessage } from '../lib/api-client';
import { useAddresses, useDeleteAddress } from '../lib/queries/account';
import { colors } from '../lib/theme';
import { showAlert } from '../lib/dialog';

export default function AddressesScreen() {
  const list = useAddresses();
  const remove = useDeleteAddress();
  const [adding, setAdding] = useState(false);

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.primary} />}
      >
        {list.isPending ? (
          <ListSkeleton rows={2} />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
        ) : list.data.length === 0 && !adding ? (
          <EmptyState icon="location-outline" title={strings.addresses.emptyTitle} body={strings.addresses.emptyBody} />
        ) : (
          list.data.map((a) => (
            <View key={a.id} className="flex-row gap-3 rounded-3xl border border-border bg-surface p-4">
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-base font-semibold text-foreground">{a.fullName}</Text>
                  {a.isDefault ? (
                    <View className="rounded-full bg-accent-50 px-2 py-0.5">
                      <Text className="text-xs text-primary">{strings.addresses.isDefault}</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="mt-1 text-sm text-neutral-700">{formatAddress(a)}</Text>
                <Text className="mt-1 text-sm text-muted">{a.phone}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${strings.common.remove} ${a.fullName}`}
                className="h-11 w-11 items-center justify-center"
                onPress={() =>
                  showAlert(strings.addresses.deleteConfirm, formatAddress(a), [
                    { text: strings.common.cancel, style: 'cancel' },
                    { text: strings.common.remove, style: 'destructive', onPress: () => remove.mutate(a.id) },
                  ])
                }
              >
                <Ionicons name="trash-outline" size={20} color={colors.neutral['600']} />
              </Pressable>
            </View>
          ))
        )}

        {adding ? (
          <View className="mt-2 rounded-3xl border border-border bg-surface p-4">
            <Text className="mb-4 font-display text-2xl text-foreground">{strings.addresses.add}</Text>
            <AddressForm onSaved={() => setAdding(false)} defaultChecked={(list.data?.length ?? 0) === 0} />
          </View>
        ) : (
          <Button label={strings.addresses.add} variant="secondary" onPress={() => setAdding(true)} className="mt-2" />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
