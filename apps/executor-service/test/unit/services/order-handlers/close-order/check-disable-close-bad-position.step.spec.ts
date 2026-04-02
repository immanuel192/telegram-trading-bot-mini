import { CheckDisableCloseBadPositionStep } from '../../../../../src/services/order-handlers/close-order/check-disable-close-bad-position.step';
import {
  ExecutionContext,
  CloseBadPositionExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import { OrderHistoryStatus } from '@dal';

describe('CheckDisableCloseBadPositionStep', () => {
  let step: CheckDisableCloseBadPositionStep;
  let mockContext: any;
  let next: jest.Mock;

  beforeEach(() => {
    step = new CheckDisableCloseBadPositionStep();
    next = jest.fn();
    mockContext = {
      account: {
        accountId: 'test-account',
        configs: {},
      },
      payload: {
        orderId: 'order-123',
        traceToken: 'trace-1',
        messageId: 'msg-1',
        channelId: 'channel-1',
        command: 'CLOSE_BAD_POSITION',
      },
      logger: {
        info: jest.fn(),
      },
      addOrderHistory: jest.fn(),
      abort: jest.fn(),
      state: {},
      result: undefined,
    };
  });

  it('should have the correct name', () => {
    expect(step.name).toBe('CheckDisableCloseBadPosition');
  });

  it('should skip execution and abort when disableCloseBadPosition is true', async () => {
    mockContext.account.configs.disableCloseBadPosition = true;

    await step.execute(mockContext, next);

    expect(mockContext.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-123' }),
      expect.stringContaining('skipped')
    );

    expect(mockContext.addOrderHistory).toHaveBeenCalledWith(
      OrderHistoryStatus.SKIPPED,
      expect.objectContaining({
        message: expect.stringContaining('skipped'),
        reason: expect.stringContaining('Copy trading delay'),
      })
    );

    expect(mockContext.result).toEqual(
      expect.objectContaining({
        orderId: 'order-123',
        success: true,
      })
    );

    expect(mockContext.abort).toHaveBeenCalledWith(
      expect.stringContaining('skipped')
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should continue to next step when disableCloseBadPosition is false', async () => {
    mockContext.account.configs.disableCloseBadPosition = false;

    await step.execute(mockContext, next);

    expect(mockContext.abort).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should continue to next step when disableCloseBadPosition is undefined', async () => {
    mockContext.account.configs.disableCloseBadPosition = undefined;

    await step.execute(mockContext, next);

    expect(mockContext.abort).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should continue to next step when configs is undefined', async () => {
    mockContext.account.configs = undefined;

    await step.execute(mockContext, next);

    expect(mockContext.abort).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
