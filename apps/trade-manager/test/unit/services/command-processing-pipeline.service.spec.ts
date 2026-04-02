import {
  suiteName,
  fakeLogger,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  CommandEnum,
  ActionPipeline,
} from '@telegram-trading-bot-mini/shared/utils';
import { CommandProcessingPipelineService } from '../../../src/services/command-processing-pipeline.service';

describe(suiteName(__filename), () => {
  let service: CommandProcessingPipelineService;
  let useSpy: jest.SpyInstance;
  let runSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on prototype methods
    useSpy = jest.spyOn(ActionPipeline.prototype, 'use').mockReturnThis();
    jest.spyOn(ActionPipeline.prototype, 'useDeferred').mockReturnThis();
    runSpy = jest
      .spyOn(ActionPipeline.prototype, 'run')
      .mockResolvedValue(undefined as any);

    service = new CommandProcessingPipelineService(
      fakeLogger,
      {} as any, // errorCapture
      {} as any, // orderService
      {} as any, // pushNotificationService
      {} as any, // commandTransformerService
      {} as any, // priceCacheService
      {} as any, // streamPublisher
      {} as any, // telegramMessageRepository
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should initialize pipeline with all steps', () => {
    expect(useSpy).toHaveBeenCalled();
  });

  it('should create context correctly', () => {
    const params = {
      account: { accountId: 'acc-1' } as any,
      command: { command: CommandEnum.LONG } as any,
      messageId: 100,
      channelId: 'chan-1',
      traceToken: 'trace-123',
      sentryTrace: 'st-1',
      sentryBaggage: 'sb-1',
    };

    const ctx = service.createContext(params);

    expect(ctx.messageContext).toEqual({
      messageId: 100,
      channelId: 'chan-1',
      traceToken: 'trace-123',
      sentryTrace: 'st-1',
      sentryBaggage: 'sb-1',
    });
    expect(ctx.state.account.accountId).toBe('acc-1');
  });

  it('should call pipeline.run when processing', async () => {
    const ctx = { state: {}, messageContext: {} } as any;
    await service.process(ctx);
    expect(runSpy).toHaveBeenCalledWith(ctx);
  });
});
