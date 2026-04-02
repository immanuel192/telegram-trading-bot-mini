/**
 * Purpose: Re-export Job entity from shared-utils for backward compatibility
 * Exports: Job interface, JobSchedulerConfig interface
 * Core Flow: DAL imports these from shared-utils to avoid circular dependency
 *
 * Note: We use type-only re-export to avoid runtime circular dependency
 */

export type {
  Job,
  JobSchedulerConfig,
} from '@telegram-trading-bot-mini/shared/utils/jobs/job.model';
