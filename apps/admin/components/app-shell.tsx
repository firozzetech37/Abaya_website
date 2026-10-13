'use client';

import { type MeResponse, staffHomePath, stationsForRoles } from '@abaya/contracts';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  BellRing,
  Camera,
  ChevronsUpDown,
  ClipboardCheck,
  Coins,
  ScanSearch,
  Download,
  House,
  Images,
  KeyRound,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ScrollText,
  Scissors,
  Shirt,
  ShieldCheck,
  Sparkles,
  PenTool,
  Pin,
  SlidersHorizontal,
  Users,
  X, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { STATION_ICONS } from '@/components/workshop/stations';
import { ROLE_LABELS, strings } from '@/content/strings';
import { SECURITY_PATH, useAuth } from '@/lib/auth';
import { initials } from '@/lib/format';
import { type Capability, can } from '@/lib/permissions';
import { useWorkshopSummary } from '@/lib/queries/workshop';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  capability?: Capability;
  match: (pathname: string, status: string | null) => boolean;
  /** Workshop stations: jobs waiting there (amber when something is overdue or on hold). */
  count?: { value: number; alert: boolean };
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    items: [{ href: '/', label: strings.nav.dashboard, icon: LayoutDashboard, match: (p) => p === '/' }],
  },
  {
    label: strings.nav.catalogSection,
    items: [
      {
        href: '/designs',
        label: strings.nav.designs,
        icon: Shirt,
        capability: 'viewDesigns',
        match: (p, s) => p.startsWith('/designs') && s !== 'IN_REVIEW',
      },
      {
        href: '/designs?status=IN_REVIEW',
        label: strings.nav.review,
        icon: ClipboardCheck,
        capability: 'manageCatalog',
        match: (p, s) => p === '/designs' && s === 'IN_REVIEW',
      },
      { href: '/references', label: strings.nav.references, icon: Images, capability: 'viewReferences', match: (p) => p.startsWith('/references') },
      { href: '/options', label: strings.nav.options, icon: SlidersHorizontal, capability: 'manageCatalog', match: (p) => p.startsWith('/options') },
      { href: '/collections', label: strings.nav.collections, icon: Layers, capability: 'manageCatalog', match: (p) => p.startsWith('/collections') },
      { href: '/announcements', label: strings.nav.announcements, icon: Megaphone, capability: 'manageCatalog', match: (p) => p.startsWith('/announcements') },
      { href: '/customer-previews', label: strings.nav.customerPreviews, icon: Sparkles, capability: 'manageCatalog', match: (p) => p.startsWith('/customer-previews') },
      { href: '/fashn-usage', label: strings.nav.fashnUsage, icon: Coins, capability: 'manageCatalog', match: (p) => p.startsWith('/fashn-usage') },
      { href: '/image-check', label: strings.nav.imageCheck, icon: ScanSearch, capability: 'manageCatalog', match: (p) => p.startsWith('/image-check') },
    ],
  },
  {
    label: strings.nav.productionSection,
    items: [
      { href: '/orders', label: strings.nav.orders, icon: Package, capability: 'viewOrders', match: (p) => p.startsWith('/orders') },
      { href: '/tailors', label: strings.nav.makers, icon: Scissors, capability: 'manageMakers', match: (p) => p.startsWith('/tailors') },
      { href: '/customers', label: strings.nav.customers, icon: Users, capability: 'viewCustomers', match: (p) => p.startsWith('/customers') },
      { href: '/waitlist', label: strings.nav.waitlist, icon: BellRing, capability: 'viewWaitlist', match: (p) => p.startsWith('/waitlist') },
      { href: '/downloads', label: strings.nav.downloads, icon: Download, capability: 'viewDownloads', match: (p) => p.startsWith('/downloads') },
    ],
  },
  {
    label: strings.nav.platformSection,
    items: [
      { href: '/staff', label: strings.nav.staff, icon: ShieldCheck, capability: 'manageStaff', match: (p) => p.startsWith('/staff') },
      { href: '/audit', label: strings.nav.audit, icon: ScrollText, capability: 'viewAuditLog', match: (p) => p.startsWith('/audit') },
    ],
  },
];

/** Office staff land on the dashboard; designers in the Studio; everyone else in the workshop. */
const isOffice = (me: MeResponse) => staffHomePath(me.roles) === '/';
const isDesignerOnly = (me: MeResponse) => staffHomePath(me.roles) === '/studio';

/** Designer Studio (docs/apps/studio.md): designers, the catalog manager and super admin. */
const STUDIO: NavSection = {
  label: strings.nav.studioSection,
  items: [
    { href: '/studio', label: strings.nav.studioHome, icon: House, capability: 'useStudio', match: (p) => p === '/studio' },
    { href: '/studio/ai', label: strings.nav.aiDesign, icon: Sparkles, capability: 'useStudio', match: (p) => p.startsWith('/studio/ai') },
    { href: '/studio/catalog', label: strings.nav.aiCatalog, icon: Camera, capability: 'useStudio', match: (p) => p.startsWith('/studio/catalog') },
    { href: '/studio/inspiration', label: strings.nav.inspiration, icon: Pin, capability: 'useStudio', match: (p) => p.startsWith('/studio/inspiration') },
  ],
};

/** A designer's own work: their designs and the references assigned to them. */
const DESIGNER_WORK: NavSection = {
  label: strings.nav.catalogSection,
  items: [
    { href: '/designs?mine=true', label: strings.nav.myDesigns, icon: PenTool, capability: 'viewDesigns', match: (p) => p.startsWith('/designs') },
    { href: '/references', label: strings.nav.references, icon: Images, capability: 'viewReferences', match: (p) => p.startsWith('/references') },
  ],
};

/** The stations this person works, with live counts (all six for managers). */
function useWorkshopSection(me: MeResponse): NavSection | null {
  const stations = stationsForRoles(me.roles);
  const summary = useWorkshopSummary(stations.length > 0);
  if (stations.length === 0) return null;
  const counts = new Map((summary.data ?? []).map((c) => [c.station, c]));
  return {
    label: strings.nav.workshop,
    items: [
      ...(stations.length > 1
        ? [{ href: '/workshop', label: strings.workshop.home, icon: House, match: (p: string) => p === '/workshop' }]
        : []),
      ...stations.map((station) => {
        const c = counts.get(station);
        return {
          href: `/workshop/${station}`,
          label: strings.workshop.stations[station].name,
          icon: STATION_ICONS[station],
          match: (p: string) => p === `/workshop/${station}` || p.startsWith(`/workshop/${station}/`),
          count: c ? { value: c.waiting + c.onHold, alert: c.overdue + c.onHold > 0 } : undefined,
        };
      }),
    ],
  };
}

function NavLinks({ me, onNavigate }: { me: MeResponse; onNavigate?: () => void }) {
  const pathname = usePathname();
  const status = useSearchParams().get('status');
  const workshop = useWorkshopSection(me);
  // Office staff: Dashboard, Catalog, Production, Workshop, Platform. Workshop staff: their stations only.
  const sections = isOffice(me)
    ? [NAV[0]!, STUDIO, ...NAV.slice(1, 3), ...(workshop ? [workshop] : []), ...NAV.slice(3)]
    : isDesignerOnly(me)
      ? [STUDIO, DESIGNER_WORK, ...(workshop ? [workshop] : [])]
      : workshop
        ? [workshop]
        : [];
  return (
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {sections.map((section, i) => {
        const items = section.items.filter((item) => !item.capability || can(me.roles, item.capability));
        if (items.length === 0) return null;
        return (
          <div key={section.label ?? i}>
            {section.label ? (
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{section.label}</p>
            ) : null}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = item.match(pathname, status);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-9 items-center gap-2.5 rounded-md px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400',
                        active
                          ? 'bg-accent-800 font-medium text-white'
                          : 'text-accent-100/80 hover:bg-accent-800/60 hover:text-white',
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.count && item.count.value > 0 ? (
                        <span
                          className={cn(
                            'min-w-[1.5rem] rounded-full px-1.5 text-center text-xs font-semibold tabular-nums',
                            item.count.alert ? 'bg-amber-400 text-amber-950' : active ? 'bg-white/20 text-white' : 'bg-accent-800 text-accent-100',
                          )}
                        >
                          {item.count.value}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

const MENU_ITEM =
  'flex h-9 cursor-pointer select-none items-center gap-2 rounded-md px-2 text-sm text-foreground outline-none data-[highlighted]:bg-neutral-100';

/** User menu: security (two-factor) and sign out. */
function UserFooter({ me, onNavigate }: { me: MeResponse; onNavigate?: () => void }) {
  const { signOut } = useAuth();
  const display = me.name ?? me.email ?? me.phone ?? '';
  const staffRoles = me.roles.filter((r) => r !== 'CUSTOMER');
  return (
    <div className="border-t border-accent-800 p-3">
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger
          className="flex w-full items-center gap-2.5 rounded-md p-1 text-left hover:bg-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 data-[state=open]:bg-accent-800"
          aria-label={strings.account.userMenu}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-700 text-xs font-semibold text-white">
            {initials(display)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white" title={display}>
              {display}
            </span>
            <span className="block truncate text-xs text-accent-200/80">{staffRoles.map((r) => ROLE_LABELS[r]).join(', ')}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-accent-100/80" aria-hidden />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={6}
            className="z-50 min-w-[14rem] rounded-lg border border-border bg-surface p-1 shadow-lg"
          >
            <DropdownMenu.Item asChild className={MENU_ITEM}>
              <Link href={SECURITY_PATH} onClick={onNavigate}>
                <KeyRound className="size-4 text-muted" aria-hidden />
                {strings.account.securityMenuItem}
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item className={MENU_ITEM} onSelect={() => void signOut()}>
              <LogOut className="size-4 text-muted" aria-hidden />
              {strings.common.signOut}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

function Brand({ me }: { me: MeResponse }) {
  return (
    <Link
      href={staffHomePath(me.roles) ?? '/'}
      className="flex items-baseline gap-2 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
    >
      <span className="font-display text-2xl font-semibold text-white">Abaya</span>
      <span className="text-xs uppercase tracking-widest text-accent-200/80">{isOffice(me) ? 'Admin' : isDesignerOnly(me) ? strings.nav.studioSection : strings.workshop.brand}</span>
    </Link>
  );
}

/** "/" focuses the page's search box (any input with data-page-search). */
function useSlashToSearch() {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const input = document.querySelector<HTMLInputElement>('[data-page-search]');
      if (input) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function AppShell({ me, children }: { me: MeResponse; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  useSlashToSearch();

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {strings.common.skipToContent}
      </a>

      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-accent-900 lg:flex">
        <div className="flex h-14 items-center px-4">
          <Brand me={me} />
        </div>
        <React.Suspense fallback={<div className="flex-1" />}>
          <NavLinks me={me} />
        </React.Suspense>
        <UserFooter me={me} />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-accent-800 bg-accent-900 px-4 lg:hidden">
        <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogPrimitive.Trigger
            className="-ml-2 rounded-md p-2.5 text-white hover:bg-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            aria-label={strings.common.menu}
          >
            <Menu className="size-5" />
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-neutral-950/50" />
            <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-accent-900 shadow-xl focus-visible:outline-none">
              <DialogPrimitive.Title className="sr-only">{strings.common.menu}</DialogPrimitive.Title>
              <div className="flex h-14 items-center justify-between px-4">
                <Brand me={me} />
                <DialogPrimitive.Close
                  className="rounded-md p-2 text-white hover:bg-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                  aria-label={strings.common.close}
                >
                  <X className="size-5" />
                </DialogPrimitive.Close>
              </div>
              <React.Suspense fallback={<div className="flex-1" />}>
                <NavLinks me={me} onNavigate={() => setMobileOpen(false)} />
              </React.Suspense>
              <UserFooter me={me} onNavigate={() => setMobileOpen(false)} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
        <Brand me={me} />
      </header>

      <main id="main" className="lg:pl-60">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
