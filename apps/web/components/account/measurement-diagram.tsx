import { cn } from '@/lib/utils';

export type MeasureField =
  | 'heightCm'
  | 'bustCm'
  | 'waistCm'
  | 'hipCm'
  | 'shoulderCm'
  | 'sleeveLengthCm'
  | 'fullLengthCm'
  | 'wristCm';

/** Where the tape goes for each measurement, drawn over the silhouette. */
function Highlight({ field }: { field: MeasureField }) {
  const common = { stroke: 'currentColor', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round' as const };
  switch (field) {
    case 'heightCm':
      return (
        <g {...common}>
          <line x1="110" y1="12" x2="110" y2="228" />
          <line x1="104" y1="12" x2="116" y2="12" />
          <line x1="104" y1="228" x2="116" y2="228" />
        </g>
      );
    case 'fullLengthCm':
      return (
        <g {...common}>
          <line x1="68" y1="41" x2="68" y2="228" strokeDasharray="5 3" />
          <line x1="62" y1="41" x2="74" y2="41" />
          <line x1="62" y1="228" x2="74" y2="228" />
        </g>
      );
    case 'shoulderCm':
      return (
        <g {...common}>
          <line x1="37" y1="46" x2="83" y2="46" />
          <circle cx="37" cy="46" r="2" fill="currentColor" />
          <circle cx="83" cy="46" r="2" fill="currentColor" />
        </g>
      );
    case 'bustCm':
      return <ellipse cx="60" cy="68" rx="26" ry="4.5" {...common} />;
    case 'waistCm':
      return <ellipse cx="60" cy="92" rx="25" ry="4" {...common} />;
    case 'hipCm':
      return <ellipse cx="60" cy="118" rx="30" ry="4.5" {...common} />;
    case 'sleeveLengthCm':
      return (
        <g {...common}>
          <polyline points="83,47 93,58 100,125" />
          <circle cx="83" cy="47" r="2" fill="currentColor" />
          <circle cx="100" cy="125" r="2" fill="currentColor" />
        </g>
      );
    case 'wristCm':
      return <ellipse cx="98.5" cy="126" rx="5.5" ry="2.2" {...common} />;
  }
}

/** Inline SVG silhouette with the measured line highlighted. */
export function MeasurementDiagram({ field, label, className }: { field: MeasureField; label: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 240" role="img" aria-label={label} className={cn('h-auto w-full', className)}>
      <g className="fill-sand-200 stroke-neutral-400" strokeWidth="1">
        <circle cx="60" cy="23" r="11" />
        <path d="M55 33h10v6H55z" />
        <path d="M52 38Q46 44 38 47L34 90Q30 160 24 228H96Q90 160 86 90L82 47Q74 44 68 38Z" />
        <path d="M38 47L28 58L18 126L26 128L36 72Z" />
        <path d="M82 47L92 58L102 126L94 128L84 72Z" />
      </g>
      <line x1="8" y1="229" x2="112" y2="229" className="stroke-neutral-300" strokeWidth="1" />
      <g className="text-accent-600">
        <Highlight field={field} />
      </g>
    </svg>
  );
}
