'use client';

import { Heart } from 'lucide-react';
import { usePathname, useRouter } from '@/components/i18n/navigation';
import { toast } from 'sonner';
import { useStrings } from '@/components/i18n/locale-provider';
import { errorMessage } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { useToggleWishlist, useWishlist } from '@/lib/queries/me';
import { cn, loginHref } from '@/lib/utils';

/**
 * Save a design. `overlay` is the small translucent heart that floats on product cards;
 * the default is the round outlined button on the design page.
 */
export function WishlistButton({
  designId,
  className,
  variant = 'default',
}: {
  designId: string;
  className?: string;
  variant?: 'default' | 'overlay';
}) {
  const { design: t } = useStrings();
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const wishlist = useWishlist();
  const toggle = useToggleWishlist();
  const saved = wishlist.data?.some((w) => w.designId === designId) ?? false;

  const onClick = () => {
    if (status !== 'authenticated') {
      router.push(loginHref(pathname));
      return;
    }
    toggle.mutate(
      { designId, saved },
      {
        onSuccess: () => toast.success(saved ? t.wishlistRemoved : t.wishlistAdded),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={toggle.isPending}
      aria-pressed={saved}
      aria-label={saved ? t.wishlistRemove : t.wishlistAdd}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-60',
        variant === 'default' && 'size-11 border border-neutral-300 bg-surface hover:border-neutral-500',
        variant === 'overlay' &&
          'size-9 bg-background/85 text-neutral-700 shadow-[0_8px_20px_-10px_rgba(68,17,27,0.5)] backdrop-blur hover:scale-110 hover:bg-background',
        className,
      )}
    >
      <Heart
        className={cn(
          'transition-transform duration-300',
          variant === 'overlay' ? 'size-4' : 'size-5',
          saved ? 'fill-jewel-maroon text-jewel-maroon motion-safe:animate-pop' : 'text-neutral-700',
        )}
        aria-hidden
      />
    </button>
  );
}
