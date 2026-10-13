import { describe, expect, it } from 'vitest';
import { isTeamStation, missingTeam, teamBody } from './team';

const id = '0b8f6a3e-2c1d-4e5f-8a9b-0c1d2e3f4a5b';

describe('workshop team', () => {
  it('lists who is still missing, tailor included', () => {
    expect(missingTeam({ pattern: id, cutting: null, qc: id, finishing: undefined, makerId: null })).toEqual(['cutting', 'stitching', 'finishing']);
    expect(missingTeam({ pattern: id, cutting: id, qc: id, finishing: id, makerId: id })).toEqual([]);
  });

  it('needs a due date with a tailor', () => {
    const base = { pattern: null, cutting: null, qc: null, finishing: null };
    expect(teamBody.safeParse({ ...base, makerId: id, dueDate: null }).success).toBe(false);
    expect(teamBody.safeParse({ ...base, makerId: id, dueDate: '2099-01-01' }).success).toBe(true);
    expect(teamBody.safeParse({ ...base, makerId: null, dueDate: null }).success).toBe(true);
  });

  it('keeps logistics and stitching out of the staff-assigned stations', () => {
    expect(isTeamStation('cutting')).toBe(true);
    expect(isTeamStation('stitching')).toBe(false);
    expect(isTeamStation('logistics')).toBe(false);
    expect(isTeamStation(null)).toBe(false);
  });
});
