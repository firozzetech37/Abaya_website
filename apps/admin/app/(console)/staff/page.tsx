'use client';

import {
  type AdminUserDto,
  type Role,
  ROLES,
  STAFF_ROLES,
  staffInviteBody,
} from '@abaya/contracts';
import { ChevronLeft, ChevronRight, Copy, Info, MailPlus, Search, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { formatDate } from '@/lib/format';
import { useDebounced } from '@/lib/hooks/use-debounced';
import {
  useCancelInvite,
  useInviteStaff,
  useSetRoles,
  useStaffInvites,
  useUsers,
} from '@/lib/queries/platform';
import { cn } from '@/lib/utils';

const s = strings.staff;

function RolesDialog({ user, onClose }: { user: AdminUserDto; onClose: () => void }) {
  const setRoles = useSetRoles();
  const [roles, setRolesState] = React.useState<Set<Role>>(() => new Set(user.roles));
  const [confirm, setConfirm] = React.useState(false);
  const who = user.name ?? user.email ?? user.phone ?? user.id;
  const list = ROLES.filter((r) => roles.has(r));
  const changed =
    list.join() !== [...user.roles].sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b)).join();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{s.editRolesTitle(who)}</DialogTitle>
          <DialogDescription>{s.editRolesBody}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <fieldset className="space-y-2">
            <legend className="sr-only">{s.colRoles}</legend>
            {ROLES.map((r) => {
              // A tailor needs a tailor record (city): only "Add staff" creates one.
              const addOnly = r === 'MAKER' && !user.roles.includes('MAKER');
              return (
                <label
                  key={r}
                  htmlFor={`role-${r}`}
                  className={cn(
                    'flex items-start gap-3 rounded-md border border-border px-3 py-2.5',
                    addOnly
                      ? 'cursor-not-allowed opacity-60'
                      : 'cursor-pointer hover:bg-neutral-50',
                  )}
                >
                  <Checkbox
                    id={`role-${r}`}
                    className="mt-0.5"
                    disabled={addOnly}
                    checked={roles.has(r)}
                    onCheckedChange={(v) => {
                      const next = new Set(roles);
                      if (v) next.add(r);
                      else next.delete(r);
                      setRolesState(next);
                    }}
                  />
                  <span>
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {ROLE_LABELS[r]}
                      {STAFF_ROLES.includes(r) ? (
                        <ShieldCheck
                          className="size-3.5 text-accent-600"
                          aria-label={strings.common.staff}
                        />
                      ) : null}
                    </span>
                    <span className="block text-xs text-muted">
                      {addOnly ? s.tailorAddOnly : ROLE_DESCRIPTIONS[r]}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          {list.length === 0 ? <p className="text-xs text-danger">{s.atLeastOne}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {strings.common.cancel}
          </Button>
          <Button disabled={!changed || list.length === 0} onClick={() => setConfirm(true)}>
            {strings.common.save}
          </Button>
        </DialogFooter>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={s.confirmTitle}
          description={s.confirmBody(who, list.map((r) => ROLE_LABELS[r]).join(', '))}
          onConfirm={async () => {
            await setRoles.mutateAsync({ id: user.id, roles: list });
            toast.success(s.saved);
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Roles offered when adding staff, in workshop order (customers are not staff). */
const WORKSHOP_INVITE_ROLES: Role[] = [
  'PATTERN_TECHNICIAN',
  'CUTTER',
  'MAKER',
  'QC',
  'FINISHER',
  'LOGISTICS',
];
const OFFICE_INVITE_ROLES: Role[] = [
  'PRODUCTION_MANAGER',
  'CATALOG_MANAGER',
  'DESIGNER',
  'SUPPORT',
  'SUPER_ADMIN',
];

function RoleChoice({
  role,
  checked,
  onChange,
}: {
  role: Role;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={`invite-${role}`}
      className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 hover:bg-neutral-50"
    >
      <Checkbox
        id={`invite-${role}`}
        className="mt-0.5"
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <span>
        <span className="block text-sm font-medium">{ROLE_LABELS[role]}</span>
        <span className="block text-xs text-muted">{ROLE_DESCRIPTIONS[role]}</span>
      </span>
    </label>
  );
}

function AddStaffDialog({ onClose }: { onClose: () => void }) {
  const invite = useInviteStaff();
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [roles, setRoles] = React.useState<Set<Role>>(new Set());
  const [city, setCity] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const tailor = roles.has('MAKER');
  const toggle = (r: Role, on: boolean) => {
    const next = new Set(roles);
    if (on) next.add(r);
    else next.delete(r);
    setRoles(next);
    setError(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      email: email.trim(),
      name: name.trim() || undefined,
      roles: [...roles],
      ...(tailor ? { tailor: { city: city.trim() } } : {}),
    };
    const parsed = staffInviteBody.safeParse(body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      return setError(
        field === 'roles'
          ? s.atLeastOne
          : field === 'tailor'
            ? s.tailorDetailsRequired
            : `${s.email}: ${parsed.error.issues[0]?.message}`,
      );
    }
    const result = await invite.mutateAsync(parsed.data);
    toast.success(result.invite ? s.added(parsed.data.email) : s.appliedNow(parsed.data.email));
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <form
          noValidate
          onSubmit={(e) => void submit(e).catch(() => undefined)}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{s.addTitle}</DialogTitle>
            <DialogDescription>{s.addBody}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={s.email} htmlFor="invite-email">
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label={s.name} htmlFor="invite-name" optional>
                <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {s.workshopRoles}
              </legend>
              {WORKSHOP_INVITE_ROLES.map((r) => (
                <React.Fragment key={r}>
                  <RoleChoice role={r} checked={roles.has(r)} onChange={(v) => toggle(r, v)} />
                  {r === 'MAKER' && tailor ? (
                    <div className="ml-7 space-y-2 rounded-md bg-neutral-50 p-3">
                      <p className="text-xs font-medium text-muted">{s.tailorDetails}</p>
                      <div className="sm:max-w-xs">
                        <Field label={s.tailorCity} htmlFor="invite-city">
                          <Input
                            id="invite-city"
                            value={city}
                            onChange={(e) => {
                              setCity(e.target.value);
                              setError(null);
                            }}
                          />
                        </Field>
                      </div>
                    </div>
                  ) : null}
                </React.Fragment>
              ))}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {s.officeRoles}
              </legend>
              {OFFICE_INVITE_ROLES.map((r) => (
                <RoleChoice
                  key={r}
                  role={r}
                  checked={roles.has(r)}
                  onChange={(v) => toggle(r, v)}
                />
              ))}
            </fieldset>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              {strings.common.cancel}
            </Button>
            <Button type="submit" loading={invite.isPending}>
              <MailPlus /> {s.addStaff}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Added by email, not signed in yet. */
function PendingInvites() {
  const invites = useStaffInvites();
  const cancel = useCancelInvite();
  const [cancelling, setCancelling] = React.useState<{ id: string; email: string } | null>(null);
  const pending = (invites.data ?? []).filter((i) => i.status === 'PENDING');
  const loginUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/login`;

  if (invites.isError)
    return <ErrorState error={invites.error} onRetry={() => void invites.refetch()} />;
  if (invites.isPending || pending.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="flex-wrap">
        <CardTitle>{s.pendingTitle}</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void navigator.clipboard
              .writeText(loginUrl)
              .then(() => toast.success(s.copied))
              .catch(() => undefined)
          }
        >
          <Copy /> {s.staffLoginLink}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {pending.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.name ?? i.email}</p>
                <p className="truncate text-xs text-muted">
                  {i.name ? `${i.email} · ` : ''}
                  {s.invitedOn(formatDate(i.createdAt))}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {i.roles.map((r) => (
                  <Badge key={r} tone="accent">
                    {ROLE_LABELS[r]}
                  </Badge>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCancelling({ id: i.id, email: i.email })}
              >
                {s.cancelInvite}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={s.cancelInviteTitle}
        description={cancelling ? s.cancelInviteBody(cancelling.email) : ''}
        tone="danger"
        confirmLabel={s.cancelInvite}
        onConfirm={async () => {
          if (!cancelling) return;
          await cancel.mutateAsync(cancelling.id);
          toast.success(s.inviteCancelled);
        }}
      />
    </Card>
  );
}

function UsersTable({ q, role }: { q?: string; role?: Role }) {
  const me = useCurrentUser();
  const [cursors, setCursors] = React.useState<(string | undefined)[]>([undefined]);
  const users = useUsers({ q, role, cursor: cursors[cursors.length - 1] });
  const [editing, setEditing] = React.useState<AdminUserDto | null>(null);

  if (users.isPending) return <TableSkeleton />;
  if (users.isError) return <ErrorState error={users.error} onRetry={() => void users.refetch()} />;
  if (users.data.items.length === 0 && cursors.length === 1) return <EmptyState title={s.empty} />;

  return (
    <>
      <Table>
        <THead>
          <TR>
            <TH>{s.colUser}</TH>
            <TH>{s.colRoles}</TH>
            <TH className="hidden md:table-cell">{s.colJoined}</TH>
            <TH>{s.colStatus}</TH>
            <TH>
              <span className="sr-only">{s.editRoles}</span>
            </TH>
          </TR>
        </THead>
        <TBody className={users.isPlaceholderData ? 'opacity-60' : undefined}>
          {users.data.items.map((u) => (
            <TR key={u.id} className="hover:bg-neutral-50">
              <TD>
                <p className="font-medium">
                  {u.name ?? '—'}
                  {u.id === me.id ? (
                    <span className="ml-1 text-xs text-muted">{strings.common.you}</span>
                  ) : null}
                </p>
                <p className="text-xs text-muted">
                  {[u.email, u.phone].filter(Boolean).join(' · ')}
                </p>
              </TD>
              <TD>
                <div className="flex flex-wrap gap-1">
                  {u.roles.map((r) => (
                    <Badge
                      key={r}
                      tone={
                        r === 'SUPER_ADMIN'
                          ? 'danger'
                          : STAFF_ROLES.includes(r)
                            ? 'accent'
                            : 'neutral'
                      }
                    >
                      {ROLE_LABELS[r]}
                    </Badge>
                  ))}
                </div>
              </TD>
              <TD className="hidden text-xs text-muted md:table-cell">{formatDate(u.createdAt)}</TD>
              <TD>
                <Badge tone={u.isActive ? 'success' : 'neutral'}>
                  {u.isActive ? strings.common.active : strings.common.inactive}
                </Badge>
              </TD>
              <TD className="text-right">
                <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
                  {s.editRoles}
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={cursors.length === 1}
          onClick={() => setCursors((c) => c.slice(0, -1))}
        >
          <ChevronLeft /> {strings.common.previous}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!users.data.nextCursor || users.isPlaceholderData}
          onClick={() => setCursors((c) => [...c, users.data.nextCursor ?? undefined])}
        >
          {strings.common.next} <ChevronRight />
        </Button>
      </div>
      {editing ? <RolesDialog user={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

export default function StaffPage() {
  const me = useCurrentUser();
  const [search, setSearch] = React.useState('');
  const q = useDebounced(search.trim(), 300);
  const [role, setRole] = React.useState<Role | ''>('');
  const [adding, setAdding] = React.useState(false);

  if (!me.can('manageStaff')) return <ForbiddenState />;

  return (
    <>
      <PageHeader
        title={s.title}
        subtitle={s.subtitle}
        actions={
          <Button onClick={() => setAdding(true)}>
            <MailPlus /> {s.addStaff}
          </Button>
        }
      />
      <div
        className="mb-4 flex gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900"
        role="note"
      >
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{s.inviteNote}</p>
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            data-page-search
            type="search"
            aria-label={s.searchPlaceholder}
            placeholder={s.searchPlaceholder}
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <NativeSelect
          aria-label={s.roleFilter}
          value={role}
          onChange={(e) => setRole(e.target.value as Role | '')}
          className="w-52"
        >
          <option value="">
            {s.roleFilter}: {strings.common.all}
          </option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <PendingInvites />
      <Card>
        <UsersTable key={`${q}|${role}`} q={q || undefined} role={role || undefined} />
      </Card>
      {adding ? <AddStaffDialog onClose={() => setAdding(false)} /> : null}
    </>
  );
}
