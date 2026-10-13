'use client';

import { indianPhone, type MeResponse } from '@abaya/contracts';
import { MessageCircle } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { fieldAria, FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { useStrings } from '@/components/i18n/locale-provider';
import { errorMessage } from '@/lib/api-client';
import { localMobile, useSetWhatsApp, whatsappEnabled } from '@/lib/queries/me';
import { cn } from '@/lib/utils';

const pretty = (local: string) => `+91 ${local.slice(0, 5)} ${local.slice(5)}`;

/** "Order updates on WhatsApp" consent toggle. Turning it on asks for / confirms the mobile number. */
export function WhatsAppUpdates({ me }: { me: MeResponse }) {
  const t = useStrings().account.whatsapp;
  const enabled = whatsappEnabled(me);
  const onFile = localMobile(me.phone);
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(onFile);
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const mutation = useSetWhatsApp();

  const startEditing = () => {
    setPhone(onFile);
    setPhoneError(undefined);
    mutation.reset();
    setEditing(true);
  };

  const toggle = () => {
    if (!enabled && !editing) return startEditing();
    if (!enabled && editing) return setEditing(false);
    setEditing(false);
    mutation.mutate({ granted: false }, { onSuccess: () => toast.success(t.turnedOff) });
  };

  const confirm = (e: FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '').slice(-10);
    if (!indianPhone.safeParse(digits).success) {
      setPhoneError(t.phoneInvalid);
      return;
    }
    setPhoneError(undefined);
    mutation.mutate(
      { granted: true, phone: digits === onFile ? undefined : `+91${digits}` },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success(t.turnedOn);
        },
      },
    );
  };

  const on = enabled || editing;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700">
          <MessageCircle className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p id="whatsapp-title" className="font-medium text-neutral-900">
            {t.title}
          </p>
          <p id="whatsapp-desc" className="mt-1 text-sm leading-relaxed text-neutral-600">
            {enabled && onFile && !editing ? t.on(pretty(onFile)) : t.body}
          </p>
          {enabled && !editing && (
            <Button type="button" size="sm" variant="link" className="-ms-1 mt-1 min-h-11 px-1" onClick={startEditing}>
              {t.changeNumber}
            </Button>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="whatsapp-title"
          aria-describedby="whatsapp-desc"
          disabled={mutation.isPending}
          onClick={toggle}
          className="group -my-1 flex h-11 w-14 shrink-0 items-center justify-center rounded-full focus-visible:outline-none disabled:opacity-50"
        >
          <span
            aria-hidden
            className={cn(
              'relative inline-flex h-7 w-12 items-center rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-accent-500 group-focus-visible:ring-offset-2',
              on ? 'bg-primary' : 'bg-neutral-300',
            )}
          >
            <span
              className={cn(
                'inline-block size-5 rounded-full bg-white shadow transition-transform',
                on ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-1 rtl:-translate-x-1',
              )}
            />
          </span>
        </button>
      </div>

      {editing && (
        <form onSubmit={confirm} noValidate className="space-y-3 rounded-lg border border-border bg-neutral-50 p-4 sm:ms-14">
          <FormField id="whatsapp-phone" label={t.phoneLabel} hint={t.phoneHint} error={phoneError}>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-600" aria-hidden>
                +91
              </span>
              <Input
                {...fieldAria('whatsapp-phone', phoneError, true)}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                maxLength={14}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="max-w-xs"
              />
            </div>
          </FormField>
          <Button type="submit" loading={mutation.isPending}>
            {t.confirm}
          </Button>
        </form>
      )}

      {mutation.isError && <Alert tone="danger">{errorMessage(mutation.error)}</Alert>}
    </div>
  );
}
