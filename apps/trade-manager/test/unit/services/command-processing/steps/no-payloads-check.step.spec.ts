import { NoPayloadsCheckStep } from '../../../../../src/services/command-processing/steps/no-payloads-check.step';
import {
  fakeLogger,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';

describe(suiteName(__filename), () => {
  let step: NoPayloadsCheckStep;
  let mockNext: jest.Mock;
  let mockContext: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = jest.fn();

    step = new NoPayloadsCheckStep(fakeLogger);

    mockContext = {
      state: {
        command: { command: CommandEnum.LONG },
        account: { accountId: 'acc-1' },
        executePayloads: [],
      },
      messageContext: {
        messageId: 100,
        channelId: 'chan-1',
        traceToken: 'trace-123',
      },
    };
  });

  it('should call next if payloads exist', async () => {
    mockContext.state.executePayloads = [{ some: 'payload' }];

    await step.execute(mockContext, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('should stop pipeline and log warning if no payloads exist', async () => {
    mockContext.state.executePayloads = [];

    await step.execute(mockContext, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(fakeLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 100,
        accountId: 'acc-1',
        command: CommandEnum.LONG,
      }),
      'No execution payloads generated - skipping',
    );
  });
});
