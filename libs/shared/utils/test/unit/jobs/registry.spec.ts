/**
 * Unit tests for JobRegistry and RegisterJob decorator
 */

import {
  JobRegistry,
  RegisterJob,
  JobConstructor,
} from '../../../src/jobs/registry';
import { BaseJob } from '../../../src/jobs/base';
import { Job } from '../../../src/jobs';
import { fakeLogger } from '@telegram-trading-bot-mini/shared/test-utils';

// Test job classes
@RegisterJob('test-job-1')
class TestJob1 extends BaseJob<any, any> {
  protected async onTick(): Promise<void> {
    // Test implementation
  }
}

@RegisterJob('test-job-2')
class TestJob2 extends BaseJob<any, any> {
  protected async onTick(): Promise<void> {
    // Test implementation
  }
}

class UnregisteredJob extends BaseJob<any, any> {
  protected async onTick(): Promise<void> {
    // Test implementation
  }
}

describe('JobRegistry', () => {
  beforeEach(() => {
    // Clear registry before each test (except for the registered jobs above)
    // We'll test with the pre-registered jobs
  });

  describe('RegisterJob decorator', () => {
    it('should register job class with jobId', () => {
      const JobClass = JobRegistry.get('test-job-1');
      expect(JobClass).toBe(TestJob1);
    });

    it('should register multiple job classes', () => {
      const JobClass1 = JobRegistry.get('test-job-1');
      const JobClass2 = JobRegistry.get('test-job-2');

      expect(JobClass1).toBe(TestJob1);
      expect(JobClass2).toBe(TestJob2);
    });

    it('should return undefined for unregistered jobId', () => {
      const JobClass = JobRegistry.get('non-existent-job');
      expect(JobClass).toBeUndefined();
    });

    it('should allow registering job at runtime', () => {
      @RegisterJob('runtime-job')
      class RuntimeJob extends BaseJob<any, any> {
        protected async onTick(): Promise<void> {
          // Test implementation
        }
      }

      const JobClass = JobRegistry.get('runtime-job');
      expect(JobClass).toBe(RuntimeJob);
    });

    it('should overwrite existing registration with same jobId', () => {
      @RegisterJob('duplicate-job')
      class FirstJob extends BaseJob<any, any> {
        protected async onTick(): Promise<void> {
          // First implementation
        }
      }

      @RegisterJob('duplicate-job')
      class SecondJob extends BaseJob<any, any> {
        protected async onTick(): Promise<void> {
          // Second implementation
        }
      }

      const JobClass = JobRegistry.get('duplicate-job');
      expect(JobClass).toBe(SecondJob);
    });
  });

  describe('JobConstructor type', () => {
    it('should create job instance with correct signature', () => {
      const JobClass = JobRegistry.get('test-job-1') as JobConstructor;
      expect(JobClass).toBeDefined();

      const jobConfig: Job = {
        jobId: 'test-job-1',
        name: 'test-instance',
        isActive: true,
        config: {
          cronExpression: '* * * * *',
        },
      } as Job;

      const mockContainer = { logger: fakeLogger };
      const jobInstance = new JobClass(jobConfig, fakeLogger, mockContainer);

      expect(jobInstance).toBeInstanceOf(BaseJob);
      expect(jobInstance).toBeInstanceOf(TestJob1);
    });

    it('should support generic container types', () => {
      interface CustomContainer {
        logger: any;
        customService: { doSomething: () => void };
      }

      @RegisterJob('typed-container-job')
      class TypedContainerJob extends BaseJob<CustomContainer, any> {
        protected async onTick(): Promise<void> {
          this.container.customService.doSomething();
        }
      }

      const JobClass = JobRegistry.get(
        'typed-container-job',
      ) as JobConstructor<CustomContainer>;
      expect(JobClass).toBe(TypedContainerJob);
    });
  });

  describe('Registry operations', () => {
    it('should maintain separate entries for different jobIds', () => {
      const job1 = JobRegistry.get('test-job-1');
      const job2 = JobRegistry.get('test-job-2');

      expect(job1).not.toBe(job2);
      expect(job1).toBe(TestJob1);
      expect(job2).toBe(TestJob2);
    });

    it('should handle jobIds with special characters', () => {
      @RegisterJob('job-with-dashes')
      class DashedJob extends BaseJob<any, any> {
        protected async onTick(): Promise<void> {
          // Test
        }
      }

      @RegisterJob('job_with_underscores')
      class UnderscoredJob extends BaseJob<any, any> {
        protected async onTick(): Promise<void> {
          // Test
        }
      }

      expect(JobRegistry.get('job-with-dashes')).toBe(DashedJob);
      expect(JobRegistry.get('job_with_underscores')).toBe(UnderscoredJob);
    });

    it('should be case-sensitive for jobIds', () => {
      @RegisterJob('CaseSensitiveJob')
      class UpperCaseJob extends BaseJob<any, any> {
        protected async onTick(): Promise<void> {
          // Test
        }
      }

      expect(JobRegistry.get('CaseSensitiveJob')).toBe(UpperCaseJob);
      expect(JobRegistry.get('casesensitivejob')).toBeUndefined();
      expect(JobRegistry.get('CASESENSITIVEJOB')).toBeUndefined();
    });
  });

  describe('Decorator behavior', () => {
    it('should not affect class functionality', () => {
      const JobClass = JobRegistry.get('test-job-1') as JobConstructor;
      const jobConfig: Job = {
        jobId: 'test-job-1',
        name: 'test-instance',
        isActive: true,
        config: {
          cronExpression: '* * * * *',
        },
      } as Job;

      const mockContainer = { logger: fakeLogger };
      const instance = new JobClass(jobConfig, fakeLogger, mockContainer);

      // Should have all BaseJob methods
      expect(typeof instance.init).toBe('function');
      expect(typeof instance.start).toBe('function');
      expect(typeof instance.stop).toBe('function');
      expect(typeof instance.trigger).toBe('function');
      expect(typeof instance.getConfig).toBe('function');
    });

    it('should preserve class prototype chain', () => {
      const JobClass = JobRegistry.get('test-job-1') as JobConstructor;
      const jobConfig: Job = {
        jobId: 'test-job-1',
        name: 'test-instance',
        isActive: true,
        config: {
          cronExpression: '* * * * *',
        },
      } as Job;

      const mockContainer = { logger: fakeLogger };
      const instance = new JobClass(jobConfig, fakeLogger, mockContainer);

      expect(instance instanceof TestJob1).toBe(true);
      expect(instance instanceof BaseJob).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty jobId string', () => {
      @RegisterJob('')
      class EmptyIdJob extends BaseJob<any, any> {
        protected async onTick(): Promise<void> {
          // Test
        }
      }

      expect(JobRegistry.get('')).toBe(EmptyIdJob);
    });

    it('should handle very long jobId', () => {
      const longJobId = 'a'.repeat(1000);

      @RegisterJob(longJobId)
      class LongIdJob extends BaseJob<any, any> {
        protected async onTick(): Promise<void> {
          // Test
        }
      }

      expect(JobRegistry.get(longJobId)).toBe(LongIdJob);
    });

    it('should handle jobId with unicode characters', () => {
      @RegisterJob('job-🚀-emoji')
      class EmojiJob extends BaseJob<any, any> {
        protected async onTick(): Promise<void> {
          // Test
        }
      }

      expect(JobRegistry.get('job-🚀-emoji')).toBe(EmojiJob);
    });
  });
});
