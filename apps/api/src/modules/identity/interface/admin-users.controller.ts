import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  type AdminUserDto,
  listUsersQuery,
  type Paginated,
  ROLES,
  staffInviteBody,
  type StaffInviteDto,
  type StaffInviteResult,
  updateRolesBody,
} from '@abaya/contracts';
import { z as zod } from 'zod';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor, Roles } from '../../../common/auth/decorators';
import { ZodBody, ZodQuery } from '../../../common/zod/zod-validation.pipe';
import { StaffService } from '../application/staff.service';

@Controller('admin/users')
@Roles('SUPER_ADMIN')
export class AdminUsersController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(
    @ZodQuery(listUsersQuery) query: z.infer<typeof listUsersQuery>,
  ): Promise<Paginated<AdminUserDto>> {
    return this.staff.list(query);
  }

  @Put(':id/roles')
  setRoles(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(updateRolesBody) body: z.infer<typeof updateRolesBody>,
  ): Promise<AdminUserDto> {
    return this.staff.setRoles(actor, id, body.roles);
  }
}

const staffDirectoryQuery = zod.object({ role: zod.enum(ROLES) });

/** Staff names for pickers (assign a reference to a designer). */
@Controller('admin/staff')
@Roles('CATALOG_MANAGER', 'PRODUCTION_MANAGER')
export class AdminStaffDirectoryController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(@ZodQuery(staffDirectoryQuery) query: z.infer<typeof staffDirectoryQuery>) {
    return this.staff.directory(query.role);
  }
}

/** Add staff by email; roles apply on their first sign-in (docs/apps/workshop.md, "Staff login"). */
@Controller('admin/staff-invites')
@Roles('SUPER_ADMIN')
export class AdminStaffInvitesController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(): Promise<StaffInviteDto[]> {
    return this.staff.listInvites();
  }

  @Post()
  invite(@CurrentActor() actor: Actor, @ZodBody(staffInviteBody) body: z.infer<typeof staffInviteBody>): Promise<StaffInviteResult> {
    return this.staff.invite(actor, body);
  }

  @Delete(':id')
  cancel(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<StaffInviteDto> {
    return this.staff.cancelInvite(actor, id);
  }
}
