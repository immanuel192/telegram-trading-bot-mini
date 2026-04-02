import { CommandTransformationStep } from '../../../../../src/services/command-processing/steps/transform-command.step';
import { suiteName } from '@telegram-trading-bot-mini/shared/test-utils';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';

describe(suiteName(__filename), () => {
  let step: CommandTransformationStep;
  let mockCommandTransformerService: any;
  let mockNext: jest.Mock;
  let mockContext: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommandTransformerService = {
      transform: jest.fn(),
    };
    mockNext = jest.fn();

    step = new CommandTransformationStep(mockCommandTransformerService);

    mockContext = {
      state: {
        command: {
          extraction: { symbol: 'XAUUSD' },
          command: CommandEnum.LONG,
        },
        account: {
          accountId: 'acc-1',
          configs: { some: 'config' },
          symbols: { XAUUSD: { lot: 0.1 } },
          brokerConfig: { exchangeCode: 'oanda' },
        },
        executePayloads: [],
        skipNormalFlow: false,
      },
      messageContext: {
        messageId: 100,
        channelId: 'chan-1',
        traceToken: 'trace-123',
      },
    };
  });

  it('should call transformer and update state with payloads', async () => {
    const mockPayloads = [{ orderId: 'p-1', command: CommandEnum.LONG }];
    mockCommandTransformerService.transform.mockResolvedValue(mockPayloads);

    await step.execute(mockContext, mockNext);

    expect(mockCommandTransformerService.transform).toHaveBeenCalledWith(
      mockContext.state.command,
      100,
      'chan-1',
      'acc-1',
      'trace-123',
      { some: 'config' },
      { lot: 0.1 },
      'oanda',
    );

    expect(mockContext.state.executePayloads).toContainEqual(mockPayloads[0]);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should skip transformation if skipNormalFlow is true', async () => {
    mockContext.state.skipNormalFlow = true;

    await step.execute(mockContext, mockNext);

    expect(mockCommandTransformerService.transform).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });

  it('should handle undefined symbol in extraction', async () => {
    mockContext.state.command.extraction.symbol = undefined;
    mockCommandTransformerService.transform.mockResolvedValue([]);

    await step.execute(mockContext, mockNext);

    expect(mockCommandTransformerService.transform).toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });
});
