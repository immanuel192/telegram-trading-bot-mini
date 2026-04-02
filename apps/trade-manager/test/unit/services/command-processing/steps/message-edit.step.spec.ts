import { MessageEditCheckStep } from '../../../../../src/services/command-processing/steps/message-edit.step';
import { MessageEditHandlerService } from '../../../../../src/services/message-edit-handler.service';
import {
  fakeLogger,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';

jest.mock('../../../../../src/services/message-edit-handler.service');

describe(suiteName(__filename), () => {
  let step: MessageEditCheckStep;
  let mockOrderService: any;
  let mockPushNotificationService: any;
  let mockNext: jest.Mock;
  let mockContext: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderService = {};
    mockPushNotificationService = {};
    mockNext = jest.fn();

    step = new MessageEditCheckStep(
      mockOrderService,
      mockPushNotificationService,
      fakeLogger,
    );

    mockContext = {
      state: {
        command: {
          extraction: { symbol: 'XAUUSD' },
          command: CommandEnum.LONG,
        },
        account: { accountId: 'acc-1' },
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

  it('should call handleMessageEdit and update state with payloads', async () => {
    const mockEditResult = {
      payloads: [{ orderId: 'edit-1', command: CommandEnum.CLOSE_ALL }],
      skipNormalFlow: true,
    };

    (
      MessageEditHandlerService.prototype.handleMessageEdit as jest.Mock
    ).mockResolvedValue(mockEditResult);

    await step.execute(mockContext, mockNext);

    expect(
      MessageEditHandlerService.prototype.handleMessageEdit,
    ).toHaveBeenCalledWith(
      mockContext.state.command.extraction,
      {
        messageId: 100,
        channelId: 'chan-1',
        accountId: 'acc-1',
        traceToken: 'trace-123',
      },
      undefined,
    );

    expect(mockContext.state.executePayloads).toContainEqual(
      mockEditResult.payloads[0],
    );
    expect(mockContext.state.skipNormalFlow).toBe(true);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should not add payloads if handleMessageEdit returns none', async () => {
    const mockEditResult = {
      payloads: [],
      skipNormalFlow: false,
    };

    (
      MessageEditHandlerService.prototype.handleMessageEdit as jest.Mock
    ).mockResolvedValue(mockEditResult);

    await step.execute(mockContext, mockNext);

    expect(mockContext.state.executePayloads).toHaveLength(0);
    expect(mockContext.state.skipNormalFlow).toBe(false);
    expect(mockNext).toHaveBeenCalled();
  });
});
