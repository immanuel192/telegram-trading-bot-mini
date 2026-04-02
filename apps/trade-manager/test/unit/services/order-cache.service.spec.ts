/**
 * Unit tests for OrderCacheService
 */

import { OrderCacheService } from '../../../src/services/order-cache.service';
import { OrderRepository, OrderStatus } from '@dal';
import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
import { AccountService } from '../../../src/services/account.service';

describe('OrderCacheService', () => {
  let service: OrderCacheService;
  let mockRepository: jest.Mocked<OrderRepository>;
  let mockLogger: jest.Mocked<LoggerInstance>;
  let mockAccountService: jest.Mocked<AccountService>;

  beforeEach(() => {
    mockRepository = {
      findAll: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockAccountService = {
      getAccountByIdWithCache: jest.fn(),
    } as any;

    service = new OrderCacheService(
      mockRepository,
      mockAccountService,
      mockLogger,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('refreshCache', () => {
    it('should load open orders from database into cache', async () => {
      const mockOrders = [
        {
          orderId: 'order-1',
          accountId: 'acc-1',
          symbol: 'BTCUSD',
          side: 'LONG',
          lotSize: 0.1,
          lotSizeRemaining: 0.1,
          meta: { takeProfitTiers: [{ price: 50000, isUsed: true }] },
        },
        {
          orderId: 'order-2',
          accountId: 'acc-1',
          symbol: 'ETHUSD',
          side: 'SHORT',
          lotSize: 1.0,
          lotSizeRemaining: 0.5,
          meta: { takeProfitTiers: [{ price: 2000 }] },
        },
      ];

      mockAccountService.getAccountByIdWithCache.mockResolvedValue({
        configs: { enableTpMonitoring: true },
      } as any);
      mockRepository.findAll.mockResolvedValue(mockOrders as any);

      await service.refreshCache();

      expect(mockRepository.findAll).toHaveBeenCalledWith(
        { status: OrderStatus.OPEN },
        undefined,
        expect.any(Object),
      );

      const cached1 = service.getOrder('order-1');
      expect(cached1).toBeDefined();
      expect(cached1?.symbol).toBe('BTCUSD');
      expect(cached1?.takeProfits).toEqual([{ price: 50000, isUsed: true }]);
      expect(cached1?.isTpMonitoringAvailable).toBe(true);

      const cached2 = service.getOrder('order-2');
      expect(cached2).toBeDefined();
      expect(cached2?.lotSizeRemaining).toBe(0.5);
      expect(cached2?.takeProfits[0].isUsed).toBeUndefined();

      expect(service.getStats().totalOrders).toBe(2);
    });

    it('should prune orders from cache that are no longer in database', async () => {
      // Mock progression
      jest.spyOn(Date, 'now').mockReturnValue(1000);

      // 1. Initially populate cache with 2 orders
      mockRepository.findAll.mockResolvedValue([
        {
          orderId: 'order-1',
          accountId: 'acc-1',
          symbol: 'SYM1',
          side: 'LONG',
          lotSize: 0.1,
        },
        {
          orderId: 'order-2',
          accountId: 'acc-1',
          symbol: 'SYM2',
          side: 'LONG',
          lotSize: 0.1,
        },
      ] as any);
      await service.refreshCache();
      expect(service.getStats().totalOrders).toBe(2);

      // Mock time progression for second refresh
      jest.spyOn(Date, 'now').mockReturnValue(2000);

      // 2. Refresh with only 1 order present in DB
      mockRepository.findAll.mockResolvedValue([
        {
          orderId: 'order-2',
          accountId: 'acc-1',
          symbol: 'SYM2',
          side: 'LONG',
          lotSize: 0.1,
        },
      ] as any);
      await service.refreshCache();

      expect(service.getStats().totalOrders).toBe(1);
      expect(service.getOrder('order-1')).toBeUndefined();
      expect(service.getOrder('order-2')).toBeDefined();
    });

    it('should NOT overwrite newer cache data with stale database data', async () => {
      const refreshStartTime = 1000;
      const eventTime = 2000;

      // 1. Reactive event updates the cache with a newer timestamp (2000)
      jest.spyOn(Date, 'now').mockReturnValue(eventTime);
      await service.addOrder(
        'order-1',
        'acc-1',
        'SYM1',
        'LONG',
        101,
        'chan-1',
        0.1,
        [{ price: 100 }],
      );

      // 2. Refresh runs with an earlier start time (1000)
      jest.spyOn(Date, 'now').mockReturnValue(refreshStartTime);

      // DB returns an old version of the order
      mockRepository.findAll.mockResolvedValue([
        {
          orderId: 'order-1',
          accountId: 'acc-1',
          symbol: 'SYM1',
          side: 'LONG',
          lotSize: 0.1,
          lotSizeRemaining: 0.1,
        },
      ] as any);

      await service.refreshCache();

      const cachedAfter = service.getOrder('order-1')!;
      // Should STILL have the event data and timestamp
      expect(cachedAfter.lastUpdated).toBe(eventTime);
      expect(cachedAfter.takeProfits).toEqual([{ price: 100 }]); // Kept the newer data
    });
  });

  describe('CRUD Operations', () => {
    it('should add an order successfully', async () => {
      mockAccountService.getAccountByIdWithCache.mockResolvedValue({
        configs: { enableTpMonitoring: true },
      } as any);

      await service.addOrder(
        'new-order',
        'acc-1',
        'XAUUSD',
        'LONG',
        102,
        'chan-1',
        0.05,
        [{ price: 2000 }],
      );

      const order = service.getOrder('new-order');
      expect(order).toBeDefined();
      expect(order?.accountId).toBe('acc-1');
      expect(order?.takeProfits).toEqual([{ price: 2000 }]);
      expect(order?.isTpMonitoringAvailable).toBe(true);
      expect(service.getAccountOrderIds('acc-1').has('new-order')).toBe(true);
    });

    it('should update an existing order', async () => {
      await service.addOrder(
        'order-1',
        'acc-1',
        'SYM1',
        'LONG',
        103,
        'chan-1',
        1.0,
      );

      service.updateOrder('order-1', {
        lotSizeRemaining: 0.7,
        takeProfits: [{ price: 150 }],
      });

      const order = service.getOrder('order-1');
      expect(order?.lotSizeRemaining).toBe(0.7);
      expect(order?.takeProfits).toEqual([{ price: 150 }]);
    });

    it('should remove an order successfully', async () => {
      await service.addOrder(
        'order-1',
        'acc-1',
        'SYM1',
        'LONG',
        104,
        'chan-1',
        1.0,
      );
      expect(service.getStats().totalOrders).toBe(1);

      service.removeOrder('order-1');

      expect(service.getOrder('order-1')).toBeUndefined();
      expect(service.getAccountOrderIds('acc-1').size).toBe(0);
      expect(service.getStats().totalOrders).toBe(0);
    });
  });

  describe('Indexing', () => {
    it('should return multiple orders for the same account', async () => {
      await service.addOrder('o1', 'acc-1', 'S1', 'L', 105, 'c1', 1);
      await service.addOrder('o2', 'acc-1', 'S2', 'L', 106, 'c1', 1);
      await service.addOrder('o3', 'acc-2', 'S3', 'L', 107, 'c2', 1);

      const acc1Orders = service.getAccountOrders('acc-1');
      expect(acc1Orders).toHaveLength(2);
      expect(acc1Orders.map((o) => o.orderId)).toContain('o1');
      expect(acc1Orders.map((o) => o.orderId)).toContain('o2');
    });

    it('should handle index cleanup when last order of account is removed', async () => {
      await service.addOrder('o1', 'acc-1', 'S1', 'L', 108, 'c1', 1);
      expect(service.getAccountOrders('acc-1')).toHaveLength(1);

      service.removeOrder('o1');
      expect(service.getAccountOrders('acc-1')).toHaveLength(0);
      expect(service.getStats().totalAccounts).toBe(0);
    });

    it('should maintain symbol index correctly', async () => {
      await service.addOrder('o1', 'acc-1', 'XAUUSD', 'LONG', 109, 'c1', 1);
      await service.addOrder('o2', 'acc-1', 'XAUUSD', 'SHORT', 110, 'c1', 1);
      await service.addOrder('o3', 'acc-2', 'BTCUSD', 'LONG', 111, 'c2', 1);

      expect(service.getStats().totalSymbols).toBe(2);
      expect(service.getOrdersBySymbol('XAUUSD')).toHaveLength(2);

      service.removeOrder('o1');
      expect(service.getStats().totalSymbols).toBe(2); // XAUUSD still has o2
      expect(service.getOrdersBySymbol('XAUUSD')).toHaveLength(1);

      service.removeOrder('o2');
      expect(service.getStats().totalSymbols).toBe(1); // XAUUSD removed
      expect(service.getOrdersBySymbol('XAUUSD')).toHaveLength(0);
    });
  });
});
