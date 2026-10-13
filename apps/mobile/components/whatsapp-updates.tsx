import { indianPhone, type MeResponse } from '@abaya/contracts';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Text } from './text';
import { strings } from '../content/strings';
import { errorMessage } from '../lib/api-client';
import { useSetWhatsApp, whatsappEnabled } from '../lib/queries/account';
import { colors } from '../lib/theme';
import { Button } from './button';
import { InlineError } from './states';
import { TextField } from './text-field';

/** Last 10 digits of a stored phone when it is a valid Indian mobile, else ''. */
function localDigits(phone: string | null): string {
  if (!phone) return '';
  const local = phone.replace(/\D/g, '').slice(-10);
  return indianPhone.safeParse(local).success ? local : '';
}

const pretty = (local: string) => `${strings.whatsapp.prefix} ${local.slice(0, 5)} ${local.slice(5)}`;

/** "Order updates on WhatsApp" consent switch. Turning it on asks for / confirms the mobile number. */
export function WhatsAppUpdates({ me }: { me: MeResponse }) {
  const enabled = whatsappEnabled(me);
  const onFile = localDigits(me.phone);
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(onFile);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mutation = useSetWhatsApp();

  const startEditing = () => {
    setPhone(onFile);
    setPhoneError(null);
    setNotice(null);
    mutation.reset();
    setEditing(true);
  };

  const onToggle = (next: boolean) => {
    if (next) {
      startEditing();
      return;
    }
    if (editing && !enabled) {
      setEditing(false);
      return;
    }
    setEditing(false);
    mutation.mutate({ granted: false }, { onSuccess: () => setNotice(strings.whatsapp.turnedOff) });
  };

  const confirm = () => {
    const digits = phone.replace(/\D/g, '').slice(-10);
    if (!indianPhone.safeParse(digits).success) {
      setPhoneError(strings.whatsapp.phoneInvalid);
      return;
    }
    setPhoneError(null);
    mutation.mutate(
      { granted: true, phone: digits === onFile ? undefined : `+91${digits}` },
      {
        onSuccess: () => {
          setEditing(false);
          setNotice(strings.whatsapp.turnedOn);
        },
      },
    );
  };

  const switchOn = enabled || editing;

  return (
    <View className="p-4">
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <Text className="text-base font-medium text-foreground">{strings.whatsapp.title}</Text>
          <Text className="mt-0.5 text-sm text-muted">
            {enabled && onFile && !editing ? strings.whatsapp.on(pretty(onFile)) : strings.whatsapp.body}
          </Text>
        </View>
        <Switch
          accessibilityLabel={strings.whatsapp.title}
          value={switchOn}
          disabled={mutation.isPending}
          onValueChange={onToggle}
          trackColor={{ true: colors.primary, false: colors.neutral['300'] }}
          thumbColor="#fff"
        />
      </View>

      {enabled && !editing ? (
        <Pressable
          accessibilityRole="button"
          onPress={startEditing}
          className="mt-1 min-h-[44px] justify-center self-start"
        >
          <Text className="text-sm font-medium text-primary">{strings.whatsapp.changeNumber}</Text>
        </Pressable>
      ) : null}

      {editing ? (
        <View className="mt-4 gap-3">
          <TextField
            label={strings.whatsapp.phoneLabel}
            placeholder={strings.whatsapp.phonePlaceholder}
            hint={strings.whatsapp.phoneHint}
            error={phoneError}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxLength={14}
          />
          <Button
            label={mutation.isPending ? strings.whatsapp.saving : strings.whatsapp.confirm}
            loading={mutation.isPending}
            onPress={confirm}
          />
        </View>
      ) : null}

      <View className="mt-2">
        <InlineError message={mutation.isError ? errorMessage(mutation.error) : null} />
        {notice && !mutation.isError ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-success">
            {notice}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
