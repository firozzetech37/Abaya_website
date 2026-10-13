import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { RolesGuard, SessionAuthGuard } from './common/auth/auth.guards';
import { AuthProviderModule } from './common/auth/clerk-admin';
import { TokenVerifier } from './common/auth/token-verifier';
import { ConfigModule } from './common/config/config.module';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { PrismaModule } from './common/prisma/prisma.service';
import { StorageModule } from './common/storage/object-storage';
import { EventsModule } from './common/events/events.module';
import { HealthController } from './modules/health/health.controller';
import { AiModule } from './modules/ai/ai.module';
import { AuditModule } from './modules/audit/audit.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CustomerModule } from './modules/customer/customer.module';
import { IdentityModule } from './modules/identity/identity.module';
import { MediaModule } from './modules/media/media.module';
import { NotifyModule } from './modules/notify/notify.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { ProductionModule } from './modules/production/production.module';
import { PricingOptionsModule } from './modules/pricing/pricing-options.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { StudioModule } from './modules/studio/studio.module';
import { DownloadsModule } from './modules/downloads/downloads.module';
import { AiCatalogModule } from './modules/ai-catalog/ai-catalog.module';
import { TryOnModule } from './modules/try-on/try-on.module';
import { FashnUsageModule } from './modules/fashn-usage/fashn-usage.module';
import { ImageCheckModule } from './modules/image-check/image-check.module';
import { WatermarkModule } from './modules/watermark/watermark.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'test' ? 'silent' : process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-razorpay-signature"]'],
        transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        autoLogging: { ignore: (req) => req.url === '/v1/health' },
      },
    }),
    // Default: 300 requests/minute per IP. Sensitive routes use @Throttle with tighter limits.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    EventEmitterModule.forRoot(),
    EventsModule,
    PrismaModule,
    AuthProviderModule,
    StorageModule,
    IdentityModule,
    MediaModule,
    PricingOptionsModule,
    AiModule,
    CatalogModule,
    PricingModule,
    CustomerModule,
    PaymentsModule,
    OrdersModule,
    NotifyModule,
    ProductionModule,
    PrivacyModule,
    StudioModule,
    DownloadsModule,
    AiCatalogModule,
    TryOnModule,
    FashnUsageModule,
    WatermarkModule,
    ImageCheckModule,
    AuditModule,
  ],
  controllers: [HealthController],
  providers: [
    TokenVerifier,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
