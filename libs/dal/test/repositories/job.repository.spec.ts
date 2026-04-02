/**
 * Purpose: Integration tests for tradeManagerJobRepository operations.
 * Prerequisites: MongoDB running (via 'npm run stack:up').
 * Core Flow: Test job CRUD operations → Test active job filtering → Test job status updates → Cleanup.
 */

import { tradeManagerJobRepository } from '../../src/repositories/job.repository';
import { Job } from '../../src/models/job.model';
import {
  suiteName,
  setupDb,
  teardownDb,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';

describe(suiteName(__filename), () => {
  beforeAll(async () => {
    await setupDb();
  });

  afterAll(async () => {
    await teardownDb();
  });

  afterEach(async () => {
    await cleanupDb(null, [COLLECTIONS.JOBS_TRADE_MANAGER]);
  });

  describe('findByJobId', () => {
    it('should return jobs that match given jobId', async () => {
      const job1: Job = {
        jobId: 'job-type-1',
        name: 'job-instance-1',
        isActive: true,
        config: { cronExpression: '* * * * *' },
      } as Job;

      const job2: Job = {
        jobId: 'job-type-1',
        name: 'job-instance-2',
        isActive: true,
        config: { cronExpression: '* * * * *' },
      } as Job;

      const job3: Job = {
        jobId: 'job-type-2',
        name: 'job-instance-3',
        isActive: true,
        config: { cronExpression: '* * * * *' },
      } as Job;

      await Promise.all([
        tradeManagerJobRepository.create(job1),
        tradeManagerJobRepository.create(job2),
        tradeManagerJobRepository.create(job3),
      ]);

      const jobs = await tradeManagerJobRepository.findByJobId('job-type-1');

      expect(jobs).toHaveLength(2);
      expect(jobs.map((j) => j.name)).toContain('job-instance-1');
      expect(jobs.map((j) => j.name)).toContain('job-instance-2');
    });

    it('should return empty array when no matching jobId', async () => {
      const job: Job = {
        jobId: 'job-type-1',
        name: 'job-instance-1',
        isActive: true,
        config: { cronExpression: '* * * * *' },
      } as Job;

      await tradeManagerJobRepository.create(job);

      const jobs = await tradeManagerJobRepository.findByJobId(
        'non-existent-job-id',
      );

      expect(jobs).toHaveLength(0);
    });
  });

  describe('findByName', () => {
    it('should find a job by name', async () => {
      const job: Job = {
        jobId: 'job-type-1',
        name: 'unique-job-name',
        isActive: true,
        config: { cronExpression: '* * * * *' },
      } as Job;

      await tradeManagerJobRepository.create(job);
      const found =
        await tradeManagerJobRepository.findByName('unique-job-name');

      expect(found).toBeDefined();
      expect(found?.name).toBe('unique-job-name');
      expect(found?.jobId).toBe('job-type-1');
    });

    it('should return null if name not found', async () => {
      const found =
        await tradeManagerJobRepository.findByName('non-existent-name');
      expect(found).toBeNull();
    });
  });

  describe('findAllActive', () => {
    it('should return only active jobs', async () => {
      const activeJob1: Job = {
        jobId: 'job-type-1',
        name: 'active-job-1',
        isActive: true,
        config: { cronExpression: '* * * * *' },
      } as Job;

      const activeJob2: Job = {
        jobId: 'job-type-2',
        name: 'active-job-2',
        isActive: true,
        config: { cronExpression: '* * * * *' },
      } as Job;

      const inactiveJob: Job = {
        jobId: 'job-type-1',
        name: 'inactive-job',
        isActive: false,
        config: { cronExpression: '* * * * *' },
      } as Job;

      await Promise.all([
        tradeManagerJobRepository.create(activeJob1),
        tradeManagerJobRepository.create(activeJob2),
        tradeManagerJobRepository.create(inactiveJob),
      ]);

      const activeJobs = await tradeManagerJobRepository.findAllActive();

      expect(activeJobs).toHaveLength(2);
      expect(activeJobs.every((j) => j.isActive)).toBe(true);
      expect(activeJobs.map((j) => j.name)).toContain('active-job-1');
      expect(activeJobs.map((j) => j.name)).toContain('active-job-2');
      expect(activeJobs.map((j) => j.name)).not.toContain('inactive-job');
    });
  });

  describe('setActiveStatus', () => {
    it('should toggle job active status', async () => {
      const job: Job = {
        jobId: 'job-type-1',
        name: 'toggle-job',
        isActive: true,
        config: { cronExpression: '* * * * *' },
      } as Job;

      await tradeManagerJobRepository.create(job);

      // Toggle to false
      let updated = await tradeManagerJobRepository.setActiveStatus(
        'toggle-job',
        false,
      );
      expect(updated).toBe(true);
      let found = await tradeManagerJobRepository.findByName('toggle-job');
      expect(found?.isActive).toBe(false);

      // Toggle to true
      updated = await tradeManagerJobRepository.setActiveStatus(
        'toggle-job',
        true,
      );
      expect(updated).toBe(true);
      found = await tradeManagerJobRepository.findByName('toggle-job');
      expect(found?.isActive).toBe(true);
    });

    it('should return false if name not found', async () => {
      const updated = await tradeManagerJobRepository.setActiveStatus(
        'non-existent',
        true,
      );
      expect(updated).toBe(false);
    });
  });

  describe('BaseRepository methods', () => {
    it('should support create and findById', async () => {
      const job: Job = {
        jobId: 'job-type-1',
        name: 'base-test-job',
        isActive: true,
        config: { cronExpression: '* * * * *' },
      } as Job;

      const created = await tradeManagerJobRepository.create(job);
      expect(created._id).toBeDefined();

      const found = await tradeManagerJobRepository.findById(
        created._id!.toString(),
      );
      expect(found).toBeDefined();
      expect(found?.name).toBe('base-test-job');
    });
  });
});
