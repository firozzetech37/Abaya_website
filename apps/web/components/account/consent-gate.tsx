'use client';

import { Link, usePathname } from '@/components/i18n/navigation';
import { POLICY_VERSION, type RecordConsentsBody } from '@abaya/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/misc';
import { useStrings } from '@/components/i18n/locale-provider';
import { errorMessage } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { needsConsent, useMe, useRecordConsents } from '@/lib/queries/me';

/**
 * DPDP consent step after the first login (and whenever POLICY_VERSION changes):
 * terms + privacy are required, marketing is optional. WhatsApp updates are not asked here
 * (Account → Notifications still offers them).
 */
export function ConsentGate() {
  const { consent } = useStrings();
  const { status, signOut } = useAuth();
  const me = useMe();
  const pathname = usePathname();
  const record = useRecordConsents();
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Let people read the policies they are agreeing to.
  const onPolicyPage = pathname.startsWith('/policies');
  const open = status === 'authenticated' && needsConsent(me.data) && !onPolicyPage;

  const submit = async () => {
    if (!terms || !privacy) {
      setError(consent.required);
      return;
    }
    setError(null);
    try {
      const body: RecordConsentsBody = {
        version: POLICY_VERSION,
        consents: [
          { purpose: 'TERMS', granted: true },
          { purpose: 'PRIVACY', granted: true },
          { purpose: 'MARKETING', granted: marketing },
        ],
      };
      await record.mutateAsync(body);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent hideClose onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogTitle>{consent.title}</DialogTitle>
        <DialogDescription>{consent.body}</DialogDescription>
        <div className="mt-6 space-y-4">
          <ConsentRow id="consent-terms" checked={terms} onChange={setTerms} label={consent.terms} href="/policies/terms" linkLabel={consent.readTerms} />
          <ConsentRow
            id="consent-privacy"
            checked={privacy}
            onChange={setPrivacy}
            label={consent.privacy}
            href="/policies/privacy"
            linkLabel={consent.readPrivacy}
          />
          <ConsentRow id="consent-marketing" checked={marketing} onChange={setMarketing} label={consent.marketing} />
        </div>
        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Button onClick={() => void submit()} loading={record.isPending} className="sm:flex-1">
            {record.isPending ? consent.submitting : consent.submit}
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            {consent.signOutInstead}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConsentRow({
  id,
  checked,
  onChange,
  label,
  href,
  linkLabel,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <div className="text-sm leading-snug">
        <label htmlFor={id} className="cursor-pointer text-neutral-800">
          {label}
        </label>
        {href && (
          <>
            {' '}
            <Link href={href} target="_blank" className="text-accent-700 underline underline-offset-2">
              {linkLabel}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
