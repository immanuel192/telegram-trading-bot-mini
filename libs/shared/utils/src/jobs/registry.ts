import { BaseJob } from './base';
import { Job } from './interfaces';
import { LoggerInstance } from '../interfaces';

/**
 * Type definition for Job Class constructor
 * @template TContainer - Type of the dependency injection container
 */
export type JobConstructor<TContainer = any> = new (
  jobConfig: Job,
  logger: LoggerInstance,
  container: TContainer
) => BaseJob<TContainer, any>;

/**
 * Job Registry
 * Maps jobId strings to Job Class constructors
 */
export const JobRegistry = new Map<string, JobConstructor<any>>();

/**
 * Decorator to register a job class
 * @param jobId - The unique identifier for the job type
 */
export function RegisterJob(jobId: string) {
  return function <TContainer = any>(constructor: JobConstructor<TContainer>) {
    JobRegistry.set(jobId, constructor);
  };
}
