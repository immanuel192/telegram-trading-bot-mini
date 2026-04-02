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
    expect(container.promptRuleRepository).toBeDefined();
    expect(container.promptCacheService).toBeDefined();
    expect(container.aiService).toBeDefined();
  });

  it('should log push notification service initialization', () => {
    createContainer(mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith(
      'PushNotificationService initialized',
    );
  });

  it('should initialize streamPublisher with correct configuration', () => {
    const container = createContainer(mockLogger);

    expect(container.streamPublisher).toBeDefined();
    expect(container.streamPublisher.constructor.name).toContain(
      'RedisStreamPublisher',
    );
  });

  it('should initialize AI services correctly', () => {
    const container = createContainer(mockLogger);

    expect(container.promptCacheService).toBeDefined();
    expect(container.promptCacheService.constructor.name).toContain(
      'PromptCacheService',
    );

    expect(container.aiService).toBeDefined();
    expect(container.aiService.constructor.name).toContain('GeminiAIService');
  });

  it('should initialize repositories correctly', () => {
    const container = createContainer(mockLogger);

    expect(container.accountRepository).toBeDefined();
    expect(container.promptRuleRepository).toBeDefined();
  });
});
