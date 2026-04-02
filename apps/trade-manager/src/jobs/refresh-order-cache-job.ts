import { BaseJob, RegisterJob } from '@telegram-trading-bot-mini/shared/utils';
import { Container } from '../interfaces';

/**
 * Refresh Order Cache Job
 *
 * Purpose:
 * Periodically refreshes the in-memory order cache from the database to ensure
 * eventual consistency and recover from any missed reactive events.
 */
@RegisterJob('refresh-order-cache-job')
export class RefreshOrderCacheJob extends BaseJob<Container> {
  /**
   * Initialize job and dependencies.
   * Triggers an immediate cache refresh to ensure the cache is warm on startup.
   */
  override async init(): Promise<void> {
    await super.init();
    this.logger.info(
      { jobId: this.jobConfig.jobId, name: this.jobConfig.name },
      'RefreshOrderCacheJob initialized. Triggering immediate refresh...',
    );

    try {
      await this.container.orderCacheService.refreshCache();
    } catch (error) {
      this.logger.error(
        { jobId: this.jobConfig.jobId, error: (error as Error).message },
        'Initial cache refresh failed during job initialization',
      );
      // We don't throw here to allow the job instance to stay alive for retries via onTick
    }
  }

  /**
   * Execution logic for each tick
   */
  protected async onTick(params?: any, traceToken?: string): Promise<void> {
    // this.logger.info(
    //   { jobId: this.jobConfig.jobId, name: this.jobConfig.name },
    //   'Starting periodic order cache refresh'
    // );

    try {
      await this.container.orderCacheService.refreshCache();

      const stats = this.container.orderCacheService.getStats();
      // this.logger.info(
      //   {
      //     jobId: this.jobConfig.jobId,
      //     name: this.jobConfig.name,
      //     ...stats,
      //   },
      //   'Order cache refresh completed successfully'
      // );
    } catch (error) {
      this.logger.error(
        {
          jobId: this.jobConfig.jobId,
          name: this.jobConfig.name,
          error: (error as Error).message,
        },
        'Failed to refresh order cache in background job',
      );
      // We throw to allow JobManager to track failure if needed,
      // although BaseJob usually catches and logs it.
      throw error;
    }
  }
}
