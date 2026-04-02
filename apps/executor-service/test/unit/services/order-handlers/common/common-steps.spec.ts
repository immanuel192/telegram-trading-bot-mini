import { ResolveAccountStep } from '../../../../../src/services/order-handlers/common/resolve-account.step';
import { ResolveAdapterStep } from '../../../../../src/services/order-handlers/common/resolve-adapter.step';
import { StartTransactionStep } from '../../../../../src/services/order-handlers/common/mongo-transaction.step';
import * as dal from '@dal';

jest.mock('@dal', () => ({
  startMongoTransaction: jest.fn(),
}));

describe('Common Pipeline Steps', () => {
  let context: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();

    (dal.startMongoTransaction as jest.Mock).mockResolvedValue(
      'mock-session' as any
    );

    context = {
      payload: { orderId: 'order-1', accountId: 'test-account' },
      container: {
        accountService: {
          getAccountById: jest.fn(),
        },
        brokerFactory: {
          getAdapter: jest.fn(),
        },
      },
      state: {},
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
      },
    } as any;
  });

  describe('ResolveAccountStep', () => {
    it('should resolve account and call next', async () => {
      const mockAccount = { accountId: 'test-account' };
      context.container.accountService.getAccountById.mockResolvedValue(
        mockAccount
      );

      await ResolveAccountStep.execute(context, next);

      expect(
        context.container.accountService.getAccountById
      ).toHaveBeenCalledWith('test-account');
      expect(context.account).toBe(mockAccount);
      expect(next).toHaveBeenCalled();
    });

    it('should throw error if account not found', async () => {
      context.container.accountService.getAccountById.mockResolvedValue(null);

      await expect(ResolveAccountStep.execute(context, next)).rejects.toThrow(
        'Account not found: test-account'
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('ResolveAdapterStep', () => {
    it('should resolve adapter and call next', async () => {
      const mockAdapter = { name: 'mock-adapter' };
      context.container.brokerFactory.getAdapter.mockResolvedValue(mockAdapter);

      await ResolveAdapterStep.execute(context, next);

      expect(context.container.brokerFactory.getAdapter).toHaveBeenCalledWith(
        'test-account'
      );
      expect(context.adapter).toBe(mockAdapter);
      expect(next).toHaveBeenCalled();
    });

    it('should throw error if adapter not resolved', async () => {
      context.container.brokerFactory.getAdapter.mockResolvedValue(null);

      await expect(ResolveAdapterStep.execute(context, next)).rejects.toThrow(
        'Could not resolve adapter for account: test-account'
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('MongoTransactionStep', () => {
    it('should wrap execution in transaction and set session', async () => {
      await StartTransactionStep.execute(context, next);

      expect(dal.startMongoTransaction).toHaveBeenCalled();
      expect(context.session).toBe('mock-session');
      expect(next).toHaveBeenCalled();
    });

    it('should propagate error if next failure occurs', async () => {
      (dal.startMongoTransaction as jest.Mock).mockResolvedValue(
        'error-session' as any
      );
      next.mockRejectedValue(new Error('Follow-up error'));

      await expect(StartTransactionStep.execute(context, next)).rejects.toThrow(
        'Follow-up error'
      );

      expect(context.session).toBe('error-session');
    });
  });
});
