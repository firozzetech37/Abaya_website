import type { WorkshopQueueItem } from '@abaya/contracts';
import { strings } from '@/content/strings';

const w = strings.workshop;

/** Who has this job, from the viewer's side: started, assigned, or free to take. */
export function jobOwner(
  item: Pick<WorkshopQueueItem, 'claimedBy' | 'assignedTo'>,
  meId: string,
): { text: string; mine: boolean } {
  if (item.claimedBy?.id === meId) return { text: w.takenByYou, mine: true };
  if (item.claimedBy) return { text: w.takenBy(item.claimedBy.name ?? '—'), mine: false };
  if (item.assignedTo?.id === meId) return { text: w.assignedToYou, mine: true };
  if (item.assignedTo) return { text: w.assignedTo(item.assignedTo.name ?? '—'), mine: false };
  return { text: w.free, mine: false };
}
