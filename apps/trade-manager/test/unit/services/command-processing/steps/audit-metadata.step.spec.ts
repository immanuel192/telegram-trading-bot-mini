import { CaptureAuditMetadataStep } from '../../../../../src/services/command-processing/steps/audit-metadata.step';
import {
  fakeLogger,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';

describe(suiteName(__filename), () => {
  let step: CaptureAuditMetadataStep;
  let mockPriceCacheService: any;
  let mockTelegramMessageRepository: any;
  let mockNext: jest.Mock;
  let mockContext: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPriceCacheService = {
      getPriceFromAnyExchange: jest.fn(),
    };
    mockTelegramMessageRepository = {
      updateAuditMetadata: jest.fn(),
    };
    mockNext = jest.fn();

    step = new CaptureAuditMetadataStep(
      mockPriceCacheService,
      mockTelegramMessageRepository,
      fakeLogger,
    );

    mockContext = {
      state: {
        command: { command: CommandEnum.LONG },
        executePayloads: [{ symbol: 'BTCUSDT' }],
      },
      messageContext: {
        messageId: 100,
        channelId: 'chan-1',
      },
    };
  });

  it('should update audit metadata if price is cached', async () => {
    mockPriceCacheService.getPriceFromAnyExchange.mockResolvedValue({
      bid: 50000,
      ask: 50010,
    });

    await step.execute(mockContext, mockNext);

    expect(mockPriceCacheService.getPriceFromAnyExchange).toHaveBeenCalledWith(
      'BTCUSDT',
      30000,
    );
    expect(
      mockTelegramMessageRepository.updateAuditMetadata,
    ).toHaveBeenCalledWith(
      'chan-1',
      100,
      { bid: 50000, ask: 50010 },
      CommandEnum.LONG,
      undefined,
    );
    expect(mockNext).toHaveBeenCalled();
  });

  it('should not update if price is not cached', async () => {
    mockPriceCacheService.getPriceFromAnyExchange.mockResolvedValue(null);

    await step.execute(mockContext, mockNext);

    expect(
      mockTelegramMessageRepository.updateAuditMetadata,
    ).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });

  it('should handle errors gracefully (non-blocking)', async () => {
    mockPriceCacheService.getPriceFromAnyExchange.mockRejectedValue(
      new Error('Redis error'),
    );

    await step.execute(mockContext, mockNext);

    expect(fakeLogger.warn).toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });

  it('should skip if no payloads exist', async () => {
    mockContext.state.executePayloads = [];

    await step.execute(mockContext, mockNext);

    expect(
      mockPriceCacheService.getPriceFromAnyExchange,
    ).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });
});
