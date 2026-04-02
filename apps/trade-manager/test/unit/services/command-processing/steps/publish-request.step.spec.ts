import { PublishExecutionRequestStep } from '../../../../../src/services/command-processing/steps/publish-request.step';
import {
  fakeLogger,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  MessageType,
  StreamTopic,
} from '@telegram-trading-bot-mini/shared/utils';

describe(suiteName(__filename), () => {
  let step: PublishExecutionRequestStep;
  let mockStreamPublisher: any;
  let mockTelegramMessageRepository: any;
  let mockNext: jest.Mock;
  let mockContext: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStreamPublisher = {
      publish: jest.fn(),
    };
    mockTelegramMessageRepository = {
      addHistoryEntry: jest.fn(),
    };
    mockNext = jest.fn();

    step = new PublishExecutionRequestStep(
      mockStreamPublisher,
      mockTelegramMessageRepository,
      fakeLogger,
    );

    mockContext = {
      state: {
        command: { command: 'LONG' },
        account: { accountId: 'acc-1' },
        executePayloads: [{ orderId: 'order-1', symbol: 'BTCUSDT' }],
      },
      messageContext: {
        messageId: 100,
        channelId: 'chan-1',
        traceToken: 'trace-123',
        sentryTrace: 'st-1',
        sentryBaggage: 'sb-1',
      },
    };
  });

  it('should publish all payloads and add history entries', async () => {
    mockStreamPublisher.publish.mockResolvedValue('msg-id-1');

    await step.execute(mockContext, mockNext);

    expect(mockStreamPublisher.publish).toHaveBeenCalledWith(
      StreamTopic.ORDER_EXECUTION_REQUESTS,
      expect.objectContaining({
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: mockContext.state.executePayloads[0],
        _sentryTrace: 'st-1',
        _sentryBaggage: 'sb-1',
      }),
    );

    expect(mockTelegramMessageRepository.addHistoryEntry).toHaveBeenCalledWith(
      'chan-1',
      100,
      expect.objectContaining({
        streamEvent: {
          messageEventType: MessageType.EXECUTE_ORDER_REQUEST,
          messageId: 'msg-id-1',
        },
      }),
      undefined,
    );

    expect(mockNext).toHaveBeenCalled();
  });

  it('should add history entry even if publishing fails', async () => {
    mockStreamPublisher.publish.mockRejectedValue(new Error('Redis error'));

    await expect(step.execute(mockContext, mockNext)).rejects.toThrow(
      'Redis error',
    );

    expect(mockTelegramMessageRepository.addHistoryEntry).toHaveBeenCalledWith(
      'chan-1',
      100,
      expect.objectContaining({
        errorMessage: 'Redis error',
      }),
      undefined,
    );

    expect(mockNext).not.toHaveBeenCalled(); // Pipeline stopped by throw
  });
});
