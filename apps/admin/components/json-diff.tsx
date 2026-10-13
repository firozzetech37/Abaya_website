import { strings } from '@/content/strings';
import { cn } from '@/lib/utils';

type Flat = Record<string, string>;

function flatten(value: unknown, prefix = '', out: Flat = {}): Flat {
  if (value === null || value === undefined) {
    if (prefix) out[prefix] = value === null ? 'null' : '—';
    return out;
  }
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== 'object')) {
      out[prefix || '(value)'] = JSON.stringify(value);
      return out;
    }
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    return out;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0 && prefix) out[prefix] = '{}';
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  out[prefix || '(value)'] = typeof value === 'string' ? value : JSON.stringify(value);
  return out;
}

/** Field-by-field before/after table for audit entries. */
export function JsonDiff({ before, after }: { before: unknown; after: unknown }) {
  const a = flatten(before);
  const b = flatten(after);
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  if (keys.length === 0) return <p className="text-xs text-muted">{strings.audit.noDiff}</p>;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="bg-neutral-50 text-left text-muted">
          <tr>
            <th className="px-2 py-1.5 font-medium">{strings.audit.field}</th>
            <th className="px-2 py-1.5 font-medium">{strings.audit.before}</th>
            <th className="px-2 py-1.5 font-medium">{strings.audit.after}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const changed = a[k] !== b[k];
            return (
              <tr key={k} className="border-t border-border align-top">
                <td className="px-2 py-1.5 font-mono text-neutral-700">{k}</td>
                <td className={cn('break-all px-2 py-1.5 font-mono', changed && a[k] !== undefined && 'bg-red-50 text-red-800')}>
                  {a[k] ?? '—'}
                </td>
                <td className={cn('break-all px-2 py-1.5 font-mono', changed && b[k] !== undefined && 'bg-emerald-50 text-emerald-800')}>
                  {b[k] ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
