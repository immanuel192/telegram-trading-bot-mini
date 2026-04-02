import { ValidateEntryPriceStep } from '../../../../../src/services/command-processing/steps/validate-entry.step';
import {
  fakeLogger,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';

describe(suiteName(__filename), () => {
  let step: ValidateEntryPriceStep;
  let mockPriceCacheService: any;
  let mockNext: jest.Mock;
  let mockContext: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPriceCacheService = {
      getPriceFromAnyExchange: jest.fn(),
    };
    mockNext = jest.fn();

    step = new ValidateEntryPriceStep(mockPriceCacheService, fakeLogger);

    mockContext = {
      state: {
        orderCreationPayload: {
          symbol: 'BTCUSDT',
          entry: 50000,
          isImmediate: true,
          command: CommandEnum.LONG,
        },
        account: {
          configs: { entryPriceValidationThreshold: 0.01 },
        },
      },
      messageContext: {
        traceToken: 'trace-123',
      },
    };
  });

  it('should skip validation if no payload', async () => {
    mockContext.state.orderCreationPayload = undefined;
    await step.execute(mockContext, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(
      mockPriceCacheService.getPriceFromAnyExchange,
    ).not.toHaveBeenCalled();
  });

  it('should skip validation if not immediate', async () => {
    mockContext.state.orderCreationPayload.isImmediate = false;
    await step.execute(mockContext, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should pass validation if price is within threshold', async () => {
    mockPriceCacheService.getPriceFromAnyExchange.mockResolvedValue({
      bid: 49900,
      ask: 50100,
    });

    await step.execute(mockContext, mockNext);

    expect(mockContext.state.orderCreationPayload.entry).toBe(50000); // Unchanged
    expect(fakeLogger.debug).toHaveBeenCalledWith(
      expect.anything(),
      'Entry price validation passed',
    );
    expect(mockNext).toHaveBeenCalled();
  });

  it('should fail validation and update price if diff exceeds threshold', async () => {
    mockPriceCacheService.getPriceFromAnyExchange.mockResolvedValue({
      bid: 40000,
      ask: 40000,
    });

    await step.execute(mockContext, mockNext);

    expect(mockContext.state.orderCreationPayload.entry).toBe(40000); // Updated to mid price
    expect(fakeLogger.warn).toHaveBeenCalledWith(
      expect.anything(),
      'Entry price validation failed - using cached price instead of AI price',
    );
    expect(mockNext).toHaveBeenCalled();
  });

  it('should handle missing cached price gracefully', async () => {
    mockPriceCacheService.getPriceFromAnyExchange.mockResolvedValue(null);

    await step.execute(mockContext, mockNext);

    expect(mockContext.state.orderCreationPayload.entry).toBe(50000); // Unchanged
    expect(fakeLogger.warn).toHaveBeenCalledWith(
      expect.anything(),
      'No cached price available for entry price validation - using AI price',
    );
    expect(mockNext).toHaveBeenCalled();
  });

  it('should catch and log errors gracefully', async () => {
    mockPriceCacheService.getPriceFromAnyExchange.mockRejectedValue(
      new Error('Redis down'),
    );

    await step.execute(mockContext, mockNext);

    expect(mockContext.state.orderCreationPayload.entry).toBe(50000); // Unchanged
    expect(fakeLogger.warn).toHaveBeenCalledWith(
      expect.anything(),
      'Entry price validation failed gracefully - using AI price',
    );
    expect(mockNext).toHaveBeenCalled();
  });
});
