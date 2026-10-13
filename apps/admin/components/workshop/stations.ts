import type { WorkshopStation } from '@abaya/contracts';
import { ClipboardCheck, PackageCheck, PencilRuler, Scissors, Spool, Truck } from 'lucide-react';

/** One icon per station, used in the switcher, tab bar and cards. */
export const STATION_ICONS: Record<WorkshopStation, React.ComponentType<{ className?: string }>> = {
  pattern: PencilRuler,
  cutting: Scissors,
  stitching: Spool,
  qc: ClipboardCheck,
  finishing: PackageCheck,
  logistics: Truck,
};
