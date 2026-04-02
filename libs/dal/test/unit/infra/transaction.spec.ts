/**
 * Purpose: Unit tests for MongoDB transaction utility.
 * Core Flow: Spy on MongoDB client/session → Test successful transactions → Test rollback scenarios → Verify cleanup.
 */

import { withMongoTransaction } from '../../../src/infra/transaction';
import * as db from '../../../src/infra/db';
import { ClientSession } from 'mongodb';

describe('withMongoTransaction', () => {
  let mockSession: any;
  let mockClient: any;

  beforeEach(() => {
    // Create mock session
    mockSession = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };

    // Create mock client with startSession method
    mockClient = {
      startSession: jest.fn().mockReturnValue(mockSession),
    };

    // Replace mongoDb.client with our mock client
    (db.mongoDb as any) = {
      client: mockClient,
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('withMongoTransaction', () => {
    it('should execute operation within a transaction', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      const mockResult = 'success';

      // Mock withTransaction to execute the callback
      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback();
      });

      const result = await withMongoTransaction(mockOperation);

      expect(mockClient.startSession).toHaveBeenCalledTimes(1);
      expect(mockSession.withTransaction).toHaveBeenCalledTimes(1);
      expect(mockOperation).toHaveBeenCalledWith(mockSession);
      expect(mockSession.endSession).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockResult);
    });

    it('should return the operation result', async () => {
      const expectedResult = { data: 'test-data', count: 42 };
      const mockOperation = jest.fn().mockResolvedValue(expectedResult);

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback();
      });

      const result = await withMongoTransaction(mockOperation);

      expect(result).toEqual(expectedResult);
    });

    it('should rollback transaction on error', async () => {
      const mockError = new Error('Operation failed');
      const mockOperation = jest.fn().mockRejectedValue(mockError);

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback();
      });

      await expect(withMongoTransaction(mockOperation)).rejects.toThrow(
        'Operation failed'
      );

      expect(mockClient.startSession).toHaveBeenCalledTimes(1);
      expect(mockSession.withTransaction).toHaveBeenCalledTimes(1);
      expect(mockSession.endSession).toHaveBeenCalledTimes(1);
    });

    it('should clean up session even if operation fails', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Failed'));

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback();
      });

      try {
        await withMongoTransaction(mockOperation);
      } catch (error) {
        // Expected to throw
      }

      expect(mockSession.endSession).toHaveBeenCalledTimes(1);
    });

    it('should clean up session even if withTransaction throws', async () => {
      const mockOperation = jest.fn();
      const transactionError = new Error('Transaction error');

      mockSession.withTransaction.mockRejectedValue(transactionError);

      await expect(withMongoTransaction(mockOperation)).rejects.toThrow(
        'Transaction error'
      );

      expect(mockSession.endSession).toHaveBeenCalledTimes(1);
    });

    it('should pass session to operation callback', async () => {
      const mockOperation = jest.fn(async (session: ClientSession) => {
        expect(session).toBe(mockSession);
        return 'result';
      });

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback();
      });

      await withMongoTransaction(mockOperation);

      expect(mockOperation).toHaveBeenCalledWith(mockSession);
    });
  });
});
