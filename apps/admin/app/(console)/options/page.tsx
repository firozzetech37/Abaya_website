'use client';

import { type AdminOptionGroupDto,
  type AdminOptionValueDto,
  type AdminSizeBandDto,
  paise, isSwatchGroup } from '@abaya/contracts';
import { Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { ErrorState, ForbiddenState, TableSkeleton } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, MoneyInput } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AddValueDialog } from '@/components/options/add-value-dialog';
import { strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { formatMoney, paiseToRupeesInput, rupeesInputToPaise } from '@/lib/format';
import {
  useOptionGroups,
  useSizeBands,
  useUpdateOptionValue,
  useUpdateSizeBand,
} from '@/lib/queries/catalog';

const o = strings.options;
const HEX = /^#[0-9A-Fa-f]{6}$/;

const validMoney = (t: string) => {
  const p = rupeesInputToPaise(t);
  return p !== null && paise.safeParse(p).success;
};

function ColourPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        aria-label={label}
        value={HEX.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-8 w-8 cursor-pointer rounded border border-border bg-surface p-0.5"
      />
      <Input aria-label={`${label} hex`} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-24 font-mono text-xs" placeholder="#000000" />
    </div>
  );
}

function OptionValueRow({ value, isColour }: { value: AdminOptionValueDto; isColour: boolean }) {
  const update = useUpdateOptionValue();
  const [name, setName] = React.useState(value.name);
  const [surcharge, setSurcharge] = React.useState(paiseToRupeesInput(value.surchargeInPaise));
  const [hex, setHex] = React.useState(value.colourHex ?? '');
  const [confirm, setConfirm] = React.useState(false);

  const surchargeChanged = surcharge !== paiseToRupeesInput(value.surchargeInPaise);
  const dirty = name !== value.name || surchargeChanged || hex !== (value.colourHex ?? '');
  const valid = name.trim().length > 0 && validMoney(surcharge) && (hex === '' || HEX.test(hex));

  async function save() {
    await update.mutateAsync({
      id: value.id,
      body: {
        name: name.trim(),
        surchargeInPaise: rupeesInputToPaise(surcharge) ?? value.surchargeInPaise,
        ...(isColour && hex ? { colourHex: hex.toUpperCase() } : {}),
      },
    });
    toast.success(o.valueSaved);
  }

  return (
    <TR className={!value.isActive ? 'bg-neutral-50 text-muted' : undefined}>
      <TD className="w-1/3">
        <div className="flex items-center gap-2">
          {isColour ? (
            <span className="size-5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: HEX.test(hex) ? hex : 'transparent' }} aria-hidden />
          ) : null}
          <div className="min-w-0 flex-1">
            <Input aria-label={`${o.name}: ${value.code}`} value={name} onChange={(e) => setName(e.target.value)} className="h-8" maxLength={60} />
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted">{value.code}</p>
          </div>
        </div>
      </TD>
      <TD className="w-40">
        <MoneyInput aria-label={`${o.surcharge}: ${value.name}`} value={surcharge} aria-invalid={!validMoney(surcharge)} onChange={(e) => setSurcharge(e.target.value)} className="h-8" />
      </TD>
      {isColour ? (
        <TD>
          <ColourPicker value={hex} onChange={setHex} label={`${o.colour}: ${value.name}`} />
        </TD>
      ) : null}
      <TD className="w-24">
        <Switch
          checked={value.isActive}
          aria-label={`${o.activeLabel}: ${value.name}`}
          disabled={update.isPending}
          onCheckedChange={(isActive) =>
            void update
              .mutateAsync({ id: value.id, body: { isActive } })
              .then(() => toast.success(o.valueSaved))
              .catch(() => undefined)
          }
        />
      </TD>
      <TD className="w-28 text-right">
        {dirty ? (
          <Button
            size="sm"
            disabled={!valid}
            loading={update.isPending}
            onClick={() => (surchargeChanged ? setConfirm(true) : void save().catch(() => undefined))}
          >
            {strings.common.save}
          </Button>
        ) : null}
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={o.surchargeConfirmTitle}
          description={o.surchargeConfirmBody(value.name, formatMoney(value.surchargeInPaise), formatMoney(rupeesInputToPaise(surcharge) ?? 0))}
          onConfirm={save}
        />
      </TD>
    </TR>
  );
}

function GroupCard({ group }: { group: AdminOptionGroupDto }) {
  const [adding, setAdding] = React.useState(false);
  const isColour = isSwatchGroup(group.code);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            {group.name}
            {group.isRequired ? <Badge tone="accent">{o.required}</Badge> : null}
          </CardTitle>
          <CardDescription>{group.selectionType === 'SINGLE' ? o.single : o.multi}</CardDescription>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          <Plus /> {o.addValue}
        </Button>
      </CardHeader>
      {group.values.length === 0 ? (
        <p className="p-4 text-sm text-muted">{o.emptyGroup}</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{o.name}</TH>
              <TH>{o.surcharge}</TH>
              {isColour ? <TH>{o.colour}</TH> : null}
              <TH>{o.activeLabel}</TH>
              <TH>
                <span className="sr-only">{strings.common.save}</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {group.values.map((v) => (
              <OptionValueRow key={`${v.id}:${v.surchargeInPaise}:${v.name}:${v.colourHex ?? ''}`} value={v} isColour={isColour} />
            ))}
          </TBody>
        </Table>
      )}
      <AddValueDialog group={group} open={adding} onOpenChange={setAdding} />
    </Card>
  );
}

function SizeBandRow({ band }: { band: AdminSizeBandDto }) {
  const update = useUpdateSizeBand();
  const [label, setLabel] = React.useState(band.label);
  const [adj, setAdj] = React.useState(paiseToRupeesInput(band.adjustmentInPaise));
  const [confirm, setConfirm] = React.useState(false);
  const adjChanged = adj !== paiseToRupeesInput(band.adjustmentInPaise);
  const dirty = label !== band.label || adjChanged;
  const valid = label.trim().length > 0 && validMoney(adj);

  async function save() {
    await update.mutateAsync({ id: band.id, body: { label: label.trim(), adjustmentInPaise: rupeesInputToPaise(adj) ?? band.adjustmentInPaise } });
    toast.success(o.sizeSaved);
  }

  return (
    <TR className={!band.isActive ? 'bg-neutral-50 text-muted' : undefined}>
      <TD className="w-16 font-mono font-medium">{band.code}</TD>
      <TD>
        <Input aria-label={`${o.sizeLabel}: ${band.code}`} value={label} onChange={(e) => setLabel(e.target.value)} className="h-8" maxLength={80} />
      </TD>
      <TD className="w-40">
        <MoneyInput aria-label={`${o.adjustment}: ${band.code}`} value={adj} aria-invalid={!validMoney(adj)} onChange={(e) => setAdj(e.target.value)} className="h-8" />
      </TD>
      <TD className="hidden whitespace-nowrap text-xs text-muted md:table-cell">
        {band.bustMinCm !== null || band.bustMaxCm !== null ? `${band.bustMinCm ?? '–'}–${band.bustMaxCm ?? '–'} cm` : '—'}
      </TD>
      <TD className="w-24">
        <Switch
          checked={band.isActive}
          aria-label={`${o.activeLabel}: ${band.code}`}
          disabled={update.isPending}
          onCheckedChange={(isActive) =>
            void update
              .mutateAsync({ id: band.id, body: { isActive } })
              .then(() => toast.success(o.sizeSaved))
              .catch(() => undefined)
          }
        />
      </TD>
      <TD className="w-28 text-right">
        {dirty ? (
          <Button size="sm" disabled={!valid} loading={update.isPending} onClick={() => (adjChanged ? setConfirm(true) : void save().catch(() => undefined))}>
            {strings.common.save}
          </Button>
        ) : null}
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={o.surchargeConfirmTitle}
          description={o.surchargeConfirmBody(band.label, formatMoney(band.adjustmentInPaise), formatMoney(rupeesInputToPaise(adj) ?? 0))}
          onConfirm={save}
        />
      </TD>
    </TR>
  );
}

export default function OptionsPage() {
  const me = useCurrentUser();
  const groups = useOptionGroups();
  const bands = useSizeBands();
  if (!me.can('manageCatalog')) return <ForbiddenState />;

  return (
    <>
      <PageHeader title={o.title} subtitle={o.subtitle} />
      <Tabs defaultValue="options">
        <TabsList>
          <TabsTrigger value="options">{o.tabsOptions}</TabsTrigger>
          <TabsTrigger value="sizes">{o.tabsSizes}</TabsTrigger>
        </TabsList>
        <TabsContent value="options" className="space-y-4">
          {groups.isPending ? (
            <Card>
              <TableSkeleton />
            </Card>
          ) : groups.isError ? (
            <Card>
              <ErrorState error={groups.error} onRetry={() => void groups.refetch()} />
            </Card>
          ) : (
            groups.data.map((g) => <GroupCard key={g.id} group={g} />)
          )}
        </TabsContent>
        <TabsContent value="sizes">
          <Card>
            {bands.isPending ? (
              <TableSkeleton />
            ) : bands.isError ? (
              <ErrorState error={bands.error} onRetry={() => void bands.refetch()} />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>{strings.common.code}</TH>
                    <TH>{o.sizeLabel}</TH>
                    <TH>{o.adjustment}</TH>
                    <TH className="hidden md:table-cell">{o.bust}</TH>
                    <TH>{o.activeLabel}</TH>
                    <TH>
                      <span className="sr-only">{strings.common.save}</span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {bands.data.map((b) => (
                    <SizeBandRow key={`${b.id}:${b.label}:${b.adjustmentInPaise}`} band={b} />
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
