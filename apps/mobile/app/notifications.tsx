import { router } from 'expo-router';
import { ScrollView } from 'react-native';
import { PushPrompt } from '../components/push-prompt';

/** Notification permission explainer, opened once after the first sign-in. */
export default function NotificationsScreen() {
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
      <PushPrompt onDone={close} />
    </ScrollView>
  );
}
