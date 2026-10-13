'use client';

import { Link, useRouter } from '@/components/i18n/navigation';
import {type AddressDto, indianPhone } from '@abaya/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowUpRight, Bell, Download, Heart, LogOut, type LucideIcon, MapPin, Package, Pencil, Plus, Ruler, ShieldCheck, Sparkles, Trash2, UserRound } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { DesignImage } from '@/components/design/design-image';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { fieldAria, FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Alert, Badge, Skeleton } from '@/components/ui/misc';
import { useMyAiPictures } from '@/lib/queries/try-on';
import { MyAiPictures } from './my-ai-pictures';
import { EightPointStar, StarPattern } from '@/components/ornament/geometric';
import { useStrings } from '@/components/i18n/locale-provider';
import { errorMessage, isApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import {
  useAddresses,
  useDataExport,
  useDeleteAccount,
  useDeleteAddress,
  useDeleteMeasurement,
  useMe,
  useMeasurements,
  useToggleWishlist,
  useUpdateProfile,
  useWishlist,
} from '@/lib/queries/me';
import { cn, formatDate } from '@/lib/utils';
import { useOrders } from '@/lib/queries/orders';
import { AddressForm, AddressLines } from './address-form';
import { WhatsAppUpdates } from './whatsapp-updates';
import { useMoney } from '@/lib/currency';


export function AccountView() {
  const { account: t, auth, nav } = useStrings();
  const sections = [
    { id: 'profile', label: t.sections.profile, body: t.sectionsBody.profile, icon: UserRound },
    { id: 'addresses', label: t.sections.addresses, body: t.sectionsBody.addresses, icon: MapPin },
    { id: 'measurements', label: t.sections.measurements, body: t.sectionsBody.measurements, icon: Ruler },
    { id: 'wishlist', label: t.sections.wishlist, body: t.sectionsBody.wishlist, icon: Heart },
    { id: 'ai-pictures', label: t.sections.aiPictures, body: t.sectionsBody.aiPictures, icon: Sparkles },
    { id: 'notifications', label: t.sections.notifications, body: t.sectionsBody.notifications, icon: Bell },
    { id: 'privacy', label: t.sections.privacy, body: t.sectionsBody.privacy, icon: ShieldCheck },
  ] as const;
  type SectionId = (typeof sections)[number]['id'];
  const section = (id: SectionId) => sections.find((s) => s.id === id)!;
  const me = useMe();
  const orders = useOrders();
  const addresses = useAddresses();
  const measurements = useMeasurements();
  const wishlist = useWishlist();
  const aiPictures = useMyAiPictures();
  const { signOut } = useAuth();
  const router = useRouter();
  const active = useActiveSection(sections.map((s) => s.id));

  const onSignOut = async () => {
    await signOut();
    toast.success(auth.signedOut);
    router.replace('/');
  };

  const firstOrders = orders.data?.pages[0];
  const stats: { label: string; value: string | null; href: string }[] = [
    {
      label: t.stats.orders,
      value: firstOrders ? `${firstOrders.items.length}${firstOrders.nextCursor ? '+' : ''}` : null,
      href: '/orders',
    },
    { label: t.stats.measurements, value: measurements.data ? String(measurements.data.length) : null, href: '#measurements' },
    { label: t.stats.wishlist, value: wishlist.data ? String(wishlist.data.length) : null, href: '#wishlist' },
    { label: t.stats.aiPictures, value: aiPictures.data ? String(aiPictures.data.items.length) : null, href: '#ai-pictures' },
    { label: t.stats.addresses, value: addresses.data ? String(addresses.data.length) : null, href: '#addresses' },
  ];

  return (
    <div className="container py-8 sm:py-12">
      {/* Welcome: a deep burgundy band with her monogram, a quick summary and the main actions */}
      <header className="relative overflow-hidden rounded-[1.75rem] bg-[radial-gradient(120%_140%_at_100%_0%,#7C2B3A_0%,#44111B_55%,#2E0D14_100%)] px-6 py-8 text-sand-50 shadow-[0_40px_80px_-50px_rgba(46,13,20,0.95)] sm:px-10 sm:py-10">
        <StarPattern className="text-gold-200/[0.06]" size={64} />
        <EightPointStar className="pointer-events-none absolute -end-16 -top-16 size-64 text-gold-300/[0.09]" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-5">
            <span
              aria-hidden
              className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-gold-200 to-gold-400 font-display text-2xl font-semibold text-accent-950 shadow-[0_10px_30px_-10px_rgba(221,187,107,0.7)] ring-4 ring-white/10 sm:size-20 sm:text-3xl"
            >
              {(me.data?.name ?? me.data?.email ?? 'A').trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-semibold leading-tight text-white sm:text-5xl">{t.greeting(me.data?.name ?? null)}</h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-sand-200/80">
                {me.data?.email && <span className="truncate">{me.data.email}</span>}
                {me.data?.createdAt && (
                  <span className="inline-flex items-center gap-1.5 text-gold-200">
                    <span aria-hidden className="h-px w-4 bg-gold-300/70" />
                    {t.memberSince(formatDate(me.data.createdAt))}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="gold" size="sm">
              <Link href="/orders">
                <Package aria-hidden />
                {t.viewOrders}
              </Link>
            </Button>
            <Button asChild size="sm" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
              <Link href="/downloads">
                <Download aria-hidden />
                {nav.downloads}
              </Link>
            </Button>
            <Button size="sm" variant="ghost" className="text-sand-100 hover:bg-white/10 hover:text-white" onClick={() => void onSignOut()}>
              <LogOut aria-hidden />
              {t.signOut}
            </Button>
          </div>
        </div>

        <ul className="relative mt-8 grid grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm sm:grid-cols-5">
          {stats.map((s, i) => (
            <li key={s.label} className={cn('border-white/10', i % 2 === 1 && 'border-s', i >= 2 && 'border-t sm:border-t-0', i >= 1 && 'sm:border-s', i === 4 && 'col-span-2 sm:col-span-1')}>
              <Link href={s.href} className="group block px-5 py-4 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-300">
                <span className="block font-display text-3xl font-semibold tabular-nums text-gold-200">
                  {s.value ?? <span className="inline-block h-7 w-8 animate-pulse rounded bg-white/10 align-middle" />}
                </span>
                <span className="mt-0.5 block text-xs uppercase tracking-[0.16em] text-sand-200/70 group-hover:text-sand-100">{s.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
        <nav aria-label={t.title} className="-mx-4 overflow-x-auto px-4 scrollbar-none lg:mx-0 lg:px-0">
          <ul className="flex gap-2 lg:sticky lg:top-24 lg:flex-col lg:gap-1 lg:rounded-2xl lg:border lg:border-gold-200/70 lg:bg-surface lg:p-2 lg:shadow-[0_24px_48px_-40px_rgba(35,28,23,0.5)]">
            {sections.map((s) => {
              const on = active === s.id;
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={on ? 'true' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 lg:rounded-xl lg:border-transparent',
                      on
                        ? 'border-primary bg-primary text-white lg:bg-gradient-to-r lg:from-accent-700 lg:to-accent-800'
                        : 'border-border bg-surface text-neutral-700 hover:border-gold-300 hover:text-foreground lg:bg-transparent lg:hover:bg-sand-50',
                    )}
                  >
                    <s.icon className={cn('size-4', on ? 'text-gold-200' : 'text-accent-700')} aria-hidden />
                    {s.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          <Section {...section('profile')}>
            {me.isPending ? <Skeleton className="h-40" /> : me.isError ? <Alert tone="danger">{errorMessage(me.error)}</Alert> : <ProfileForm name={me.data.name} phone={me.data.phone} email={me.data.email} />}
          </Section>
          <Section {...section('addresses')}>
            <Addresses defaultName={me.data?.name} defaultPhone={me.data?.phone} />
          </Section>
          <Section
            {...section('measurements')}
            action={
              <Button asChild size="sm" variant="secondary">
                <Link href="/account/measurements/new">
                  <Plus aria-hidden />
                  {t.measurements.add}
                </Link>
              </Button>
            }
          >
            <Measurements />
          </Section>
          <Section {...section('wishlist')}>
            <Wishlist />
          </Section>
          <Section {...section('ai-pictures')}>
            <MyAiPictures />
          </Section>
          <Section {...section('notifications')}>
            {me.isPending ? <Skeleton className="h-20" /> : me.isError ? <Alert tone="danger">{errorMessage(me.error)}</Alert> : <WhatsAppUpdates me={me.data} />}
          </Section>
          <Section {...section('privacy')}>
            <Privacy onDeleted={onSignOut} />
          </Section>
        </div>
      </div>
    </div>
  );
}

/** The section the reader is on (for the side menu), from which heading last passed the top third. */
function useActiveSection(ids: readonly string[]): string {
  const [active, setActive] = useState(ids[0] ?? '');
  const key = ids.join(',');
  useEffect(() => {
    const list = key.split(',');
    const pick = () => {
      let current = list[0] ?? '';
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.33) current = id;
      }
      setActive(current);
    };
    window.addEventListener('scroll', pick, { passive: true });
    window.addEventListener('hashchange', pick);
    const timer = window.setTimeout(pick, 0);
    return () => {
      window.removeEventListener('scroll', pick);
      window.removeEventListener('hashchange', pick);
      window.clearTimeout(timer);
    };
  }, [key]);
  return active;
}

function Section({
  id,
  label,
  body,
  icon: Icon,
  action,
  children,
}: {
  id: string;
  label: string;
  body: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-2xl border border-gold-200/70 bg-gradient-to-b from-surface to-[#FFFBF3] p-5 shadow-[0_24px_48px_-40px_rgba(35,28,23,0.5)] sm:p-7"
    >
      <div id={id} className="mb-6 flex scroll-mt-28 flex-wrap items-start justify-between gap-4 border-b border-dashed border-gold-200/80 pb-5">
        <div className="flex items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-gold-100 to-gold-200/70 text-accent-800 ring-1 ring-gold-300/60">
            <Icon className="size-[1.1rem]" aria-hidden />
          </span>
          <div>
            <h2 id={`${id}-title`} className="font-display text-2xl font-semibold leading-tight">
              {label}
            </h2>
            <p className="mt-0.5 text-sm text-muted">{body}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// ───── Profile ─────

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.union([indianPhone, z.literal('')]),
});

function ProfileForm({ name, phone, email }: { name: string | null; phone: string | null; email: string | null }) {
  const { account: t, common } = useStrings();
  const update = useUpdateProfile();
  const form = useForm({ resolver: zodResolver(profileSchema), defaultValues: { name: name ?? '', phone: phone ?? '' } });
  const { errors, isDirty } = form.formState;

  const onSubmit = form.handleSubmit((v) => {
    update.mutate(
      { name: v.name, ...(v.phone ? { phone: v.phone } : {}) },
      {
        onSuccess: (me) => {
          form.reset({ name: me.name ?? '', phone: me.phone ?? '' });
          toast.success(t.profileSaved);
        },
      },
    );
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="profile-name" label={t.name} error={errors.name?.message}>
          <Input {...fieldAria('profile-name', errors.name?.message)} autoComplete="name" {...form.register('name')} />
        </FormField>
        <FormField id="profile-phone" label={t.phone} hint={t.phoneHint} error={errors.phone?.message}>
          <Input {...fieldAria('profile-phone', errors.phone?.message, true)} type="tel" inputMode="tel" autoComplete="tel-national" {...form.register('phone')} />
        </FormField>
      </div>
      {email && (
        <p className="flex flex-wrap items-baseline gap-x-2 rounded-xl bg-sand-50 px-4 py-3 text-sm ring-1 ring-gold-200/60">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{t.email}</span>
          <span className="font-medium text-foreground">{email}</span>
        </p>
      )}
      {update.isError && <Alert tone="danger">{errorMessage(update.error)}</Alert>}
      <Button type="submit" disabled={!isDirty} loading={update.isPending}>
        {update.isPending ? common.saving : common.save}
      </Button>
    </form>
  );
}

// ───── Addresses ─────

function Addresses({ defaultName, defaultPhone }: { defaultName?: string | null; defaultPhone?: string | null }) {
  const { account: t, common } = useStrings();
  const addresses = useAddresses();
  const remove = useDeleteAddress();
  const [editing, setEditing] = useState<AddressDto | 'new' | null>(null);

  if (addresses.isPending) return <Skeleton className="h-28" />;
  if (addresses.isError) return <Alert tone="danger">{errorMessage(addresses.error)}</Alert>;

  return (
    <div className="space-y-3">
      {addresses.data.length === 0 && <EmptyNote icon={MapPin}>{t.addresses.empty}</EmptyNote>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {addresses.data.map((a) => (
          <li
            key={a.id}
            className={cn(
              'relative flex flex-col justify-between gap-4 overflow-hidden rounded-xl border bg-surface p-5 transition-shadow hover:shadow-[0_16px_32px_-26px_rgba(35,28,23,0.55)]',
              a.isDefault ? 'border-gold-300' : 'border-border',
            )}
          >
            {a.isDefault && <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold-300 via-gold-200 to-gold-300" />}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <MapPin className="size-4 text-accent-700" aria-hidden />
                {a.isDefault && <Badge tone="accent">{t.addresses.default}</Badge>}
              </div>
              <AddressLines a={a} />
            </div>
            <div className="flex gap-1 border-t border-dashed border-gold-200/80 pt-3">
              <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                <Pencil aria-hidden />
                {common.edit}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                loading={remove.isPending && remove.variables === a.id}
                onClick={() => {
                  if (!window.confirm(t.addresses.confirmDelete)) return;
                  remove.mutate(a.id, {
                    onSuccess: () => toast.success(t.addresses.deleted),
                    onError: (e) => toast.error(errorMessage(e)),
                  });
                }}
              >
                <Trash2 aria-hidden />
                {common.delete}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setEditing('new')}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gold-300 px-4 py-4 text-sm font-medium text-accent-800 transition-colors hover:bg-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:w-auto sm:px-6"
      >
        <Plus className="size-4" aria-hidden />
        {t.addresses.add}
      </button>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogTitle>{editing === 'new' ? t.addresses.formTitleNew : t.addresses.formTitleEdit}</DialogTitle>
          <div className="mt-5">
            {editing !== null && (
              <AddressForm
                address={editing === 'new' ? undefined : editing}
                defaultName={defaultName}
                defaultPhone={defaultPhone}
                onCancel={() => setEditing(null)}
                onSaved={() => {
                  toast.success(t.addresses.saved);
                  setEditing(null);
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ───── Measurements ─────

function Measurements() {
  const { account: t, common, measurementForm } = useStrings();
  const profiles = useMeasurements();
  const remove = useDeleteMeasurement();

  if (profiles.isPending) return <Skeleton className="h-24" />;
  if (profiles.isError) return <Alert tone="danger">{errorMessage(profiles.error)}</Alert>;
  if (profiles.data.length === 0) return <EmptyNote icon={Ruler}>{t.measurements.empty}</EmptyNote>;

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {profiles.data.map((p) => (
        <li key={p.id} className="rounded-xl border border-border bg-surface p-5 transition-shadow hover:shadow-[0_16px_32px_-26px_rgba(35,28,23,0.55)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-2 font-display text-lg font-semibold">
                {p.name} {p.isDefault && <Badge tone="accent">{common.default}</Badge>}
              </p>
              <p className="mt-0.5 text-xs text-muted">{t.measurements.updated(formatDate(p.updatedAt))}</p>
            </div>
            <Ruler className="size-4 text-gold-500" aria-hidden />
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
            {(
              [
                ['heightCm', p.heightCm],
                ['bustCm', p.bustCm],
                ['waistCm', p.waistCm],
                ['hipCm', p.hipCm],
                ['sleeveLengthCm', p.sleeveLengthCm],
                ['fullLengthCm', p.fullLengthCm],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-sand-50 px-2.5 py-2 ring-1 ring-gold-200/50">
                <dt className="truncate text-[11px] text-muted">{measurementForm.fields[k].label}</dt>
                <dd className="font-display text-base font-semibold tabular-nums text-foreground">
                  {v}
                  <span className="ms-0.5 font-sans text-[11px] font-normal text-muted">cm</span>
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex gap-1 border-t border-dashed border-gold-200/80 pt-3">
            <Button asChild size="sm" variant="ghost">
              <Link href={`/account/measurements/${p.id}`}>
                <Pencil aria-hidden />
                {t.measurements.edit}
              </Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              loading={remove.isPending && remove.variables === p.id}
              onClick={() => {
                if (!window.confirm(t.measurements.confirmDelete)) return;
                remove.mutate(p.id, {
                  onSuccess: () => toast.success(t.measurements.deleted),
                  onError: (e) => toast.error(errorMessage(e)),
                });
              }}
            >
              <Trash2 aria-hidden />
              {common.delete}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}


// ───── Wishlist ─────

function Wishlist() {
  const money = useMoney();
  const { account: t, common } = useStrings();
  const wishlist = useWishlist();
  const toggle = useToggleWishlist();

  if (wishlist.isPending) return <Skeleton className="h-40" />;
  if (wishlist.isError) return <Alert tone="danger">{errorMessage(wishlist.error)}</Alert>;
  if (wishlist.data.length === 0)
    return (
      <EmptyNote icon={Heart}>
        {t.wishlist.empty}{' '}
        <Link href="/abayas" className="font-medium text-accent-800 underline underline-offset-4">
          {t.wishlist.browse}
        </Link>
      </EmptyNote>
    );

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {wishlist.data.map((w) => (
        <li key={w.designId} className="group relative">
          <Link
            href={w.available ? `/abayas/${w.slug}` : '#'}
            aria-disabled={!w.available}
            className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <span className="relative block overflow-hidden rounded-xl ring-1 ring-gold-200/70">
              <DesignImage
                src={w.primaryImageUrl}
                alt={w.name}
                name={w.name}
                sizes="(min-width: 1280px) 220px, (min-width: 640px) 30vw, 45vw"
                className={cn('aspect-[3/4] transition-transform duration-700 group-hover:scale-[1.03]', !w.available && 'opacity-60 grayscale')}
              />
              <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-neutral-950/35 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              {w.available && (
                <span className="absolute bottom-2.5 start-2.5 inline-flex translate-y-1 items-center gap-1 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-medium text-accent-900 opacity-0 shadow-sm backdrop-blur transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                  {t.wishlist.view}
                  <ArrowUpRight className="size-3 rtl:-scale-x-100" aria-hidden />
                </span>
              )}
            </span>
            <p className="mt-2.5 line-clamp-2 font-display text-lg font-semibold leading-snug">{w.name}</p>
          </Link>
          {w.available ? (
            <p className="mt-0.5 text-sm text-neutral-700">
              <span className="text-muted">{common.from}</span> {money(w.fromPriceInPaise)}
            </p>
          ) : (
            <Badge tone="warning" className="mt-1">{t.wishlist.unavailable}</Badge>
          )}
          <button
            type="button"
            aria-label={t.wishlist.removeNamed(w.name)}
            title={t.wishlist.remove}
            disabled={toggle.isPending && toggle.variables?.designId === w.designId}
            onClick={() => toggle.mutate({ designId: w.designId, saved: true }, { onError: (e) => toast.error(errorMessage(e)) })}
            className="absolute end-2.5 top-2.5 flex size-9 items-center justify-center rounded-full bg-surface/90 text-accent-700 shadow-sm backdrop-blur transition-colors hover:bg-surface hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-50"
          >
            <Heart className="size-4 fill-current" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A calm empty state inside a section. */
function EmptyNote({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 rounded-xl border border-dashed border-gold-300/80 bg-sand-50/70 px-4 py-4 text-sm text-neutral-700">
      <Icon className="size-4 shrink-0 text-gold-500" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

// ───── Privacy (DPDP) ─────

function Privacy({ onDeleted }: { onDeleted: () => Promise<void> }) {
  const { account: t, common } = useStrings();
  const exportData = useDataExport();
  const deleteAccount = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const download = () =>
    exportData.mutate(undefined, {
      onSuccess: (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success(t.privacy.downloaded);
      },
      onError: (e) => toast.error(errorMessage(e)),
    });

  const confirmDelete = () =>
    deleteAccount.mutate(undefined, {
      onSuccess: async () => {
        setOpen(false);
        toast.success(t.privacy.deleted);
        await onDeleted();
      },
    });

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-neutral-700">
        {t.privacy.body}{' '}
        <Link href="/policies/privacy" className="text-accent-700 underline underline-offset-2">
          {t.privacy.policyLink}
        </Link>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-surface p-5">
          <p className="flex items-center gap-2 font-medium">
            <Download className="size-4 text-accent-700" aria-hidden />
            {t.privacy.download}
          </p>
          <Button variant="secondary" size="sm" className="self-start" onClick={download} loading={exportData.isPending}>
            {exportData.isPending ? t.privacy.downloading : t.privacy.download}
          </Button>
        </div>
        <div className="flex flex-col justify-between gap-4 rounded-xl border border-red-200 bg-red-50/40 p-5">
          <p className="flex items-center gap-2 font-medium text-danger">
            <Trash2 className="size-4" aria-hidden />
            {t.privacy.deleteTitle}
          </p>
          <Button variant="dangerOutline" size="sm" className="self-start bg-surface" onClick={() => setOpen(true)}>
            {t.privacy.deleteTitle}
          </Button>
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setConfirmText('');
            deleteAccount.reset();
          }
        }}
      >
        <DialogContent>
          <DialogTitle>{t.privacy.deleteTitle}</DialogTitle>
          <DialogDescription>{t.privacy.deleteBody}</DialogDescription>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (confirmText === 'DELETE') confirmDelete();
            }}
          >
            <FormField id="delete-confirm" label={t.privacy.deleteConfirmLabel}>
              <Input id="delete-confirm" autoComplete="off" autoCapitalize="characters" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            </FormField>
            {deleteAccount.isError && (
              <Alert tone={isApiError(deleteAccount.error) && deleteAccount.error.code === 'ACTIVE_ORDERS' ? 'warning' : 'danger'}>
                {errorMessage(deleteAccount.error)}
              </Alert>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {common.cancel}
              </Button>
              <Button type="submit" variant="danger" disabled={confirmText !== 'DELETE'} loading={deleteAccount.isPending}>
                {deleteAccount.isPending ? t.privacy.deleting : t.privacy.deleteButton}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
