import { useSignIn, useSignUp, useSSO } from '@clerk/expo';
import { useSignInWithApple } from '@clerk/expo/apple';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { type ReactNode, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EightPointStar, GlowingStar, StarPattern } from '../components/ornament';
import { PressableScale } from '../components/pressable-scale';
import { colors, gold } from '../lib/theme';
import { Text } from '../components/text';
import { z } from 'zod';
import { Button } from '../components/button';
import { InlineError } from '../components/states';
import { TextField } from '../components/text-field';
import { strings } from '../content/strings';
import { clerkMessage, hasClerkCode } from '../lib/auth-errors';
import { isClerkConfigured } from '../lib/env';

WebBrowser.maybeCompleteAuthSession();

const emailSchema = z.string().trim().email();
const codeSchema = z.string().regex(/^\d{6}$/);

/**
 * Where Clerk sends the browser back after Google: abaya://sso-callback in dev/prod builds
 * (exp://…/--/sso-callback in Expo Go). Must be allowlisted in Clerk (see README).
 */
const redirectUrl = AuthSession.makeRedirectUri({ scheme: 'abaya', path: 'sso-callback' });

function done() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Green header with the gold lattice and the brand, and a white sheet holding the form. */
function LoginShell({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const l = strings.login;
  return (
    <KeyboardAvoidingView className="flex-1 bg-accent-950" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={{ paddingTop: insets.top + 12 }} className="overflow-hidden px-6 pb-16">
          <LinearGradient colors={[colors.accent['800'], colors.accent['950']]} style={StyleSheet.absoluteFill} />
          <StarPattern color={gold[300]} opacity={0.1} tile={64} />
          <View className="absolute -right-24 top-10 h-72 w-72 rounded-full bg-accent-700/40" />
          <View className="flex-row justify-end">
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={l.close}
              onPress={done}
              className="h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10"
            >
              <Ionicons name="close" size={20} color="#fff" />
            </PressableScale>
          </View>
          <Animated.View entering={FadeInDown.duration(700)} className="mt-4 items-center">
            <GlowingStar size={40} />
            <Text className="mt-4 font-display text-5xl text-gold-100">{strings.appName}</Text>
            <Text className="mt-1 text-[11px] font-medium uppercase tracking-[4px] text-gold-300">{l.welcome}</Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(150).duration(700)} className="mt-6 gap-2.5">
            {l.benefits.map((b) => (
              <View key={b} className="flex-row items-center gap-3">
                <EightPointStar size={12} color={gold[300]} />
                <Text className="text-sm text-accent-50/90">{b}</Text>
              </View>
            ))}
          </Animated.View>
        </View>
        <Animated.View
          entering={FadeInUp.delay(200).duration(700).springify().damping(18)}
          className="-mt-8 flex-1 rounded-t-[32px] bg-background px-6 pt-8"
          style={{ paddingBottom: insets.bottom + 32 }}
        >
          <Text accessibilityRole="header" className="font-display text-[34px] leading-10 text-foreground">
            {l.heading}
          </Text>
          <Text className="mt-2 text-sm leading-5 text-muted">{l.subtitle}</Text>
          {children}
          <View className="mt-8 flex-row items-center justify-center gap-2">
            <Ionicons name="lock-closed-outline" size={13} color={colors.neutral['500']} />
            <Text className="text-xs text-muted">{l.secure}</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function LoginScreen() {
  if (!isClerkConfigured) {
    return (
      <LoginShell>
        <View className="mt-6">
          <InlineError message={strings.login.notConfigured} />
        </View>
      </LoginShell>
    );
  }
  return <ClerkLogin />;
}

/** Custom native sign-in: email code (sign-in or sign-up), Google (browser SSO), Apple (native, iOS). */
function ClerkLogin() {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  /** Clerk keeps sign-in (existing account) and sign-up (new email) as separate flows. */
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn');
  const [busy, setBusy] = useState<null | 'email' | 'code' | 'google' | 'apple'>(null);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  // Android: pre-warm the Custom Tab so the Google page opens quickly.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync().catch(() => undefined);
    return () => {
      void WebBrowser.coolDownAsync().catch(() => undefined);
    };
  }, []);

  const sendCode = async () => {
    setError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(strings.login.invalidEmail);
    const emailAddress = parsed.data;
    setBusy('email');
    try {
      const { error: e } = await signIn.emailCode.sendCode({ emailAddress });
      if (!e) {
        setFlow('signIn');
      } else if (hasClerkCode(e, 'form_identifier_not_found')) {
        // New email: create the account with a sign-up, verified by the same kind of code.
        const created = await signUp.create({ emailAddress });
        if (created.error) return setError(clerkMessage(created.error, strings.common.genericError));
        const sent = await signUp.verifications.sendEmailCode();
        if (sent.error) return setError(clerkMessage(sent.error, strings.common.genericError));
        setFlow('signUp');
      } else {
        return setError(clerkMessage(e, strings.common.genericError));
      }
      setCode('');
      setStep('code');
    } finally {
      setBusy(null);
    }
  };

  const verifyCode = async () => {
    setError(null);
    if (!codeSchema.safeParse(code).success) return setError(strings.login.invalidCode);
    setBusy('code');
    try {
      if (flow === 'signIn') {
        const { error: e } = await signIn.emailCode.verifyCode({ code });
        if (e) return setError(codeError(e));
        if (signIn.status !== 'complete') return setError(strings.login.needsMoreSteps);
        const fin = await signIn.finalize();
        if (fin.error) return setError(clerkMessage(fin.error, strings.common.genericError));
      } else {
        const { error: e } = await signUp.verifications.verifyEmailCode({ code });
        if (e) return setError(codeError(e));
        if (signUp.status !== 'complete') return setError(strings.login.needsMoreSteps);
        const fin = await signUp.finalize();
        if (fin.error) return setError(clerkMessage(fin.error, strings.common.genericError));
      }
      done();
    } finally {
      setBusy(null);
    }
  };

  const resend = async () => {
    setError(null);
    setBusy('email');
    try {
      const { error: e } =
        flow === 'signIn' ? await signIn.emailCode.sendCode() : await signUp.verifications.sendEmailCode();
      if (e) setError(clerkMessage(e, strings.common.genericError));
    } finally {
      setBusy(null);
    }
  };

  const google = async () => {
    setError(null);
    setBusy('google');
    try {
      const { createdSessionId, setActive, authSessionResult } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl,
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        done();
      } else if (authSessionResult?.type === 'success') {
        setError(strings.login.needsMoreSteps);
      } else {
        setError(strings.login.cancelled);
      }
    } catch (e) {
      setError(clerkMessage(e, strings.common.genericError));
    } finally {
      setBusy(null);
    }
  };

  const apple = async () => {
    setError(null);
    setBusy('apple');
    try {
      // Native Sign in with Apple; Clerk exchanges the identity token and creates the account if needed.
      const { createdSessionId, setActive } = await startAppleAuthenticationFlow();
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        done();
      } else {
        setError(strings.login.cancelled);
      }
    } catch (e) {
      setError(clerkMessage(e, strings.common.genericError));
    } finally {
      setBusy(null);
    }
  };

  return (
    <LoginShell>
      <View className="mt-8 gap-4">
        {step === 'email' ? (
          <>
            <TextField
              label={strings.login.email}
              placeholder={strings.login.emailPlaceholder}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={() => void sendCode()}
            />
            <Button
              label={busy === 'email' ? strings.login.sending : strings.login.sendCode}
              loading={busy === 'email'}
              disabled={busy !== null}
              trailingIcon="arrow-forward"
              shine
              onPress={() => void sendCode()}
            />
          </>
        ) : (
          <>
            <Text className="text-sm text-neutral-700">{strings.login.codeSent(email.trim())}</Text>
            <TextField
              label={strings.login.code}
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void verifyCode()}
            />
            <Button
              label={busy === 'code' ? strings.login.verifying : strings.login.verify}
              loading={busy === 'code'}
              disabled={busy !== null}
              trailingIcon="checkmark"
              shine
              onPress={() => void verifyCode()}
            />
            <Button
              label={strings.login.resend}
              variant="secondary"
              size="md"
              disabled={busy !== null}
              onPress={() => void resend()}
            />
            <Button
              label={strings.login.changeEmail}
              variant="ghost"
              size="md"
              onPress={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            />
          </>
        )}

        <InlineError message={error} />

        <View className="my-2 flex-row items-center gap-3">
          <View className="h-px flex-1 bg-gold-200" />
          <EightPointStar size={12} />
          <Text className="text-xs uppercase tracking-[2px] text-muted">{strings.login.or}</Text>
          <EightPointStar size={12} />
          <View className="h-px flex-1 bg-gold-200" />
        </View>

        <Button
          label={strings.login.google}
          icon={<Ionicons name="logo-google" size={18} color={colors.accent['800']} />}
          variant="secondary"
          loading={busy === 'google'}
          disabled={busy !== null}
          onPress={() => void google()}
        />
        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={26}
            style={{ height: 52, width: '100%' }}
            onPress={() => void apple()}
          />
        ) : null}
      </View>
    </LoginShell>
  );

}

function codeError(e: unknown): string {
  if (hasClerkCode(e, 'form_code_incorrect')) return strings.login.wrongCode;
  return clerkMessage(e, strings.common.genericError);
}
