/**
 * Purpose: Repository for Job model operations
 * Inputs: Job queries and mutations
 * Outputs: Job documents
 * Core Flow: Extends BaseRepository with job-specific queries
 */

import { Collection } from 'mongodb';
import { Job } from '../models/job.model';
import { COLLECTIONS, getSchema } from '../infra/db';
import { BaseRepository } from './base.repository';

/**
 * Repository for Job operations
 * Provides CRUD operations and job-specific queries
 */
export class JobRepository extends BaseRepository<Job> {
  private collectionName: COLLECTIONS;

  constructor(collectionName: COLLECTIONS) {
    super();
    this.collectionName = collectionName;
  }

  protected get collection(): Collection<Job> {
    return getSchema<Job>(this.collectionName);
  }

  /**
   * Find all active jobs
   * @returns Array of active job documents
   */
  async findAllActive(): Promise<Job[]> {
    return this.findAll({ isActive: true });
  }

  /**
   * Find all jobs by jobId (can return multiple instances)
   * @param jobId - Job class identifier
   * @returns Array of job documents with matching jobId
   */
  async findByJobId(jobId: string): Promise<Job[]> {
    return this.findAll({ jobId });
  }

  /**
   * Find a job by its unique name
   * @param name - Unique job instance name
   * @returns Job document or null
   */
  async findByName(name: string): Promise<Job | null> {
    return this.findOne({ name });
  }

  /**
   * Set active status for a job
   * @param name - Job instance name
   * @param isActive - New active status
   * @returns True if updated successfully
   */
  async setActiveStatus(name: string, isActive: boolean): Promise<boolean> {
    const result = await this.collection.updateOne(
      { name },
      { $set: { isActive } }
    );
    return result.modifiedCount > 0;
  }
}

// Service-specific job repository instances
export const tradeManagerJobRepository = new JobRepository(
  COLLECTIONS.JOBS_TRADE_MANAGER
);
export const executorServiceJobRepository = new JobRepository(
  COLLECTIONS.JOBS_EXECUTOR_SERVICE
);
