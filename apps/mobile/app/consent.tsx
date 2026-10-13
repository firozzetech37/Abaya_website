import { POLICY_VERSION } from '@abaya/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '../components/text';
import { Button } from '../components/button';
import { Checkbox } from '../components/checkbox';
import { InlineError } from '../components/states';
import { strings } from '../content/strings';
import { errorMessage } from '../lib/api-client';
import { useRecordConsents } from '../lib/queries/account';

/** DPDP consent after first sign-in: terms + privacy required, marketing optional. */
export default function ConsentScreen() {
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const record = useRecordConsents();

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
      <Text className="text-base text-neutral-700">{strings.consent.body}</Text>
      <View className="mt-6 gap-2 rounded-3xl border border-border bg-surface p-4">
        <Checkbox label={strings.consent.terms} checked={terms} onChange={setTerms} />
        <Checkbox label={strings.consent.privacy} checked={privacy} onChange={setPrivacy} />
        <Checkbox label={strings.consent.marketing} checked={marketing} onChange={setMarketing} />
      </View>
      <Text className="mt-3 text-xs text-muted">{strings.consent.version(POLICY_VERSION)}</Text>
      <View className="mt-6 gap-3">
        <InlineError message={record.isError ? errorMessage(record.error) : null} />
        <Button
          label={strings.consent.accept}
          disabled={!terms || !privacy}
          loading={record.isPending}
          onPress={() =>
            record.mutate(marketing, {
              onSuccess: () => (router.canGoBack() ? router.back() : router.replace('/')),
            })
          }
        />
      </View>
    </ScrollView>
  );
}
