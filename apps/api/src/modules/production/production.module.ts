import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityModule } from '../identity/identity.module';
import { MediaModule } from '../media/media.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminOrdersService } from './application/admin-orders.service';
import { MakersService } from './application/makers.service';
import { PRODUCTION_REPOSITORY } from './application/ports/production.ports';
import { ProductionService } from './application/production.service';
import { CuttingService } from './application/cutting.service';
import { PatternService } from './application/pattern.service';
import { StitchingService } from './application/stitching.service';
import { TeamService } from './application/team.service';
import { WorkshopOverviewService } from './application/workshop-overview.service';
import { WorkshopService } from './application/workshop.service';
import { PrismaProductionRepository } from './infrastructure/prisma-production.repository';
import {
  AdminDashboardController,
  AdminMakersController,
  AdminOrderItemsController,
  AdminCustomersController,
  AdminOrdersController,
  AdminTeamController,
} from './interface/production.controllers';
import { ProductionListeners } from './interface/production.listeners';
import { WorkshopController } from './interface/workshop.controller';

/**
 * Owns Maker (tailors, created from Staff & roles), TechPack, QcCheck, MakerPayout. Also hosts the admin order views,
 * which combine orders, payments and identity without those modules depending on it.
 */
@Module({
  imports: [OrdersModule, PaymentsModule, IdentityModule, CatalogModule, MediaModule],
  controllers: [AdminDashboardController, AdminCustomersController, AdminOrdersController, AdminOrderItemsController, AdminMakersController, AdminTeamController, WorkshopController],
  providers: [
    ProductionService,
    MakersService,
    ProductionListeners,
    AdminOrdersService,
    WorkshopService,
    PatternService,
    CuttingService,
    StitchingService,
    TeamService,
    WorkshopOverviewService,
    { provide: PRODUCTION_REPOSITORY, useClass: PrismaProductionRepository },
  ],
  exports: [MakersService],
})
export class ProductionModule {}
