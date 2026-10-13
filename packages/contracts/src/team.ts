/**
 * Workshop team per abaya (docs/apps/workshop.md "Team"): the production manager picks one
 * person for each station when approving the tech pack; each station's job then goes only
 * to that person. Logistics stays a shared dispatch queue.
 */
import { z } from 'zod';
import type { Role, WorkshopStation } from './enums';

/** Stations worked by one assigned staff member (the tailor is the order item's maker). */
export const TEAM_STATIONS = ['pattern', 'cutting', 'qc', 'finishing'] as const;
export type TeamStation = (typeof TEAM_STATIONS)[number];

/** Everyone on the team, in production order (stitching = the tailor). */
export const TEAM_SLOTS = ['pattern', 'cutting', 'stitching', 'qc', 'finishing'] as const satisfies readonly WorkshopStation[];
export type TeamSlot = (typeof TEAM_SLOTS)[number];

export const TEAM_STATION_ROLE: Record<TeamStation, Role> = {
  pattern: 'PATTERN_TECHNICIAN',
  cutting: 'CUTTER',
  qc: 'QC',
  finishing: 'FINISHER',
};

export const isTeamStation = (station: WorkshopStation | null): station is TeamStation =>
  station !== null && (TEAM_STATIONS as readonly string[]).includes(station);

const uuid = z.string().uuid();

/** PUT /v1/admin/order-items/:id/team — the whole team; null leaves a station unassigned. */
export const teamBody = z
  .object({
    pattern: uuid.nullable(),
    cutting: uuid.nullable(),
    qc: uuid.nullable(),
    finishing: uuid.nullable(),
    /** The tailor (a Maker). A tailor, once picked, can be changed but not removed. */
    makerId: uuid.nullable(),
    /** When the tailor must hand the piece to QC (required with a tailor). */
    dueDate: z.coerce.date().nullable(),
  })
  .refine((b) => b.makerId === null || b.dueDate !== null, { message: 'Pick a due date for the tailor', path: ['dueDate'] });
export type TeamBody = z.infer<typeof teamBody>;

/** Who is still missing (empty: the team is complete and the tech pack can be approved). */
export function missingTeam(team: Partial<Record<TeamStation, string | null>> & { makerId: string | null }): TeamSlot[] {
  return TEAM_SLOTS.filter((slot) => (slot === 'stitching' ? !team.makerId : !team[slot]));
}
