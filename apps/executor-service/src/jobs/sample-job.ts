import { BaseJob, RegisterJob } from '@telegram-trading-bot-mini/shared/utils';
import { Container } from '../interfaces';

/**
 * Sample Job for Executor Service
 * Demonstrates how to implement a job using the BaseJob class
 * and access container services
 */
@RegisterJob('executor-sample-job')
export class ExecutorSampleJob extends BaseJob<Container> {
  protected async onTick(params?: any, traceToken?: string): Promise<void> {
    this.logger.info(
      {
        jobId: this.jobConfig.jobId,
        name: this.jobConfig.name,
        meta: this.jobConfig.meta,
        params,
        traceToken,
      },
      'Executor sample job executing...',
    );

    // Example: Access container services
    const accounts = await this.container.accountRepository.findAll();
    this.logger.info(
      { accountCount: accounts.length },
      'Loaded accounts from repository',
    );

    // Example: You can access other services from the container
    // const adapter = this.container.brokerFactory.getAdapter(accountId);
  }
}
