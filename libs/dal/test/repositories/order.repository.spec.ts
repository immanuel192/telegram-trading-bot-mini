/**
 * Purpose: Integration tests for OrderRepository operations.
 * Prerequisites: MongoDB running (via 'npm run stack:up').
 * Core Flow: Test order CRUD operations → Test order queries by various criteria → Test uniqueness constraints → Cleanup.
 */

import { OrderRepository } from '../../src/repositories/order.repository';
import {
  Order,
  OrderSide,
  OrderExecutionType,
  OrderStatus,
  TradeType,
} from '../../src/models/order.model';
import {
  suiteName,
  setupDb,
  teardownDb,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';
import ShortUniqueId from 'short-unique-id';

const uid = new ShortUniqueId({ length: 10 });

/**
 * Helper function to create a complete test order with all required fields
 */
const createTestOrder = (overrides: Partial<Order> = {}): Order => {
  return {
    accountId: 'test-account-1',
    orderId: uid.rnd(),
    messageId: 12345,
    channelId: 'test-channel-1',
    status: OrderStatus.PENDING,
    side: OrderSide.LONG,
    executionType: OrderExecutionType.market,
    tradeType: TradeType.SPOT,
    createdAt: new Date(),
    symbol: 'BTCUSD',
    lotSize: 0.1,
    entry: {
      entryPrice: 50000,
    },
    exit: {},
    pnl: {},
    sl: {
      slPrice: 49000,
    },
    tp: {
      tp1Price: 51000,
    },
    history: [],
    ...overrides,
  };
};

describe(suiteName(__filename), () => {
  let orderRepository: OrderRepository;

  beforeAll(async () => {
    await setupDb();
    orderRepository = new OrderRepository();
  });

  afterAll(async () => {
    await teardownDb();
  });

  afterEach(async () => {
    await cleanupDb(null, [COLLECTIONS.ORDERS]);
  });

  describe('create', () => {
    it('should successfully create an order with all required fields', async () => {
      const order = createTestOrder();
      const created = await orderRepository.create(order);

      expect(created).toBeDefined();
      expect(created._id).toBeDefined();
      expect(created.accountId).toBe(order.accountId);
      expect(created.orderId).toBe(order.orderId);
      expect(created.status).toBe(OrderStatus.PENDING);
      expect(created.side).toBe(OrderSide.LONG);
      expect(created.executionType).toBe(OrderExecutionType.market);
      expect(created.tradeType).toBe(TradeType.SPOT);
      expect(created.symbol).toBe('BTCUSD');
      expect(created.lotSize).toBe(0.1);
      expect(created.entry.entryPrice).toBe(50000);
      expect(created.sl.slPrice).toBe(49000);
      expect(created.tp.tp1Price).toBe(51000);
      expect(created.history).toEqual([]);
    });

    it('should create order with optional fields', async () => {
      const order = createTestOrder({
        actualSymbol: 'BTCUSD',
        leverage: 50,
        tradeType: TradeType.FUTURE,
        entry: {
          entryPrice: 50000,
          actualEntryPrice: 50010,
        },
        tp: {
          tp1Price: 51000,
          tp2Price: 52000,
          tp3Price: 53000,
        },
      });

      const created = await orderRepository.create(order);

      expect(created).toBeDefined();
      expect(created.actualSymbol).toBe('BTCUSD');
      expect(created.leverage).toBe(50);
      expect(created.tradeType).toBe(TradeType.FUTURE);
      expect(created.entry.actualEntryPrice).toBe(50010);
      expect(created.tp.tp2Price).toBe(52000);
      expect(created.tp.tp3Price).toBe(53000);
    });

    it('should create order with meta.takeProfitTiers', async () => {
      const takeProfitTiers = [
        { price: 51000, isUsed: true },
        { price: 52000, isUsed: false },
        { price: 53000 },
      ];
      const order = createTestOrder({
        meta: {
          takeProfitTiers,
        },
      });

      const created = await orderRepository.create(order);

      expect(created).toBeDefined();
      expect(created.meta?.takeProfitTiers).toHaveLength(3);
      expect(created.meta?.takeProfitTiers).toEqual(takeProfitTiers);
    });

    it('should successfully create an order with lotSizeRemaining', async () => {
      const order = createTestOrder({
        lotSizeRemaining: 0.1,
      });
      const created = await orderRepository.create(order);

      expect(created).toBeDefined();
      expect(created.lotSizeRemaining).toBe(0.1);
    });
  });

  describe('findByOrderId', () => {
    it('should return correct order when orderId exists', async () => {
      const order = createTestOrder();
      await orderRepository.create(order);

      const found = await orderRepository.findByOrderId(order.orderId);

      expect(found).toBeDefined();
      expect(found?.orderId).toBe(order.orderId);
      expect(found?.symbol).toBe('BTCUSD');
      expect(found?.accountId).toBe(order.accountId);
    });

    it('should return null when orderId does not exist', async () => {
      const found = await orderRepository.findByOrderId(
        'non-existent-order-id',
      );
      expect(found).toBeNull();
    });
  });

  describe('findByAccountId', () => {
    it('should return all orders for a specific accountId', async () => {
      const accountId = 'test-account-7';

      const order1 = createTestOrder({ accountId, symbol: 'BTCUSD' });
      const order2 = createTestOrder({ accountId, symbol: 'ETHUSD' });
      const order3 = createTestOrder({
        accountId: 'different-account',
        symbol: 'XRPUSD',
      });

      await Promise.all([
        orderRepository.create(order1),
        orderRepository.create(order2),
        orderRepository.create(order3),
      ]);

      const orders = await orderRepository.findByAccountId(accountId);

      expect(orders).toHaveLength(2);
      expect(orders.every((o) => o.accountId === accountId)).toBe(true);
      expect(orders.map((o) => o.symbol)).toContain('BTCUSD');
      expect(orders.map((o) => o.symbol)).toContain('ETHUSD');
    });

    it('should return empty array when no orders exist for account', async () => {
      const orders = await orderRepository.findByAccountId(
        'non-existent-account',
      );
      expect(orders).toHaveLength(0);
    });
  });

  describe('findByStatus', () => {
    it('should return all orders with specific status', async () => {
      const pending1 = createTestOrder({ status: OrderStatus.PENDING });
      const pending2 = createTestOrder({ status: OrderStatus.PENDING });
      const open1 = createTestOrder({ status: OrderStatus.OPEN });

      await Promise.all([
        orderRepository.create(pending1),
        orderRepository.create(pending2),
        orderRepository.create(open1),
      ]);

      const pendingOrders = await orderRepository.findByStatus(
        OrderStatus.PENDING,
      );
      expect(pendingOrders).toHaveLength(2);
      expect(pendingOrders.every((o) => o.status === OrderStatus.PENDING)).toBe(
        true,
      );

      const openOrders = await orderRepository.findByStatus(OrderStatus.OPEN);
      expect(openOrders).toHaveLength(1);
      expect(openOrders[0].status).toBe(OrderStatus.OPEN);
    });
  });

  describe('findOpenOrders', () => {
    it('should return only open orders', async () => {
      const pending = createTestOrder({ status: OrderStatus.PENDING });
      const open1 = createTestOrder({ status: OrderStatus.OPEN });
      const open2 = createTestOrder({ status: OrderStatus.OPEN });
      const closed = createTestOrder({ status: OrderStatus.CLOSED });

      await Promise.all([
        orderRepository.create(pending),
        orderRepository.create(open1),
        orderRepository.create(open2),
        orderRepository.create(closed),
      ]);

      const openOrders = await orderRepository.findOpenOrders();

      expect(openOrders).toHaveLength(2);
      expect(openOrders.every((o) => o.status === OrderStatus.OPEN)).toBe(true);
    });
  });

  describe('findPendingOrders', () => {
    it('should return only pending orders', async () => {
      const pending1 = createTestOrder({ status: OrderStatus.PENDING });
      const pending2 = createTestOrder({ status: OrderStatus.PENDING });
      const open = createTestOrder({ status: OrderStatus.OPEN });

      await Promise.all([
        orderRepository.create(pending1),
        orderRepository.create(pending2),
        orderRepository.create(open),
      ]);

      const pendingOrders = await orderRepository.findPendingOrders();

      expect(pendingOrders).toHaveLength(2);
      expect(pendingOrders.every((o) => o.status === OrderStatus.PENDING)).toBe(
        true,
      );
    });
  });

  describe('findByAccountAndStatus', () => {
    it('should return orders matching both account and status', async () => {
      const accountId = 'test-account';

      const order1 = createTestOrder({
        accountId,
        status: OrderStatus.PENDING,
      });
      const order2 = createTestOrder({ accountId, status: OrderStatus.OPEN });
      const order3 = createTestOrder({ accountId, status: OrderStatus.OPEN });
      const order4 = createTestOrder({
        accountId: 'other-account',
        status: OrderStatus.OPEN,
      });

      await Promise.all([
        orderRepository.create(order1),
        orderRepository.create(order2),
        orderRepository.create(order3),
        orderRepository.create(order4),
      ]);

      const orders = await orderRepository.findByAccountAndStatus(
        accountId,
        OrderStatus.OPEN,
      );

      expect(orders).toHaveLength(2);
      expect(orders.every((o) => o.accountId === accountId)).toBe(true);
      expect(orders.every((o) => o.status === OrderStatus.OPEN)).toBe(true);
    });
  });

  describe('countOpenOrdersByAccountId', () => {
    it('should correctly count open orders for an account', async () => {
      const accountId = 'count-test-account';

      await Promise.all([
        orderRepository.create(
          createTestOrder({ accountId, status: OrderStatus.OPEN }),
        ),
        orderRepository.create(
          createTestOrder({ accountId, status: OrderStatus.OPEN }),
        ),
        orderRepository.create(
          createTestOrder({ accountId, status: OrderStatus.PENDING }),
        ),
        orderRepository.create(
          createTestOrder({
            accountId: 'other-account',
            status: OrderStatus.OPEN,
          }),
        ),
      ]);

      const count = await orderRepository.countOpenOrdersByAccountId(accountId);
      expect(count).toBe(2);
    });

    it('should return 0 when no open orders exist for account', async () => {
      const count =
        await orderRepository.countOpenOrdersByAccountId('empty-account');
      expect(count).toBe(0);
    });
  });

  describe('OrderId Uniqueness', () => {
    it('should enforce unique constraint on orderId', async () => {
      const orderId = uid.rnd();

      const order1 = createTestOrder({ orderId });
      const order2 = createTestOrder({ orderId }); // Same orderId

      await orderRepository.create(order1);

      // Attempting to create order with duplicate orderId should throw
      await expect(orderRepository.create(order2)).rejects.toThrow();
    });
  });

  describe('BaseRepository methods', () => {
    it('should support findById', async () => {
      const order = createTestOrder();
      const created = await orderRepository.create(order);
      const found = await orderRepository.findById(created._id!.toString());

      expect(found).toBeDefined();
      expect(found?.orderId).toBe(order.orderId);
    });

    it('should support findAll', async () => {
      await orderRepository.create(createTestOrder());
      await orderRepository.create(createTestOrder());

      const all = await orderRepository.findAll();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('should support update', async () => {
      const order = createTestOrder();
      const created = await orderRepository.create(order);

      const updated = await orderRepository.update(created._id!.toString(), {
        actualSymbol: 'BTCUSD',
        status: OrderStatus.OPEN,
      });

      expect(updated).toBe(true);

      const found = await orderRepository.findByOrderId(order.orderId);
      expect(found?.actualSymbol).toBe('BTCUSD');
      expect(found?.status).toBe(OrderStatus.OPEN);
    });

    it('should support delete', async () => {
      const order = createTestOrder();
      const created = await orderRepository.create(order);
      const deleted = await orderRepository.delete(created._id!.toString());

      expect(deleted).toBe(true);

      const found = await orderRepository.findByOrderId(order.orderId);
      expect(found).toBeNull();
    });
  });

  describe('Order Types and Trade Types', () => {
    it('should create LONG market SPOT order', async () => {
      const order = createTestOrder({
        side: OrderSide.LONG,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.SPOT,
      });

      const created = await orderRepository.create(order);

      expect(created.side).toBe(OrderSide.LONG);
      expect(created.executionType).toBe(OrderExecutionType.market);
      expect(created.tradeType).toBe(TradeType.SPOT);
    });

    it('should create SHORT limit FUTURE order with leverage', async () => {
      const order = createTestOrder({
        side: OrderSide.SHORT,
        executionType: OrderExecutionType.limit,
        tradeType: TradeType.FUTURE,
        leverage: 50,
      });

      const created = await orderRepository.create(order);

      expect(created.side).toBe(OrderSide.SHORT);
      expect(created.executionType).toBe(OrderExecutionType.limit);
      expect(created.tradeType).toBe(TradeType.FUTURE);
      expect(created.leverage).toBe(50);
    });

    it('should create GOLD_CFD order', async () => {
      const order = createTestOrder({
        tradeType: TradeType.GOLD_CFD,
        symbol: 'XAUUSD',
      });

      const created = await orderRepository.create(order);

      expect(created.tradeType).toBe(TradeType.GOLD_CFD);
      expect(created.symbol).toBe('XAUUSD');
    });
  });

  describe('Order Lifecycle', () => {
    it('should track order from PENDING to OPEN to CLOSED', async () => {
      const order = createTestOrder({ status: OrderStatus.PENDING });
      const created = await orderRepository.create(order);

      // Update to OPEN
      await orderRepository.update(created._id!.toString(), {
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 50000,
          actualEntryPrice: 50010,
        },
      });

      let found = await orderRepository.findByOrderId(order.orderId);
      expect(found?.status).toBe(OrderStatus.OPEN);
      expect(found?.entry.actualEntryPrice).toBe(50010);

      // Update to CLOSED
      await orderRepository.update(created._id!.toString(), {
        status: OrderStatus.CLOSED,
        closedAt: new Date(),
        exit: {
          actualExitPrice: 51020,
        },
        pnl: {
          pnl: 100.5,
        },
      });

      found = await orderRepository.findByOrderId(order.orderId);
      expect(found?.status).toBe(OrderStatus.CLOSED);
      expect(found?.closedAt).toBeDefined();
      expect(found?.exit.actualExitPrice).toBe(51020);
      expect(found?.pnl.pnl).toBe(100.5);
    });

    it('should support atomic update of lotSizeRemaining', async () => {
      const order = createTestOrder({
        status: OrderStatus.OPEN,
        lotSize: 1.0,
        lotSizeRemaining: 1.0,
      });
      const created = await orderRepository.create(order);

      // Partial close: reduce by 0.3
      const updated = await orderRepository.updateOne(
        { _id: created._id! },
        { $inc: { lotSizeRemaining: -0.3 } as any },
      );

      expect(updated).toBe(true);
      const found = await orderRepository.findById(created._id!.toString());
      expect(found?.lotSizeRemaining).toBe(0.7);
    });

    it('should support atomic update of pnl.pnl', async () => {
      const order = createTestOrder({
        status: OrderStatus.OPEN,
        pnl: { pnl: 50.0 },
      });
      const created = await orderRepository.create(order);

      // Additional profit: 25.5
      const updated = await orderRepository.updateOne(
        { _id: created._id! },
        { $inc: { 'pnl.pnl': 25.5 } as any },
      );

      expect(updated).toBe(true);
      const found = await orderRepository.findById(created._id!.toString());
      expect(found?.pnl?.pnl).toBe(75.5);
    });
  });
});
