import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { AppConfig } from './common/config/config.module';

/** HTTP setup shared by main.ts and the e2e tests. */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.setGlobalPrefix('v1');
  app.set('trust proxy', 1); // real client IP behind the host's load balancer (rate limits, audit)
  app.use(helmet());
  app.enableCors({
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  app.useBodyParser('json', { limit: '1mb' });
  app.enableShutdownHooks();
}
