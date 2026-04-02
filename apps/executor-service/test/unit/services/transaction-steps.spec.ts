import { ClientSession } from 'mongodb';
import {
  StartTransactionStep,
  CommitTransactionStep,
  RollbackTransactionStep,
} from '../../../src/services/order-handlers/common';
import {
  BaseExecutionState,
  ExecutionContext,
} from '../../../src/services/order-handlers/execution-context';
import {
  ExecuteOrderRequestPayload,
  CommandEnum,
  ExecuteOrderResultType,
} from '@telegram-trading-bot-mini/shared/utils';
import * as transactionModule from '@dal';

jest.mock('@dal', () => ({
  ...jest.requireActual('@dal'),
  startMongoTransaction: jest.fn(),
  commitMongoTransaction: jest.fn(),
  abortMongoTransaction: jest.fn(),
}));

/**
 * Transaction Steps Tests
 *
 * SKIPPED: MongoDB transactions are disabled for MVP due to write conflicts.
 * See pipeline-executor.service.ts header for full explanation.
 *
 * These tests will be re-enabled when transactions are implemented post-MVP
 * with optimistic locking and proper conflict resolution.
 */

describe.skip('Transaction Steps', () => {
  let mockSession: Partial<ClientSession>;
  let context: ExecutionContext<BaseExecutionState>;
  let mockNext: jest.Mock;
  let mockLogger: any;
  let mockContainer: any;

  beforeEach(() => {
    // Reset all module mocks first
    jest.resetAllMocks();

    // Mock session
    mockSession = {
      endSession: jest.fn().mockResolvedValue(undefined),
      hasEnded: false,
    };

    // ... (rest of the setup)
    (transactionModule.startMongoTransaction as jest.Mock).mockResolvedValue(
      mockSession,
    );
    (transactionModule.commitMongoTransaction as jest.Mock).mockResolvedValue(
      undefined,
    );
    (transactionModule.abortMongoTransaction as jest.Mock).mockResolvedValue(
      undefined,
    );

    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnThis(),
    };

    // Mock container
    mockContainer = {
      logger: mockLogger,
    };

    // Create context
    const payload: ExecuteOrderRequestPayload = {
      orderId: 'test-order-123',
      accountId: 'test-account',
      command: CommandEnum.LONG,
      symbol: 'BTC/USD',
      traceToken: 'test-trace',
      messageId: 123,
      channelId: 'channel-123',
      timestamp: Date.now(),
    };

    context = new ExecutionContext({
      payload,
      container: mockContainer,
    });

    mockNext = jest.fn().mockResolvedValue(undefined);
  });

  describe('StartTransactionStep', () => {
    it('should start a transaction and set session on context', async () => {
      (transactionModule.startMongoTransaction as jest.Mock).mockResolvedValue(
        mockSession,
      );

      await StartTransactionStep.execute(context, mockNext);

      expect(transactionModule.startMongoTransaction).toHaveBeenCalled();
      expect(context.session).toBe(mockSession);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { orderId: 'test-order-123' },
        'MongoDB transaction started',
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should propagate errors from transaction start', async () => {
      const error = new Error('Transaction start failed');
      (transactionModule.startMongoTransaction as jest.Mock).mockRejectedValue(
        error,
      );

      await expect(
        StartTransactionStep.execute(context, mockNext),
      ).rejects.toThrow('Transaction start failed');
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('CommitTransactionStep', () => {
    beforeEach(() => {
      context.session = mockSession as ClientSession;
    });

    it('should commit transaction and close session on success', async () => {
      await CommitTransactionStep.execute(context, mockNext);

      expect(transactionModule.commitMongoTransaction).toHaveBeenCalledWith(
        mockSession,
      );
      expect(mockSession.endSession).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        { orderId: 'test-order-123' },
        'MongoDB transaction committed successfully',
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip if no session exists', async () => {
      context.session = undefined;

      await CommitTransactionStep.execute(context, mockNext);

      expect(transactionModule.commitMongoTransaction).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { orderId: 'test-order-123' },
        'No active session found, skipping transaction commit',
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw error if commit fails (session cleanup handled by RollbackTransactionStep)', async () => {
      const commitError = new Error('Commit failed');
      (transactionModule.commitMongoTransaction as jest.Mock).mockRejectedValue(
        commitError,
      );

      await expect(
        CommitTransactionStep.execute(context, mockNext),
      ).rejects.toThrow('Commit failed');

      // Session is NOT closed here - RollbackTransactionStep will handle it
      expect(mockSession.endSession).not.toHaveBeenCalled();
    });

    it('should throw error if session close fails', async () => {
      // Reset commit mock to succeed
      (transactionModule.commitMongoTransaction as jest.Mock).mockResolvedValue(
        undefined,
      );

      const closeError = new Error('Close failed');
      (mockSession.endSession as jest.Mock).mockRejectedValue(closeError);

      await expect(
        CommitTransactionStep.execute(context, mockNext),
      ).rejects.toThrow('Close failed');
    });
  });

  describe('RollbackTransactionStep', () => {
    beforeEach(() => {
      context.session = mockSession as ClientSession;
    });

    describe('when no error occurred', () => {
      it('should only close session without commit/rollback', async () => {
        // No error in state
        context.state.error = undefined;

        await RollbackTransactionStep.execute(context, mockNext);

        expect(transactionModule.commitMongoTransaction).not.toHaveBeenCalled();
        expect(transactionModule.abortMongoTransaction).not.toHaveBeenCalled();
        expect(mockSession.endSession).toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith(
          { orderId: 'test-order-123' },
          'No error - transaction already committed',
        );
        expect(mockNext).toHaveBeenCalled();
      });
    });

    describe('when error occurred before broker operation', () => {
      it('should rollback transaction and close session', async () => {
        const error = new Error('Validation failed');
        context.state.error = error;
        context.result = undefined; // No broker operation

        await RollbackTransactionStep.execute(context, mockNext);

        expect(transactionModule.abortMongoTransaction).toHaveBeenCalledWith(
          mockSession,
        );
        expect(mockSession.endSession).toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(
          { orderId: 'test-order-123', error: 'Validation failed' },
          'Rolling back transaction due to error before broker operation',
        );
        expect(mockNext).toHaveBeenCalled();
      });
    });

    describe('when error occurred after broker operation', () => {
      it('should commit transaction to preserve broker operation', async () => {
        const error = new Error('Post-broker error');
        context.state.error = error;
        context.result = {
          orderId: 'test-order-123',
          messageId: 123,
          channelId: 'channel-123',
          accountId: 'test-account',
          traceToken: 'test-trace',
          success: true,
          type: ExecuteOrderResultType.OrderOpen,
        };

        await RollbackTransactionStep.execute(context, mockNext);

        expect(transactionModule.commitMongoTransaction).toHaveBeenCalledWith(
          mockSession,
        );
        expect(mockSession.endSession).toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          { orderId: 'test-order-123', error: 'Post-broker error' },
          'Committing transaction despite error (broker operation succeeded)',
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          { orderId: 'test-order-123' },
          'Transaction committed to preserve broker operation',
        );
        expect(mockNext).toHaveBeenCalled();
      });
    });

    describe('when session is already closed', () => {
      it('should skip if session.hasEnded is true', async () => {
        (mockSession as any).hasEnded = true;

        await RollbackTransactionStep.execute(context, mockNext);

        expect(transactionModule.commitMongoTransaction).not.toHaveBeenCalled();
        expect(transactionModule.abortMongoTransaction).not.toHaveBeenCalled();
        expect(mockSession.endSession).not.toHaveBeenCalled();
        expect(mockNext).toHaveBeenCalled();
      });
    });

    describe('when commit/abort fails', () => {
      beforeEach(() => {
        jest.clearAllMocks();
      });

      it('should try to abort as fallback if commit fails', async () => {
        const error = new Error('Post-broker error');
        context.state.error = error;
        context.result = {
          orderId: 'test-order-123',
          messageId: 123,
          channelId: 'channel-123',
          accountId: 'test-account',
          traceToken: 'test-trace',
          success: true,
          type: ExecuteOrderResultType.OrderOpen,
        };

        const commitError = new Error('Commit failed');
        (
          transactionModule.commitMongoTransaction as jest.Mock
        ).mockRejectedValue(commitError);

        await RollbackTransactionStep.execute(context, mockNext);

        expect(transactionModule.abortMongoTransaction).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          { orderId: 'test-order-123', error: commitError },
          'Failed to commit/rollback transaction in error handler',
        );
        expect(mockSession.endSession).toHaveBeenCalled();
      });

      it('should log error if abort fallback also fails', async () => {
        const error = new Error('Post-broker error');
        context.state.error = error;
        context.result = {
          orderId: 'test-order-123',
          messageId: 123,
          channelId: 'channel-123',
          accountId: 'test-account',
          traceToken: 'test-trace',
          success: true,
          type: ExecuteOrderResultType.OrderOpen,
        };

        const commitError = new Error('Commit failed');
        const abortError = new Error('Abort failed');
        (
          transactionModule.commitMongoTransaction as jest.Mock
        ).mockRejectedValue(commitError);
        (
          transactionModule.abortMongoTransaction as jest.Mock
        ).mockRejectedValue(abortError);

        await RollbackTransactionStep.execute(context, mockNext);

        expect(mockLogger.error).toHaveBeenCalledWith(
          { orderId: 'test-order-123', error: abortError },
          'Failed to abort transaction during error recovery - session may be in inconsistent state',
        );
        expect(mockSession.endSession).toHaveBeenCalled();
      });

      it('should still close session even if endSession fails', async () => {
        const closeError = new Error('Close failed');
        (mockSession.endSession as jest.Mock).mockRejectedValue(closeError);

        await RollbackTransactionStep.execute(context, mockNext);

        expect(mockLogger.error).toHaveBeenCalledWith(
          { orderId: 'test-order-123', error: closeError },
          'Failed to close MongoDB session - potential session leak',
        );
        expect(mockNext).toHaveBeenCalled();
      });
    });
  });

  describe('Integration: Transaction Flow', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should handle complete success flow', async () => {
      // Start transaction
      (transactionModule.startMongoTransaction as jest.Mock).mockResolvedValue(
        mockSession,
      );
      await StartTransactionStep.execute(context, mockNext);

      // Simulate successful broker operation
      context.result = {
        orderId: 'test-order-123',
        messageId: 123,
        channelId: 'channel-123',
        accountId: 'test-account',
        traceToken: 'test-trace',
        success: true,
        type: ExecuteOrderResultType.OrderOpen,
      };

      // Commit transaction
      await CommitTransactionStep.execute(context, mockNext);

      // Rollback step should skip (session already closed)
      (mockSession as any).hasEnded = true;
      await RollbackTransactionStep.execute(context, mockNext);

      expect(transactionModule.startMongoTransaction).toHaveBeenCalled();
      expect(transactionModule.commitMongoTransaction).toHaveBeenCalled();
      expect(transactionModule.abortMongoTransaction).not.toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalledTimes(1);
    });

    it('should handle error before broker operation', async () => {
      // Start transaction
      (transactionModule.startMongoTransaction as jest.Mock).mockResolvedValue(
        mockSession,
      );
      await StartTransactionStep.execute(context, mockNext);

      // Simulate error before broker operation
      context.state.error = new Error('Validation failed');
      context.result = undefined;

      // Rollback step should abort
      await RollbackTransactionStep.execute(context, mockNext);

      expect(transactionModule.startMongoTransaction).toHaveBeenCalled();
      expect(transactionModule.commitMongoTransaction).not.toHaveBeenCalled();
      expect(transactionModule.abortMongoTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should handle error after broker operation', async () => {
      // Start transaction
      (transactionModule.startMongoTransaction as jest.Mock).mockResolvedValue(
        mockSession,
      );
      await StartTransactionStep.execute(context, mockNext);

      // Simulate successful broker operation
      context.result = {
        orderId: 'test-order-123',
        messageId: 123,
        channelId: 'channel-123',
        accountId: 'test-account',
        traceToken: 'test-trace',
        success: true,
        type: ExecuteOrderResultType.OrderOpen,
      };

      // Simulate error after broker operation
      context.state.error = new Error('Post-broker error');

      // Rollback step should commit to preserve broker operation
      await RollbackTransactionStep.execute(context, mockNext);

      expect(transactionModule.startMongoTransaction).toHaveBeenCalled();
      expect(transactionModule.commitMongoTransaction).toHaveBeenCalled();
      expect(transactionModule.abortMongoTransaction).not.toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });
  });
});
