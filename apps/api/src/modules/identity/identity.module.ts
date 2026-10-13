import { Module } from '@nestjs/common';
import { AUTH_USER_RESOLVER } from '../../common/auth/auth.types';
import { AddressesService } from './application/addresses.service';
import { IdentityService } from './application/identity.service';
import {
  ADDRESS_REPOSITORY,
  CONSENT_REPOSITORY,
  STAFF_INVITE_REPOSITORY,
  USER_REPOSITORY,
} from './application/ports/identity.repositories';
import { StaffService } from './application/staff.service';
import {
  PrismaAddressRepository,
  PrismaConsentRepository,
  PrismaStaffInviteRepository,
  PrismaUserRepository,
} from './infrastructure/prisma-identity.repositories';
import {
  AdminStaffDirectoryController,
  AdminStaffInvitesController,
  AdminUsersController,
} from './interface/admin-users.controller';
import { MeController } from './interface/me.controller';

@Module({
  controllers: [MeController, AdminUsersController, AdminStaffDirectoryController, AdminStaffInvitesController],
  providers: [
    IdentityService,
    AddressesService,
    StaffService,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: STAFF_INVITE_REPOSITORY, useClass: PrismaStaffInviteRepository },
    { provide: ADDRESS_REPOSITORY, useClass: PrismaAddressRepository },
    { provide: CONSENT_REPOSITORY, useClass: PrismaConsentRepository },
    { provide: AUTH_USER_RESOLVER, useExisting: IdentityService },
  ],
  exports: [IdentityService, AUTH_USER_RESOLVER],
})
export class IdentityModule {}
