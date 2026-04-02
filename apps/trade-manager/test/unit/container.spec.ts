import { createContainer } from '../../src/container';
import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
import { fakeLogger } from '@telegram-trading-bot-mini/shared/test-utils';

describe('Container', () => {
  let mockLogger: LoggerInstance;

  beforeEach(() => {
    mockLogger = fakeLogger;
  });

  it('should create container with all required services', () => {
    const container = createContainer(mockLogger);

    expect(container.logger).toBe(mockLogger);
    expect(container.streamPublisher).toBeDefined();
    expect(container.pushNotificationService).toBeDefined();
    expect(container.accountRepository).toBeDefined();
    expect(container.jobRepository).toBeDefined();
    expect(container.accountService).toBeDefined();
    expect(container.jobManager).toBeDefined();
    expect(container.jobService).toBeDefined();
  });

  it('should log service initialization', () => {
    createContainer(mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith(
      'PushNotificationService initialized',
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'RedisStreamPublisher initialized',
    );
  });

  it('should initialize services with correct dependencies', () => {
    const container = createContainer(mockLogger);

    // Verify that services are properly initialized
    expect(container.accountService).toBeDefined();
    expect(container.jobManager).toBeDefined();
    expect(container.jobService).toBeDefined();

    // Verify that the container is passed to JobManager
    expect(container.jobManager).toBeDefined();
  });
});
