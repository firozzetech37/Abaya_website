'use client';

import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from '@/components/i18n/navigation';
import { useStrings } from '@/components/i18n/locale-provider';
import { errorMessage } from '@/lib/api-client';
import { useSavePicture } from '@/lib/queries/try-on';
import { cn } from '@/lib/utils';

/** Where saved pictures live: "My AI pictures" on her profile. */
export const MY_AI_PICTURES_HREF = '/account#ai-pictures';

/**
 * "Save to My AI pictures" under an AI preview or try-on: a saved picture has no hour, it stays
 * on her profile until she removes it. Tapping "Saved" again un-saves it (hers for an hour more).
 * `compact`: a small round button for picture cards.
 */
export function SavePictureButton({
  picture,
  compact = false,
  className,
}: {
  picture: { id: string; saved: boolean };
  compact?: boolean;
  className?: string;
}) {
  const { tryOn } = useStrings();
  const t = tryOn.save;
  const router = useRouter();
  const save = useSavePicture();
  const busy = save.isPending;
  const saved = picture.saved;

  const toggle = () =>
    save.mutate(
      { id: picture.id, save: !saved },
      {
        onSuccess: (dto) =>
          dto.saved
            ? toast.success(t.savedToast, { description: t.savedToastBody, action: { label: t.view, onClick: () => router.push(MY_AI_PICTURES_HREF) } })
            : toast(t.unsavedToast),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  const Icon = busy ? Loader2 : saved ? BookmarkCheck : Bookmark;

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
        aria-label={saved ? t.unsaveLabel : t.saveLabel}
        title={saved ? t.unsaveLabel : t.saveLabel}
        className={cn(
          'inline-flex size-9 cursor-pointer items-center justify-center rounded-full shadow-[0_8px_20px_-10px_rgba(16,4,7,0.7)] ring-1 backdrop-blur-md transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 disabled:cursor-wait',
          saved ? 'bg-accent-900/90 text-gold-200 ring-gold-300/60 hover:bg-accent-950' : 'bg-white/90 text-accent-900 ring-white/60 hover:bg-white',
          className,
        )}
      >
        <Icon className={cn('size-4', busy && 'animate-spin', saved && !busy && 'motion-safe:animate-pop')} aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      className={cn(
        'group/save inline-flex cursor-pointer items-center gap-2.5 rounded-full border py-1.5 pe-4 ps-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-wait',
        saved
          ? 'border-accent-900 bg-accent-900 text-white hover:bg-accent-950'
          : 'border-gold-300 bg-gradient-to-b from-white to-sand-50 text-accent-900 hover:border-gold-400 hover:from-sand-50',
        className,
      )}
    >
      <span
        className={cn(
          'flex size-7 items-center justify-center rounded-full transition-colors duration-200',
          saved ? 'bg-gold-300 text-accent-950' : 'bg-[linear-gradient(160deg,#E9D49A_0%,#CCA24A_55%,#B48734_100%)] text-accent-950',
        )}
      >
        <Icon className={cn('size-3.5', busy && 'animate-spin')} aria-hidden />
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span>{saved ? t.saved : t.save}</span>
        <span className={cn('text-[11px] font-normal', saved ? 'text-gold-100/90' : 'text-muted')}>{saved ? t.savedHint : t.saveHint}</span>
      </span>
    </button>
  );
}
