import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  FASHN_USAGE_JOBS_LIMIT,
  type FashnUsageJobsDto,
  type FashnUsageQuery,
  type FashnUsageReportDto,
  type FashnUsageSummaryDto,
  indiaDayRange,
} from '@abaya/contracts';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { CatalogService } from '../../ai-catalog/application/catalog.service';
import { FASHN_CLIENT, type FashnClient } from '../../ai-catalog/application/ports/catalog.ports';
import { DesignsAdminService } from '../../catalog/application/designs-admin.service';
import { IdentityService } from '../../identity/application/identity.service';
import { TryOnService } from '../../try-on/application/try-on.service';
import { mergeJobs, mergeUsage, summaryRanges, totalsOf, type UsagePerson } from '../domain/fashn-usage.rules';

type Limits = Pick<AppConfig, 'CUSTOMER_AI_DAILY_CREDIT_LIMIT' | 'FASHN_DAILY_CREDIT_LIMIT'>;

/**
 * Admin "FASHN usage": credits per person. Reads nothing itself: the try-on module reports the
 * website previews and try-ons, the AI catalog module the Studio jobs, identity the names.
 */
@Injectable()
export class FashnUsageService {
  private readonly logger = new Logger(FashnUsageService.name);

  constructor(
    private readonly tryOn: TryOnService,
    private readonly catalog: CatalogService,
    private readonly identity: IdentityService,
    private readonly designs: DesignsAdminService,
    @Inject(FASHN_CLIENT) private readonly fashn: FashnClient,
    @Inject(APP_CONFIG) private readonly config: Limits,
  ) {}

  async report(query: FashnUsageQuery): Promise<FashnUsageReportDto> {
    const { since, until } = indiaDayRange(query.from, query.to);
    const [website, studio] = await Promise.all([this.tryOn.usageByUser(since, until), this.catalog.usageByCreator(since, until)]);
    const contacts = await this.identity.getContacts([...website.map((w) => w.userId), ...studio.map((s) => s.userId)]);
    const people = new Map<string, UsagePerson>([...contacts].map(([id, c]) => [id, { name: c.name, email: c.email, roles: c.roles }]));
    return {
      from: query.from,
      to: query.to,
      totals: totalsOf(website, studio),
      users: mergeUsage(website, studio, people),
    };
  }

  async summary(now = new Date()): Promise<FashnUsageSummaryDto> {
    const ranges = summaryRanges(now);
    const totals = async (r: { from: string; to: string }) => {
      const { since, until } = indiaDayRange(r.from, r.to);
      const [website, studio] = await Promise.all([this.tryOn.usageByUser(since, until), this.catalog.usageByCreator(since, until)]);
      return totalsOf(website, studio);
    };
    const [today, last7Days, thisMonth, balance] = await Promise.all([
      totals(ranges.today),
      totals(ranges.last7Days),
      totals(ranges.thisMonth),
      this.balance(),
    ]);
    return {
      today,
      last7Days,
      thisMonth,
      websiteDailyLimit: this.config.CUSTOMER_AI_DAILY_CREDIT_LIMIT,
      staffDailyLimit: this.config.FASHN_DAILY_CREDIT_LIMIT,
      balance,
      live: this.fashn.live,
    };
  }

  /** One person's jobs in the range, newest first (try-ons without their picture). */
  async userJobs(userId: string, query: FashnUsageQuery): Promise<FashnUsageJobsDto> {
    const { since, until } = indiaDayRange(query.from, query.to);
    // One more than shown from each source tells whether there are more.
    const [website, studio] = await Promise.all([
      this.tryOn.usageJobs(userId, since, until, FASHN_USAGE_JOBS_LIMIT + 1),
      this.catalog.usageJobs(userId, since, until, FASHN_USAGE_JOBS_LIMIT + 1),
    ]);
    const names = await this.designs.designNames([
      ...website.map((j) => j.designId),
      ...studio.map((j) => j.designId).filter((id): id is string => Boolean(id)),
    ]);
    return { userId, ...mergeJobs(website, studio, names, FASHN_USAGE_JOBS_LIMIT) };
  }

  private async balance(): Promise<number | null> {
    if (!this.fashn.live) return null;
    try {
      return await this.fashn.credits();
    } catch (e) {
      this.logger.warn(`FASHN balance unavailable: ${(e as Error).message}`);
      return null;
    }
  }
}
