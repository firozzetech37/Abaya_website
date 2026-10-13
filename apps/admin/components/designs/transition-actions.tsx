'use client';

import type { AdminDesignDetail, DesignStatus } from '@abaya/contracts';
import * as React from 'react';
import { toast } from 'sonner';
import { SimilarList } from '@/components/ai/ai-panel';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { DESIGN_STATUS_LABELS, strings } from '@/content/strings';
import { ApiError } from '@/lib/api-client';
import { useDesignAi } from '@/lib/queries/ai';
import { useTransitionDesign } from '@/lib/queries/designs';

const t = strings.editor;

function labelFor(from: DesignStatus, to: DesignStatus): string {
  if (from === 'PUBLISHED' && to === 'PRICED') return t.transitionFromPublishedToPriced;
  if (from === 'ARCHIVED' && to === 'PUBLISHED') return t.transitionFromArchived;
  return t.transitions[to];
}

function confirmCopy(from: DesignStatus, to: DesignStatus): { title: string; body: string; danger: boolean } | null {
  if (to === 'PUBLISHED') return { title: t.publishTitle, body: t.publishBody, danger: false };
  if (to === 'ARCHIVED') return { title: t.archiveTitle, body: t.archiveBody, danger: true };
  if (from === 'PUBLISHED' && to === 'PRICED') return { title: t.unpublishTitle, body: t.unpublishBody, danger: true };
  return null;
}

/** Only the buttons in `allowedTransitions` (already filtered by the API for this user's role). */
export function TransitionActions({ design, size = 'md' }: { design: AdminDesignDetail; size?: 'sm' | 'md' }) {
  const transition = useTransitionDesign(design.id);
  const [pending, setPending] = React.useState<DesignStatus | null>(null);
  const [notes, setNotes] = React.useState('');
  const [notesError, setNotesError] = React.useState<string | null>(null);
  // Approving a design the AI flags as a likely duplicate needs an explicit "I checked" (API-enforced too).
  const approving = design.status === 'IN_REVIEW' && design.allowedTransitions.includes('PRICED');
  const ai = useDesignAi(approving ? design.id : null);
  const [checkingDuplicates, setCheckingDuplicates] = React.useState(false);
  const [checked, setChecked] = React.useState(false);
  const [checkedError, setCheckedError] = React.useState<string | null>(null);
  // Submitting for review needs the designer's originality statement (API-enforced too).
  const [submitting, setSubmitting] = React.useState(false);
  const [original, setOriginal] = React.useState(false);
  const [originalError, setOriginalError] = React.useState<string | null>(null);

  if (design.allowedTransitions.length === 0) return <p className="text-xs text-muted">{t.noActions}</p>;

  async function run(to: DesignStatus, withNotes?: string, duplicatesChecked?: boolean, originalityConfirmed?: boolean) {
    await transition.mutateAsync({ to, notes: withNotes, duplicatesChecked, originalityConfirmed });
    toast.success(t.transitionDone(DESIGN_STATUS_LABELS[to]));
  }

  function askDuplicateCheck() {
    setChecked(false);
    setCheckedError(null);
    setCheckingDuplicates(true);
  }

  const primaryTargets: DesignStatus[] = ['IN_REVIEW', 'PRICED', 'PUBLISHED'];
  const confirm = pending ? confirmCopy(design.status, pending) : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {design.allowedTransitions.map((to) => {
        const isPrimary = primaryTargets.includes(to) && !(design.status === 'PUBLISHED' && to === 'PRICED');
        const variant = to === 'ARCHIVED' ? 'danger-outline' : isPrimary ? 'primary' : 'secondary';
        return (
          <Button
            key={to}
            size={size}
            variant={variant}
            loading={transition.isPending && transition.variables?.to === to}
            disabled={transition.isPending}
            onClick={() => {
              if (to === 'IN_REVIEW') {
                setOriginal(false);
                setOriginalError(null);
                setSubmitting(true);
              } else if (approving && to === 'PRICED' && ai.data?.hasDuplicate) {
                askDuplicateCheck();
              } else if (to === 'CHANGES_REQUESTED' || confirmCopy(design.status, to)) {
                setNotes('');
                setNotesError(null);
                setPending(to);
              } else {
                void run(to).catch((e: unknown) => {
                  // The AI finished after this page loaded: ask now.
                  if (e instanceof ApiError && e.code === 'DUPLICATE_CHECK_REQUIRED') {
                    void ai.refetch();
                    askDuplicateCheck();
                  }
                });
              }
            }}
          >
            {labelFor(design.status, to)}
          </Button>
        );
      })}

      {submitting ? (
        <ConfirmDialog
          open
          onOpenChange={setSubmitting}
          title={t.originalityTitle}
          description={t.originalityBody}
          confirmLabel={t.transitions.IN_REVIEW}
          onConfirm={async () => {
            if (!original) {
              setOriginalError(t.originalityRequired);
              return false;
            }
            await run('IN_REVIEW', undefined, undefined, true);
          }}
        >
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={original}
              onCheckedChange={(v) => {
                setOriginal(v === true);
                setOriginalError(null);
              }}
            />
            {t.originalityCheckbox}
          </label>
          {originalError ? <p className="text-sm text-danger">{originalError}</p> : null}
        </ConfirmDialog>
      ) : null}

      {checkingDuplicates ? (
        <ConfirmDialog
          open
          onOpenChange={setCheckingDuplicates}
          title={strings.ai.confirmTitle}
          description={strings.ai.confirmBody}
          confirmLabel={t.transitions.PRICED}
          onConfirm={async () => {
            if (!checked) {
              setCheckedError(strings.ai.confirmRequired);
              return false;
            }
            await run('PRICED', undefined, true);
          }}
        >
          <div className="max-h-72 overflow-y-auto">
            <SimilarList items={(ai.data?.similar ?? []).filter((s) => s.level === 'DUPLICATE')} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={checked}
              onCheckedChange={(v) => {
                setChecked(v === true);
                setCheckedError(null);
              }}
            />
            {strings.ai.confirmCheckbox}
          </label>
          {checkedError ? <p className="text-sm text-danger">{checkedError}</p> : null}
        </ConfirmDialog>
      ) : null}

      {pending === 'CHANGES_REQUESTED' ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={t.requestChangesTitle}
          description={t.requestChangesBody}
          confirmLabel={t.transitions.CHANGES_REQUESTED}
          onConfirm={async () => {
            if (!notes.trim()) {
              setNotesError(t.notesRequired);
              return false;
            }
            await run('CHANGES_REQUESTED', notes.trim());
          }}
        >
          <Field label={t.notesLabel} htmlFor="review-notes" error={notesError ?? undefined}>
            <Textarea
              id="review-notes"
              rows={4}
              maxLength={1000}
              autoFocus
              value={notes}
              aria-invalid={Boolean(notesError)}
              onChange={(e) => {
                setNotes(e.target.value);
                setNotesError(null);
              }}
            />
          </Field>
        </ConfirmDialog>
      ) : pending && confirm ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={confirm.title}
          description={confirm.body}
          tone={confirm.danger ? 'danger' : 'primary'}
          confirmLabel={labelFor(design.status, pending)}
          onConfirm={() => run(pending)}
        />
      ) : null}
    </div>
  );
}
