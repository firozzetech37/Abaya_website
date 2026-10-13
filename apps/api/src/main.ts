import 'reflect-metadata';
import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { APP_CONFIG, type AppConfig } from './common/config/config.module';

async function bootstrap(): Promise<void> {
  // rawBody: the Razorpay webhook signature is computed over the exact bytes received.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(app.get(Logger));
  const config = app.get<AppConfig>(APP_CONFIG);
  configureApp(app, config);

  if (config.NODE_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Abaya API').setVersion('1').addBearerAuth().build(),
    );
    SwaggerModule.setup('v1/docs', app, doc);
  }

  await app.listen(config.API_PORT);
  app.get(Logger).log(`API listening on ${config.API_PUBLIC_URL}/v1`);

  // On SIGTERM/SIGINT the server stops listening and waits for open connections to end, but the
  // web app's keep-alive connections never do, so the process hung (and `nest start --watch` never
  // started the rebuilt one). Drop those connections so shutdown finishes within a moment.
  // A close step can also hang (Prisma's disconnect waiting on a stalled pooler connection): the
  // process then kept port 4000 while answering nothing, and outlived its watcher as an orphan.
  // So a stop signal always ends the process within SHUTDOWN_DEADLINE_MS.
  const server = app.getHttpServer() as Server;
  const stop = (signal: NodeJS.Signals): void => {
    server.closeIdleConnections();
    setTimeout(() => server.closeAllConnections(), 1_000).unref();
    setTimeout(() => {
      app.get(Logger).warn(`Shutdown after ${signal} did not finish in ${SHUTDOWN_DEADLINE_MS} ms; exiting.`);
      process.exit(0);
    }, SHUTDOWN_DEADLINE_MS).unref();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

/** The longest a stop signal may take before the process exits regardless. */
const SHUTDOWN_DEADLINE_MS = 5_000;

void bootstrap();
