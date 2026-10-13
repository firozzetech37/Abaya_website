import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: PrismaService) {}

  /** Liveness + database check, used by the host's health probe. */
  @Public()
  @Get()
  async health(): Promise<{ status: 'ok'; db: 'ok' | 'down'; time: string }> {
    let db: 'ok' | 'down' = 'ok';
    try {
      await this.db.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return { status: 'ok', db, time: new Date().toISOString() };
  }
}
