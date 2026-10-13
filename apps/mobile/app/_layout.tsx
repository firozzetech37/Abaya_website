import '../global.css';
// One import per weight, so only these eight font files are bundled.
import { CormorantGaramond_500Medium } from '@expo-google-fonts/cormorant-garamond/500Medium';
import { CormorantGaramond_500Medium_Italic } from '@expo-google-fonts/cormorant-garamond/500Medium_Italic';
import { CormorantGaramond_600SemiBold } from '@expo-google-fonts/cormorant-garamond/600SemiBold';
import { CormorantGaramond_700Bold } from '@expo-google-fonts/cormorant-garamond/700Bold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, SplashScreen, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CurtainLoader } from '../components/curtain-loader';
import { PushManager } from '../components/push-manager';
import { strings } from '../content/strings';
import { ApiError } from '../lib/api-client';
import { AuthProvider, useAuth } from '../lib/auth';
import { hasCurrentConsent, useMe } from '../lib/queries/account';
import { colors, fonts } from '../lib/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Refetch stale queries when the app returns to the foreground.
AppState.addEventListener('change', (state) => {
  if (Platform.OS !== 'web') focusManager.setFocused(state === 'active');
});

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return count < 2;
        },
      },
    },
  });
}

/** Sends a signed-in user to the consent step until they accept the current policy version. */
function ConsentGate() {
  const { session } = useAuth();
  const me = useMe();
  const segments = useSegments();
  const onConsent = segments[0] === 'consent';

  useEffect(() => {
    if (!session || !me.data || onConsent) return;
    if (!hasCurrentConsent(me.data)) router.push('/consent');
  }, [session, me.data, onConsent]);

  return null;
}

/** The splash screen stays until the fonts are in; then the curtain opens on the app. */
function Entrance({ fontsReady }: { fontsReady: boolean }) {
  const { ready } = useAuth();
  useEffect(() => {
    if (fontsReady) void SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsReady]);
  return <CurtainLoader ready={fontsReady && ready} />;
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);
  // The website's type: Inter (text) and Cormorant Garamond (display). One file per weight.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    CormorantGaramond_500Medium,
    CormorantGaramond_500Medium_Italic,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
  });
  // A font that fails to load falls back to the system font rather than blocking the app.
  const fontsReady = fontsLoaded || Boolean(fontError);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BottomSheetModalProvider>
              <StatusBar style="dark" />
              <ConsentGate />
              <PushManager />
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.background },
                  headerTintColor: colors.primary,
                  headerTitleStyle: { color: colors.foreground, fontFamily: fonts.display, fontSize: 22 },
                  headerShadowVisible: false,
                  headerBackButtonDisplayMode: 'minimal',
                  contentStyle: { backgroundColor: colors.background },
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="design/[slug]" options={{ title: '', headerTransparent: true }} />
                <Stack.Screen name="login" options={{ title: strings.login.title, presentation: 'modal', headerShown: false }} />
                <Stack.Screen
                  name="consent"
                  options={{ title: strings.consent.title, presentation: 'modal', gestureEnabled: false }}
                />
                <Stack.Screen
                  name="notifications"
                  options={{ title: strings.push.screenTitle, presentation: 'modal' }}
                />
                <Stack.Screen name="checkout" options={{ title: strings.checkout.title }} />
                <Stack.Screen name="orders/index" options={{ title: strings.orders.title }} />
                <Stack.Screen name="orders/[orderNumber]" options={{ title: '' }} />
                <Stack.Screen name="measurements/index" options={{ title: strings.measurements.title }} />
                <Stack.Screen name="measurements/new" options={{ title: strings.measurements.newTitle }} />
                <Stack.Screen name="addresses" options={{ title: strings.addresses.title }} />
                <Stack.Screen name="wishlist" options={{ title: strings.wishlist.title }} />
                <Stack.Screen name="privacy" options={{ title: strings.privacy.title }} />
                <Stack.Screen name="sso-callback" options={{ headerShown: false }} />
              </Stack>
              <Entrance fontsReady={fontsReady} />
            </BottomSheetModalProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
