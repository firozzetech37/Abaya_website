'use client';

import { Link, usePathname } from '@/components/i18n/navigation';
import { ArrowRight, Heart, Menu, ShoppingBag, Sparkles, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useStrings } from '@/components/i18n/locale-provider';
import { useAuth } from '@/lib/auth';
import { useAnnouncements } from '@/lib/queries/announcements';
import { useCart } from '@/lib/queries/cart';
import { useWishlist } from '@/lib/queries/me';
import { useOrderingOpen } from '@/lib/queries/ordering';
import { cn, loginHref } from '@/lib/utils';
import { CurrencySwitch } from '@/components/i18n/currency-switch';
import { LanguageSwitch } from '@/components/i18n/language-switch';
import { BrandMark } from './brand-mark';


const ANNOUNCEMENT_MS = 4500;

const iconButton =
  'relative inline-flex size-11 items-center justify-center rounded-full text-neutral-800 transition-colors duration-300 hover:bg-accent-50 hover:text-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500';

export function Header() {
  const { brand, nav } = useStrings();
  const links = [
    { href: '/abayas', label: nav.shop },
    { href: '/#collections', label: nav.collections },
    { href: '/help', label: nav.help },
  ];
  const pathname = usePathname();
  const { status } = useAuth();
  const cart = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const count = cart.data?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;
  // Saved designs (only fetched once she is signed in).
  const wishlist = useWishlist();
  const saved = wishlist.data?.length ?? 0;
  // "Ordering coming soon": no bag in the bar or the menu.
  const orderingOpen = useOrderingOpen() === true;
  const loggedIn = status === 'authenticated';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (href: string) => href !== '/#collections' && pathname.startsWith(href);

  return (
    <>
      <AnnouncementBar />
      {/* Full-width bar at the top of the page; on scroll it lifts into a floating rounded pill.
          The pill's padding + height add up to the same 80px, so the page never jumps. */}
      <header
        className={cn(
          'sticky top-0 z-40 transition-[padding,background-color] duration-500 ease-out',
          scrolled ? 'bg-transparent pt-3' : 'bg-background pt-0',
        )}
      >
        <div
          className={cn(
            'container grid grid-cols-[1fr_auto_1fr] items-center gap-4 border transition-all duration-500 ease-out',
            scrolled
              ? 'h-[68px] w-[calc(100%-1.5rem)] max-w-[78rem] rounded-full border-border/70 bg-background/75 px-4 shadow-[0_18px_50px_-22px_rgba(68,17,27,0.45)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 sm:px-6'
              : 'h-20 rounded-none border-transparent',
          )}
        >
          {/* Left: menu on mobile, links on desktop */}
          <div className="flex items-center">
            <button
              type="button"
              className={cn(iconButton, '-ms-2 lg:hidden')}
              aria-label={nav.menu}
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="size-5" aria-hidden />
            </button>
            {/* Below lg the links live in the menu, so they never squeeze onto two lines. */}
            <nav aria-label={nav.mainLabel} className="hidden items-center gap-6 lg:flex xl:gap-8">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={isActive(l.href) ? 'page' : undefined}
                  className={cn(
                    'relative whitespace-nowrap py-2 text-[13px] font-medium uppercase tracking-[0.14em] text-neutral-700 transition-colors duration-300 hover:text-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                    // Hairline underline that draws in from the left.
                    'after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-right rtl:after:origin-left after:scale-x-0 after:bg-accent-700 after:transition-transform after:duration-500 hover:after:origin-left rtl:hover:after:origin-right hover:after:scale-x-100',
                    isActive(l.href) && 'text-accent-800 after:scale-x-100',
                  )}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Centre: wordmark */}
          <Link
            href="/"
            className="group flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <BrandMark
              draw
              className={cn(
                'text-accent-700 transition-all duration-500 group-hover:text-accent-500',
                scrolled ? 'h-7' : 'h-8 sm:h-9',
              )}
            />
            <span className="flex flex-col leading-none">
              <span className="whitespace-nowrap font-display text-[1.45rem] font-semibold tracking-tight text-foreground sm:text-[1.7rem]">
                {brand.name}
              </span>
              <span
                className={cn(
                  'hidden overflow-hidden text-[9px] font-medium uppercase tracking-[0.42em] text-accent-700 transition-all duration-500 sm:block',
                  scrolled ? 'mt-0 max-h-0 opacity-0' : 'mt-1.5 max-h-4 opacity-100',
                )}
              >
                {nav.tagline}
              </span>
            </span>
          </Link>

          {/* Right: account, bag, call to action */}
          <div className="flex items-center justify-end gap-1">
            {/* Narrower screens: the currency switch is in the menu. */}
            <CurrencySwitch className="me-1 max-lg:hidden" />
            {/* Phones: the language switch is in the menu, so the account and bag icons fit. */}
            <LanguageSwitch className="me-1 max-sm:hidden" />
            <Link
              href={loggedIn ? '/account' : '/login'}
              className={iconButton}
              aria-label={loggedIn ? nav.account : nav.login}
            >
              <UserRound className="size-5" strokeWidth={1.6} aria-hidden />
            </Link>
            <Link
              href={loggedIn ? '/account#wishlist' : loginHref('/account#wishlist')}
              // Phones: the wishlist is in the menu (the bar keeps room for the bag).
              className={cn(iconButton, 'max-sm:hidden')}
              aria-label={loggedIn ? nav.wishlistWithCount(saved) : nav.wishlist}
              title={nav.wishlist}
            >
              <Heart className={cn('size-5', saved > 0 && 'fill-accent-700/15 text-accent-700')} strokeWidth={1.6} aria-hidden />
              {saved > 0 && (
                <span
                  key={saved}
                  className="absolute end-0.5 top-0.5 flex min-w-5 animate-pop items-center justify-center rounded-full bg-gold-400 px-1 text-[11px] font-semibold leading-5 text-accent-950 ring-2 ring-background"
                >
                  {saved}
                </span>
              )}
            </Link>
            {orderingOpen && (
            <Link href="/bag" className={cn(iconButton, '-me-2 lg:me-0')} aria-label={nav.bagWithCount(count)}>
              <ShoppingBag className="size-5" strokeWidth={1.6} aria-hidden />
              {count > 0 && (
                <span
                  // Re-mounts when the count changes, so the badge pops on every add.
                  key={count}
                  className="absolute end-0.5 top-0.5 flex min-w-5 animate-pop items-center justify-center rounded-full bg-accent-700 px-1 text-[11px] font-semibold leading-5 text-white ring-2 ring-background"
                >
                  {count}
                </span>
              )}
            </Link>
            )}
            <Button asChild size="sm" className="ms-3 hidden whitespace-nowrap xl:inline-flex">
              <Link href="/abayas">
                {nav.cta}
                <ArrowRight className="rtl:-scale-x-100" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent
          hideClose
          className="inset-y-0 top-0 ltr:left-0 ltr:right-auto rtl:left-auto rtl:right-0 flex h-full max-h-none w-[88vw] max-w-sm flex-col rounded-none rounded-e-2xl bg-accent-950 p-0 text-white ltr:data-[state=open]:slide-in-from-left rtl:data-[state=open]:slide-in-from-right sm:ltr:left-0 sm:rtl:left-auto sm:rtl:right-0 sm:top-0 sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:rounded-e-2xl"
        >
          <div className="bg-weave flex flex-1 flex-col p-6">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2.5 pe-0 text-2xl text-white">
                <BrandMark className="h-8 text-accent-200" />
                {brand.name}
              </DialogTitle>
              <DialogClose
                className="inline-flex size-11 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
                aria-label={nav.closeMenu}
              >
                <X className="size-5" aria-hidden />
              </DialogClose>
            </div>
            <nav aria-label={nav.mobileLabel} className="mt-10 flex flex-col">
              {[
                { href: '/', label: nav.home },
                ...links,
                { href: loggedIn ? '/account' : '/login', label: loggedIn ? nav.account : nav.login },
                { href: loggedIn ? '/account#wishlist' : loginHref('/account#wishlist'), label: nav.wishlist },
                ...(loggedIn
                  ? [
                      { href: '/orders', label: nav.orders },
                      { href: '/downloads', label: nav.downloads },
                    ]
                  : []),
                ...(orderingOpen ? [{ href: '/bag', label: nav.bag }] : []),
              ].map((l, i) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  style={{ animationDelay: `${120 + i * 60}ms` }}
                  className="group flex items-baseline gap-4 border-b border-white/10 py-4 motion-safe:animate-fade-up focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
                >
                  <span className="w-6 font-display text-sm text-accent-300">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-display text-2xl font-medium transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
                    {l.label}
                  </span>
                </Link>
              ))}
            </nav>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <LanguageSwitch variant="menu" />
              <CurrencySwitch variant="menu" />
            </div>
            <p className="mt-auto pt-8 text-[11px] uppercase tracking-[0.3em] text-accent-200/80">{nav.menuFooter}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Slim bar above the header, gently rotating through the announcements written in the admin
 * (Announcements page; English and Arabic, with dates). Hidden while none is live.
 */
function AnnouncementBar() {
  const { nav } = useStrings();
  const [index, setIndex] = useState(0);
  const live = useAnnouncements();
  const messages: { text: string; linkPath: string | null }[] = live.data ?? [];

  useEffect(() => {
    if (messages.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % messages.length), ANNOUNCEMENT_MS);
    return () => window.clearInterval(timer);
  }, [messages.length]);

  if (messages.length === 0) return null;
  return (
    <div className="relative h-10 overflow-hidden bg-[linear-gradient(90deg,#2E0D14_0%,#5A1823_50%,#2E0D14_100%)] text-accent-50 sm:h-11">
      {/* A gold sheen passes across now and then */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 -start-1/3 w-1/3 bg-gradient-to-r from-transparent via-gold-200/25 to-transparent motion-safe:animate-[announce-sheen_5s_ease-in-out_infinite]" />
      {messages.map((m, i) => {
        const inner = (
          <>
            <Sparkles className="me-2 size-3.5 shrink-0 text-gold-300 motion-safe:animate-pulse" aria-hidden />
            <span className="bg-gradient-to-r from-gold-100 via-white to-gold-100 bg-clip-text text-transparent">{m.text}</span>
            {m.linkPath ? (
              <span className="ms-2.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-gold-300 px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-accent-950 transition-colors group-hover/announce:bg-gold-200">
                {nav.announcementGo}
                <ArrowRight className="size-3 rtl:-scale-x-100" aria-hidden />
              </span>
            ) : (
              <Sparkles className="ms-2 size-3.5 shrink-0 text-gold-300 motion-safe:animate-pulse" aria-hidden />
            )}
          </>
        );
        const className = cn(
          'group/announce absolute inset-0 flex items-center justify-center px-4 text-center text-[11px] font-semibold uppercase tracking-[0.2em] transition-all duration-700 ease-out sm:text-[13px]',
          i === index ? 'translate-y-0 opacity-100' : i === (index + messages.length - 1) % messages.length ? '-translate-y-full opacity-0' : 'translate-y-full opacity-0',
        );
        return m.linkPath ? (
          <Link key={m.text} href={m.linkPath} aria-hidden={i !== index} tabIndex={i === index ? 0 : -1} className={className}>
            {inner}
          </Link>
        ) : (
          <p key={m.text} aria-hidden={i !== index} className={className}>
            {inner}
          </p>
        );
      })}
    </div>
  );
}
