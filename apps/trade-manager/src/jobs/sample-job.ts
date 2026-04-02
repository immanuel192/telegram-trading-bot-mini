import { BaseJob, RegisterJob } from '@telegram-trading-bot-mini/shared/utils';
import { Container } from '../interfaces';

/**
 * Sample Job
 * Demonstrates how to implement a job using the BaseJob class
 */
@RegisterJob('sample-job')
export class SampleJob extends BaseJob<Container> {
  protected async onTick(params?: any, traceToken?: string): Promise<void> {
    this.logger.info(
      {
        jobId: this.jobConfig.jobId,
        name: this.jobConfig.name,
        meta: this.jobConfig.meta,
        params,
        traceToken,
      },
      'Sample job ticking...',
    );

    // Simulate some work
    // await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
