import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { type FashnUsageJobsDto, fashnUsageQuery, type FashnUsageReportDto, type FashnUsageSummaryDto } from '@abaya/contracts';
import type { z } from 'zod';
import { Roles } from '../../../common/auth/decorators';
import { ZodQuery } from '../../../common/zod/zod-validation.pipe';
import { FashnUsageService } from '../application/fashn-usage.service';

/** FASHN credits per person: catalog managers and super admins only (SUPER_ADMIN passes every role check). */
@Controller('admin/fashn-usage')
@Roles('CATALOG_MANAGER')
export class FashnUsageController {
  constructor(private readonly usage: FashnUsageService) {}

  @Get()
  report(@ZodQuery(fashnUsageQuery) query: z.infer<typeof fashnUsageQuery>): Promise<FashnUsageReportDto> {
    return this.usage.report(query);
  }

  @Get('summary')
  summary(): Promise<FashnUsageSummaryDto> {
    return this.usage.summary();
  }

  @Get('users/:userId/jobs')
  jobs(
    @Param('userId', ParseUUIDPipe) userId: string,
    @ZodQuery(fashnUsageQuery) query: z.infer<typeof fashnUsageQuery>,
  ): Promise<FashnUsageJobsDto> {
    return this.usage.userJobs(userId, query);
  }
}
