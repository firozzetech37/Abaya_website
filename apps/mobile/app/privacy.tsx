import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Share, View } from 'react-native';
import { Text } from '../components/text';
import { Button } from '../components/button';
import { InlineError } from '../components/states';
import { TextField } from '../components/text-field';
import { strings } from '../content/strings';
import { errorMessage } from '../lib/api-client';
import { useAuth } from '../lib/auth';
import { useDataExport, useDeleteAccount } from '../lib/queries/account';
import { showAlert } from '../lib/dialog';

/** DPDP rights, reachable in-app (also an App Store / Play requirement for account deletion). */
export default function PrivacyScreen() {
  const { signOut, session } = useAuth();
  const exportData = useDataExport();
  const deleteAccount = useDeleteAccount();
  const [confirm, setConfirm] = useState('');

  const onExport = () =>
    exportData.mutate(undefined, {
      onSuccess: (data) => {
        void Share.share({ title: strings.privacy.exportTitle, message: JSON.stringify(data, null, 2) });
      },
    });

  const onDelete = () =>
    deleteAccount.mutate(undefined, {
      onSuccess: async () => {
        await signOut();
        showAlert(strings.privacy.deleted);
        router.replace('/');
      },
    });

  if (!session) {
    return (
      <View className="flex-1 bg-background p-6">
        <Text className="text-base text-neutral-700">{strings.privacy.intro}</Text>
        <Button label={strings.common.signIn} onPress={() => router.push('/login')} className="mt-6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text className="text-base text-neutral-700">{strings.privacy.intro}</Text>

        <View className="gap-3 rounded-3xl border border-border bg-surface p-4">
          <Text className="text-lg font-semibold text-foreground">{strings.privacy.exportTitle}</Text>
          <Text className="text-sm text-muted">{strings.privacy.exportBody}</Text>
          <InlineError message={exportData.isError ? errorMessage(exportData.error) : null} />
          <Button
            label={exportData.isPending ? strings.privacy.exporting : strings.privacy.exportCta}
            variant="secondary"
            loading={exportData.isPending}
            onPress={onExport}
          />
        </View>

        <View className="gap-3 rounded-3xl border border-danger/40 bg-surface p-4">
          <Text className="text-lg font-semibold text-danger">{strings.privacy.deleteTitle}</Text>
          <Text className="text-sm text-neutral-700">{strings.privacy.deleteBody}</Text>
          <TextField
            label={strings.privacy.deletePrompt}
            value={confirm}
            onChangeText={setConfirm}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
          />
          <InlineError message={deleteAccount.isError ? errorMessage(deleteAccount.error) : null} />
          <Button
            label={deleteAccount.isPending ? strings.privacy.deleting : strings.privacy.deleteCta}
            variant="danger"
            disabled={confirm.trim() !== 'DELETE'}
            loading={deleteAccount.isPending}
            onPress={onDelete}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
