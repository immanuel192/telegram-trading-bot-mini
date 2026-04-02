import {
  BaseExecutionState,
  ExecutionContext,
} from '../../../../src/services/order-handlers/execution-context';
import { OrderHistoryStatus } from '@dal';
import {
  ServiceName,
  CommandEnum,
} from '@telegram-trading-bot-mini/shared/utils';

describe('ExecutionContext', () => {
  let context: ExecutionContext<BaseExecutionState>;
  let payload: any;
  let container: any;

  beforeEach(() => {
    payload = {
      orderId: 'order-1',
      messageId: 123,
      channelId: 'chan-1',
      accountId: 'acc-1',
      traceToken: 'trace-1',
      symbol: 'BTCUSD',
      command: CommandEnum.LONG,
      timestamp: Date.now(),
    };

    container = {
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn().mockReturnThis(),
      },
      orderRepository: {
        updateOne: jest.fn().mockResolvedValue(true),
      },
    };

    context = new ExecutionContext({ payload, container });
  });

  describe('constructor', () => {
    it('should initialize with correct inputs and creates a child logger', () => {
      expect(context.payload).toEqual(payload);
      expect(context.container).toEqual(container);
      expect(container.logger.child).toHaveBeenCalledWith({
        traceToken: payload.traceToken,
        command: payload.command,
        orderId: payload.orderId,
        accountId: payload.accountId,
      });
    });
  });

  describe('abort', () => {
    it('should set isAborted and logs the reason', () => {
      context.abort('User requested');
      expect(context.state.isAborted).toBe(true);
      expect(context.state.abortReason).toBe('User requested');
      expect(context.logger.info).toHaveBeenCalledWith(
        { abortReason: 'User requested' },
        'Execution aborted',
      );
    });
  });

  describe('setError', () => {
    it('should set error state and logs the error', () => {
      const error = new Error('Database down');
      context.setError(error);
      expect(context.state.error).toBe(error);
      expect(context.logger.error).toHaveBeenCalledWith(
        { error },
        'Execution failed with error',
      );
    });
  });

  describe('setFailureResult', () => {
    it('should create a failure result payload pre-filled with context data', () => {
      context.setFailureResult('MKT_CLOSED', 'Market is closed for testing');

      expect(context.result).toEqual({
        orderId: payload.orderId,
        messageId: payload.messageId,
        channelId: payload.channelId,
        accountId: payload.accountId,
        traceToken: payload.traceToken,
        success: false,
        symbol: 'BTCUSD',
        type: 0, // OTHERS
        error: 'Market is closed for testing',
        errorCode: 'MKT_CLOSED',
      });
    });
  });

  describe('addOrderHistory', () => {
    it('should call orderRepository.updateOne with translated history entry and session', async () => {
      context.session = 'mock-session' as any;
      const info = { reason: 'Test' };

      await context.addOrderHistory(OrderHistoryStatus.SKIPPED, info);

      expect(container.orderRepository.updateOne).toHaveBeenCalledWith(
        { orderId: payload.orderId },
        expect.objectContaining({
          $push: {
            history: expect.objectContaining({
              status: OrderHistoryStatus.SKIPPED,
              service: ServiceName.EXECUTOR_SERVICE,
              traceToken: payload.traceToken,
              messageId: payload.messageId,
              channelId: payload.channelId,
              command: payload.command,
              info: info,
            }),
          },
        }),
        'mock-session',
      );
    });

    it('should work without session and empty info', async () => {
      await context.addOrderHistory(OrderHistoryStatus.OPEN);

      expect(container.orderRepository.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
      );
    });
  });
});
