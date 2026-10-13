import { cn } from '@/lib/utils';

/**
 * A small piece of craft motion for each atelier step, drawn as gold hairlines and animated
 * (globals.css ".journey-art") while that step is the active one: a pencil drawing the
 * silhouette, fabric rippling, pattern lines appearing, scissors closing, a running stitch,
 * a tick drawing itself, a box lid lifting.
 */
export function JourneyArt({ step, active, className }: { step: number; active: boolean; className?: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 120 120" aria-hidden data-active={active} data-step={step} className={cn('journey-art', className)} {...common}>
      {step === 0 && (
        <g>
          <path className="draw" pathLength={1} d="M60 18c-5 0-8 4-8 8s3 8 8 8 8-4 8-8-3-8-8-8ZM50 40c-8 3-13 8-15 16L28 104h64L85 56c-2-8-7-13-15-16M50 40c3 5 6 7 10 7s7-2 10-7" />
          <path className="pencil" d="M96 14l10 10-6 6-10-10ZM90 24l-24 24-4 10 10-4 24-24" />
        </g>
      )}
      {step === 1 && (
        <g>
          <path className="ripple" d="M14 40c12-8 24-8 36 0s24 8 36 0 16-6 22 0" />
          <path className="ripple r2" d="M14 60c12-8 24-8 36 0s24 8 36 0 16-6 22 0" />
          <path className="ripple r3" d="M14 80c12-8 24-8 36 0s24 8 36 0 16-6 22 0" />
        </g>
      )}
      {step === 2 && (
        <g>
          <path className="draw" pathLength={1} d="M30 16h60v88H30Z" />
          <path className="draw d2" pathLength={1} strokeDasharray="3 4" d="M60 16v88M30 60h60M40 16l20 44-20 44M80 16 60 60l20 44" />
          <path className="draw d3" pathLength={1} d="M22 30h16M22 90h16M82 30h16M82 90h16" />
        </g>
      )}
      {step === 3 && (
        <g>
          <path className="blade a" d="M36 36 90 86M28 34a8 8 0 1 0 0 1Z" />
          <path className="blade b" d="M90 36 36 86M28 86a8 8 0 1 0 0 1Z" />
          <path strokeDasharray="2 5" d="M14 104h92" className="cutline" pathLength={1} />
        </g>
      )}
      {step === 4 && (
        <g>
          <path strokeDasharray="6 5" className="stitch" pathLength={1} d="M14 50c20-14 40-14 60 0s26 14 32 0" />
          <path strokeDasharray="6 5" className="stitch s2" pathLength={1} d="M14 76c20-14 40-14 60 0s26 14 32 0" />
          <path className="needle" d="M96 30 108 18M104 22l3-3" />
        </g>
      )}
      {step === 5 && (
        <g>
          <path className="draw" pathLength={1} d="M60 14a46 46 0 1 0 0 92 46 46 0 1 0 0-92Z" />
          <path className="draw d2" pathLength={1} strokeWidth={2.2} d="M38 62l14 14 30-32" />
        </g>
      )}
      {step === 6 && (
        <g>
          <path d="M24 54h72v48H24Z" />
          <path d="M60 54v48M24 54l12-16h48l12 16" className="lid" />
          <path className="ribbon" d="M60 38v-8M52 28c4-6 12-6 16 0-4 2-12 2-16 0Z" />
        </g>
      )}
    </svg>
  );
}
