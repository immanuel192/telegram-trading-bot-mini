import {
  suiteName,
  setupDb,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { mongoDb } from '@dal';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';
import {
  Order,
  OrderStatus,
  OrderSide,
  OrderExecutionType,
  TradeType,
} from '@dal/models';
import { TelegramMessage } from '@dal/models';
import { ServerContext, startServer, stopServer } from '../../../src/server';
import { withMongoTransaction } from '@dal';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext | null = null;

  beforeAll(async () => {
    // await setupDb();
    serverContext = await startServer();
  });

  beforeEach(async () => {
    await cleanupDb(mongoDb, [
      COLLECTIONS.TELEGRAM_MESSAGES,
      COLLECTIONS.ORDERS,
    ]);
  });

  afterAll(async () => {
    if (serverContext) {
      await stopServer(serverContext);
      serverContext = null;
    }
  });

  describe('findActiveOrdersByMessageContext', () => {
    const channelId = 'channel-1';
    const msgIdCurrent = 100;
    const msgIdQuoted = 90;
    const msgIdTop = 80;
    const msgIdPrev = 70;

    async function createMessage(msg: Partial<TelegramMessage>) {
      const col = mongoDb.collection(COLLECTIONS.TELEGRAM_MESSAGES);
      await col.insertOne({
        channelId,
        sentAt: new Date(),
        receivedAt: new Date(),
        message: 'test message',
        ...msg,
      });
    }

    async function createOrder(order: Partial<Order>) {
      const { orderRepository } = serverContext!.container;
      await orderRepository.create({
        accountId: 'test-account',
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.FUTURE,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        createdAt: new Date(),
        history: [],
        ...order,
      } as any);
    }

    it('should find order linked to current message first (Priority 1)', async () => {
      const { orderService } = serverContext.container;

      await createMessage({
        messageId: msgIdCurrent,
        prevMessage: { id: msgIdPrev, message: 'prev' },
      });
      await createOrder({
        orderId: 'O-CURR',
        messageId: msgIdCurrent,
        channelId,
      });
      await createOrder({ orderId: 'O-PREV', messageId: msgIdPrev, channelId });

      const results = await orderService.findActiveOrdersByMessageContext(
        msgIdCurrent,
        channelId,
      );

      expect(results).toHaveLength(1);
      expect(results[0].orderId).toBe('O-CURR');
    });

    it('should find order linked to quoted message if current message has none (Priority 2)', async () => {
      const { orderService } = serverContext.container;

      await createMessage({
        messageId: msgIdCurrent,
        quotedMessage: { id: msgIdQuoted, message: 'quoted', hasMedia: false },
        prevMessage: { id: msgIdPrev, message: 'prev' },
      });
      await createOrder({
        orderId: 'O-QUOTED',
        messageId: msgIdQuoted,
        channelId,
      });
      await createOrder({ orderId: 'O-PREV', messageId: msgIdPrev, channelId });

      const results = await orderService.findActiveOrdersByMessageContext(
        msgIdCurrent,
        channelId,
      );

      expect(results).toHaveLength(1);
      expect(results[0].orderId).toBe('O-QUOTED');
    });

    it('should find order linked to quoted first message if others have none (Priority 3)', async () => {
      const { orderService } = serverContext.container;

      await createMessage({
        messageId: msgIdCurrent,
        quotedMessage: {
          id: msgIdQuoted,
          message: 'quoted',
          hasMedia: false,
          replyToTopId: msgIdTop,
        },
        prevMessage: { id: msgIdPrev, message: 'prev' },
      });
      await createOrder({ orderId: 'O-TOP', messageId: msgIdTop, channelId });
      await createOrder({ orderId: 'O-PREV', messageId: msgIdPrev, channelId });

      const results = await orderService.findActiveOrdersByMessageContext(
        msgIdCurrent,
        channelId,
      );

      expect(results).toHaveLength(1);
      expect(results[0].orderId).toBe('O-TOP');
    });

    it('should find order linked to previous message as last resort (Priority 4)', async () => {
      const { orderService } = serverContext.container;

      await createMessage({
        messageId: msgIdCurrent,
        prevMessage: { id: msgIdPrev, message: 'prev' },
      });
      await createOrder({ orderId: 'O-PREV', messageId: msgIdPrev, channelId });

      const results = await orderService.findActiveOrdersByMessageContext(
        msgIdCurrent,
        channelId,
      );

      expect(results).toHaveLength(1);
      expect(results[0].orderId).toBe('O-PREV');
    });

    it('should fetch the linked order chain for the primary record', async () => {
      const { orderService } = serverContext.container;

      await createMessage({ messageId: msgIdCurrent });
      // Signal order
      await createOrder({
        orderId: 'SIGNAL-1',
        messageId: msgIdCurrent,
        channelId,
        linkedOrders: ['DCA-1', 'DCA-2'],
      });
      // DCA orders (linked)
      await createOrder({
        orderId: 'DCA-1',
        messageId: 101,
        channelId,
        linkedOrders: ['SIGNAL-1'],
      });
      await createOrder({
        orderId: 'DCA-2',
        messageId: 102,
        channelId,
        linkedOrders: ['SIGNAL-1'],
      });

      const results = await orderService.findActiveOrdersByMessageContext(
        msgIdCurrent,
        channelId,
      );

      expect(results).toHaveLength(3);
      const ids = results.map((r) => r.orderId);
      expect(ids).toContain('SIGNAL-1');
      expect(ids).toContain('DCA-1');
      expect(ids).toContain('DCA-2');
      // The first element should be the primary signal
      expect(results[0].orderId).toBe('SIGNAL-1');
    });

    it('should strip history by default', async () => {
      const { orderService } = serverContext.container;

      await createMessage({ messageId: msgIdCurrent });
      await createOrder({
        orderId: 'O-1',
        messageId: msgIdCurrent,
        channelId,
        history: [
          {
            status: 'intend',
            service: 'test',
            ts: new Date(),
            traceToken: 't',
            messageId: 1,
            channelId: 'c',
          },
        ] as any,
      });

      const results = await orderService.findActiveOrdersByMessageContext(
        msgIdCurrent,
        channelId,
      );

      expect(results[0].history).toBeUndefined();
    });

    it('should preserve history if includeHistory is true', async () => {
      const { orderService } = serverContext.container;

      await createMessage({ messageId: msgIdCurrent });
      await createOrder({
        orderId: 'O-1',
        messageId: msgIdCurrent,
        channelId,
        history: [
          {
            status: 'intend',
            service: 'test',
            ts: new Date(),
            traceToken: 't',
            messageId: 1,
            channelId: 'c',
          },
        ] as any,
      });

      const results = await orderService.findActiveOrdersByMessageContext(
        msgIdCurrent,
        channelId,
        true,
      );

      expect(results[0].history).toBeDefined();
      expect(results[0].history).toHaveLength(1);
    });

    it('should exclude CLOSED orders from results', async () => {
      const { orderService } = serverContext.container;

      await createMessage({ messageId: msgIdCurrent });
      // Create one PENDING order and one CLOSED order
      await createOrder({
        orderId: 'O-PENDING',
        messageId: msgIdCurrent,
        channelId,
        status: OrderStatus.PENDING,
      });
      await createOrder({
        orderId: 'O-CLOSED',
        messageId: msgIdCurrent,
        channelId,
        status: OrderStatus.CLOSED,
      });

      const results = await orderService.findActiveOrdersByMessageContext(
        msgIdCurrent,
        channelId,
      );

      // Should only return the PENDING order
      expect(results).toHaveLength(1);
      expect(results[0].orderId).toBe('O-PENDING');
      expect(results[0].status).toBe(OrderStatus.PENDING);
    });

    it('should exclude CANCELED orders from results', async () => {
      const { orderService } = serverContext.container;

      await createMessage({ messageId: msgIdCurrent });
      // Create one OPEN order and one CANCELED order
      await createOrder({
        orderId: 'O-OPEN',
        messageId: msgIdCurrent,
        channelId,
        status: OrderStatus.OPEN,
      });
      await createOrder({
        orderId: 'O-CANCELED',
        messageId: msgIdCurrent,
        channelId,
        status: OrderStatus.CANCELED,
      });

      const results = await orderService.findActiveOrdersByMessageContext(
        msgIdCurrent,
        channelId,
      );

      // Should only return the OPEN order
      expect(results).toHaveLength(1);
      expect(results[0].orderId).toBe('O-OPEN');
      expect(results[0].status).toBe(OrderStatus.OPEN);
    });

    it('should only return PENDING and OPEN orders', async () => {
      const { orderService } = serverContext.container;

      await createMessage({ messageId: msgIdCurrent });
      // Create primary order (PENDING) with linked orders
      await createOrder({
        orderId: 'O-PRIMARY',
        messageId: msgIdCurrent,
        channelId,
        status: OrderStatus.PENDING,
        linkedOrders: ['O-LINKED-OPEN', 'O-LINKED-CLOSED'],
      });
      // Linked order that is OPEN (should be included)
      await createOrder({
        orderId: 'O-LINKED-OPEN',
        messageId: 101,
        channelId,
        status: OrderStatus.OPEN,
        linkedOrders: ['O-PRIMARY'],
      });
      // Linked order that is CLOSED (should be excluded)
      await createOrder({
        orderId: 'O-LINKED-CLOSED',
        messageId: 102,
        channelId,
        status: OrderStatus.CLOSED,
        linkedOrders: ['O-PRIMARY'],
      });
      // Another order with same messageId but CANCELED (not linked, should be ignored)
      await createOrder({
        orderId: 'O-CANCELED',
        messageId: msgIdCurrent,
        channelId,
        status: OrderStatus.CANCELED,
      });

      const results = await orderService.findActiveOrdersByMessageContext(
        msgIdCurrent,
        channelId,
      );

      // Should return primary order + OPEN linked order (not CLOSED or CANCELED)
      expect(results).toHaveLength(2);
      const orderIds = results.map((r) => r.orderId);
      expect(orderIds).toContain('O-PRIMARY');
      expect(orderIds).toContain('O-LINKED-OPEN');
      expect(orderIds).not.toContain('O-LINKED-CLOSED');
      expect(orderIds).not.toContain('O-CANCELED');
    });

    it('should exclude CLOSED linked orders from chain', async () => {
      const { orderService } = serverContext.container;

      await createMessage({ messageId: msgIdCurrent });
      // Signal order (OPEN)
      await createOrder({
        orderId: 'SIGNAL-1',
        messageId: msgIdCurrent,
        channelId,
        status: OrderStatus.OPEN,
        linkedOrders: ['DCA-1', 'DCA-2'],
      });
      // DCA-1 is OPEN
      await createOrder({
        orderId: 'DCA-1',
        messageId: 101,
        channelId,
        status: OrderStatus.OPEN,
        linkedOrders: ['SIGNAL-1'],
      });
      // DCA-2 is CLOSED (should be excluded)
      await createOrder({
        orderId: 'DCA-2',
        messageId: 102,
        channelId,
        status: OrderStatus.CLOSED,
        linkedOrders: ['SIGNAL-1'],
      });

      const results = await orderService.findActiveOrdersByMessageContext(
        msgIdCurrent,
        channelId,
      );

      // Should only return SIGNAL-1 and DCA-1 (not DCA-2)
      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.orderId);
      expect(ids).toContain('SIGNAL-1');
      expect(ids).toContain('DCA-1');
      expect(ids).not.toContain('DCA-2');
    });
  });

  describe('createOrder with Transaction Support', () => {
    it('should create order within a transaction', async () => {
      const { orderService } = serverContext!.container;

      let orderId: string | undefined;

      await withMongoTransaction(async (session) => {
        const result = await orderService.createOrder(
          {
            orderId: 'TX-ORDER-1',
            accountId: 'test-account',
            messageId: 100,
            channelId: 'channel-1',
            symbol: 'BTCUSD',
            side: OrderSide.LONG,
            executionType: OrderExecutionType.market,
            tradeType: TradeType.FUTURE,
            lotSize: 0.1,
            traceToken: 'trace-1',
            command: CommandEnum.LONG,
          },
          session,
        );

        orderId = result.orderId;
        expect(orderId).toBe('TX-ORDER-1');
      });

      // Verify order was committed
      const { orderRepository } = serverContext!.container;
      const found = await orderRepository.findOne({ orderId } as any);
      expect(found).toBeDefined();
      expect(found?.orderId).toBe('TX-ORDER-1');
    });

    it('should rollback order creation on transaction failure', async () => {
      const { orderService } = serverContext!.container;

      try {
        await withMongoTransaction(async (session) => {
          await orderService.createOrder(
            {
              orderId: 'TX-ROLLBACK-1',
              accountId: 'test-account',
              messageId: 200,
              channelId: 'channel-1',
              symbol: 'ETHUSD',
              side: OrderSide.SHORT,
              executionType: OrderExecutionType.limit,
              tradeType: TradeType.FUTURE,
              lotSize: 0.5,
              traceToken: 'trace-2',
              command: CommandEnum.SHORT,
            },
            session,
          );

          // Force transaction to fail
          throw new Error('Simulated transaction error');
        });
      } catch (error) {
        // Expected error
      }

      // Verify order was NOT committed
      const { orderRepository } = serverContext!.container;
      const found = await orderRepository.findOne({
        orderId: 'TX-ROLLBACK-1',
      } as any);
      expect(found).toBeNull();
    });

    it('should create linked orders atomically within transaction', async () => {
      const { orderService, orderRepository } = serverContext!.container;

      await withMongoTransaction(async (session) => {
        // Create first order
        await orderService.createOrder(
          {
            orderId: 'SIGNAL-TX-1',
            accountId: 'test-account',
            messageId: 300,
            channelId: 'channel-1',
            symbol: 'BTCUSD',
            side: OrderSide.LONG,
            executionType: OrderExecutionType.market,
            tradeType: TradeType.FUTURE,
            lotSize: 0.1,
            traceToken: 'trace-3',
            command: CommandEnum.LONG,
          },
          session,
        );

        // Create linked DCA order
        await orderService.createOrder(
          {
            orderId: 'DCA-TX-1',
            accountId: 'test-account',
            messageId: 301,
            channelId: 'channel-1',
            symbol: 'BTCUSD',
            side: OrderSide.LONG,
            executionType: OrderExecutionType.limit,
            tradeType: TradeType.FUTURE,
            lotSize: 0.1,
            isLinkedWithPrevious: true,
            traceToken: 'trace-4',
            command: CommandEnum.LONG,
          },
          session,
        );
      });

      // Verify both orders exist and are linked
      const signal = await orderRepository.findOne({
        orderId: 'SIGNAL-TX-1',
      } as any);
      const dca = await orderRepository.findOne({ orderId: 'DCA-TX-1' } as any);

      expect(signal).toBeDefined();
      expect(dca).toBeDefined();
      expect(signal?.linkedOrders).toContain('DCA-TX-1');
      expect(dca?.linkedOrders).toContain('SIGNAL-TX-1');
    });

    it('should rollback linked orders if transaction fails', async () => {
      const { orderService, orderRepository } = serverContext!.container;

      try {
        await withMongoTransaction(async (session) => {
          // Create first order
          await orderService.createOrder(
            {
              orderId: 'SIGNAL-FAIL-1',
              accountId: 'test-account',
              messageId: 400,
              channelId: 'channel-1',
              symbol: 'BTCUSD',
              side: OrderSide.LONG,
              executionType: OrderExecutionType.market,
              tradeType: TradeType.FUTURE,
              lotSize: 0.1,
              traceToken: 'trace-5',
              command: CommandEnum.LONG,
            },
            session,
          );

          // Create linked DCA order
          await orderService.createOrder(
            {
              orderId: 'DCA-FAIL-1',
              accountId: 'test-account',
              messageId: 401,
              channelId: 'channel-1',
              symbol: 'BTCUSD',
              side: OrderSide.LONG,
              executionType: OrderExecutionType.limit,
              tradeType: TradeType.FUTURE,
              lotSize: 0.1,
              isLinkedWithPrevious: true,
              traceToken: 'trace-6',
              command: CommandEnum.LONG,
            },
            session,
          );

          // Force transaction to fail
          throw new Error('Simulated error after linked orders');
        });
      } catch (error) {
        // Expected error
      }

      // Verify NEITHER order was committed
      const signal = await orderRepository.findOne({
        orderId: 'SIGNAL-FAIL-1',
      } as any);
      const dca = await orderRepository.findOne({
        orderId: 'DCA-FAIL-1',
      } as any);

      expect(signal).toBeNull();
      expect(dca).toBeNull();
    });
  });

  describe('findOrderByMessageId', () => {
    const channelId = 'channel-1';
    const messageId = 100;
    const accountId = 'test-account';

    async function createOrder(order: Partial<Order>) {
      const { orderRepository } = serverContext!.container;
      await orderRepository.create({
        accountId: 'test-account',
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.FUTURE,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        createdAt: new Date(),
        history: [],
        ...order,
      } as any);
    }

    it('should find PENDING order by messageId and channelId', async () => {
      const { orderService } = serverContext!.container;

      await createOrder({
        orderId: 'O-PENDING',
        messageId,
        channelId,
        status: OrderStatus.PENDING,
      });

      const result = await orderService.findOrderByMessageId(
        messageId,
        channelId,
        accountId,
      );

      expect(result).toBeDefined();
      expect(result?.orderId).toBe('O-PENDING');
      expect(result?.status).toBe(OrderStatus.PENDING);
    });

    it('should find OPEN order by messageId and channelId', async () => {
      const { orderService } = serverContext!.container;

      await createOrder({
        orderId: 'O-OPEN',
        messageId,
        channelId,
        status: OrderStatus.OPEN,
      });

      const result = await orderService.findOrderByMessageId(
        messageId,
        channelId,
        accountId,
      );

      expect(result).toBeDefined();
      expect(result?.orderId).toBe('O-OPEN');
      expect(result?.status).toBe(OrderStatus.OPEN);
    });

    it('should return null if no active order exists', async () => {
      const { orderService } = serverContext!.container;

      const result = await orderService.findOrderByMessageId(
        messageId,
        channelId,
        accountId,
      );

      expect(result).toBeNull();
    });

    it('should NOT return CLOSED orders', async () => {
      const { orderService } = serverContext!.container;

      await createOrder({
        orderId: 'O-CLOSED',
        messageId,
        channelId,
        status: OrderStatus.CLOSED,
      });

      const result = await orderService.findOrderByMessageId(
        messageId,
        channelId,
        accountId,
      );

      expect(result).toBeNull();
    });

    it('should NOT return CANCELED orders', async () => {
      const { orderService } = serverContext!.container;

      await createOrder({
        orderId: 'O-CANCELED',
        messageId,
        channelId,
        status: OrderStatus.CANCELED,
      });

      const result = await orderService.findOrderByMessageId(
        messageId,
        channelId,
        accountId,
      );

      expect(result).toBeNull();
    });

    it('should return first match when multiple active orders exist for same message', async () => {
      const { orderService } = serverContext!.container;

      // Create two active orders with same messageId (edge case)
      await createOrder({
        orderId: 'O-FIRST',
        messageId,
        channelId,
        status: OrderStatus.PENDING,
      });
      await createOrder({
        orderId: 'O-SECOND',
        messageId,
        channelId,
        status: OrderStatus.OPEN,
      });

      const result = await orderService.findOrderByMessageId(
        messageId,
        channelId,
        accountId,
      );

      expect(result).toBeDefined();
      // Should return one of them (MongoDB findOne returns first match)
      expect(['O-FIRST', 'O-SECOND']).toContain(result?.orderId);
    });

    it('should NOT return orders from different channel', async () => {
      const { orderService } = serverContext!.container;

      await createOrder({
        orderId: 'O-OTHER-CHANNEL',
        messageId,
        channelId: 'channel-2',
        status: OrderStatus.OPEN,
      });

      const result = await orderService.findOrderByMessageId(
        messageId,
        channelId,
        accountId,
      );

      expect(result).toBeNull();
    });

    it('should NOT return orders from different message', async () => {
      const { orderService } = serverContext!.container;

      await createOrder({
        orderId: 'O-OTHER-MESSAGE',
        messageId: 999,
        channelId,
        status: OrderStatus.OPEN,
      });

      const result = await orderService.findOrderByMessageId(
        messageId,
        channelId,
        accountId,
      );

      expect(result).toBeNull();
    });

    it('should NOT return orders from different account', async () => {
      const { orderService } = serverContext!.container;

      await createOrder({
        orderId: 'O-OTHER-ACCOUNT',
        accountId: 'different-account',
        messageId,
        channelId,
        status: OrderStatus.OPEN,
      });

      const result = await orderService.findOrderByMessageId(
        messageId,
        channelId,
        accountId, // Looking for 'test-account', not 'different-account'
      );

      expect(result).toBeNull();
    });
  });

  describe('Message Edit Handling', () => {
    const channelId = 'test-channel';
    const messageId = 12345;
    const accountId = 'test-account';

    async function createOrder(overrides: Partial<Order> = {}): Promise<Order> {
      const col = mongoDb.collection<Order>(COLLECTIONS.ORDERS);
      const order: Order = {
        orderId: `order-${Date.now()}`,
        accountId,
        messageId,
        channelId,
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.FUTURE,
        createdAt: new Date(),
        symbol: 'XAUUSD',
        lotSize: 0.01,
        history: [],
        ...overrides,
      } as Order;

      await col.insertOne(order);
      return order;
    }

    describe('addEditAuditTrail', () => {
      it('should add MESSAGE_EDITED history entry to order', async () => {
        const order = await createOrder();
        const orderService = serverContext!.container.orderService;

        await orderService.addEditAuditTrail(
          order.orderId,
          'CLOSE_AND_RECREATE',
          'Side changed from LONG to SHORT',
        );

        // Verify history was added
        const col = mongoDb.collection<Order>(COLLECTIONS.ORDERS);
        const updated = await col.findOne({ orderId: order.orderId });

        expect(updated).toBeDefined();
        expect(updated!.history).toHaveLength(1);
        expect(updated!.history[0]).toMatchObject({
          status: 'message_edited',
          service: 'trade-manager',
          info: {
            action: 'CLOSE_AND_RECREATE',
            reason: 'Side changed from LONG to SHORT',
          },
        });
        expect(updated!.history[0]._id).toBeDefined();
        expect(updated!.history[0].ts).toBeInstanceOf(Date);
      });

      it('should work within a transaction', async () => {
        const order = await createOrder();
        const orderService = serverContext!.container.orderService;

        await withMongoTransaction(async (session) => {
          await orderService.addEditAuditTrail(
            order.orderId,
            'UPDATE_TP_SL',
            'TP/SL values changed',
            session,
          );
        });

        // Verify history was added
        const col = mongoDb.collection<Order>(COLLECTIONS.ORDERS);
        const updated = await col.findOne({ orderId: order.orderId });

        expect(updated!.history).toHaveLength(1);
        expect(updated!.history[0].info).toEqual({
          action: 'UPDATE_TP_SL',
          reason: 'TP/SL values changed',
        });
      });
    });
  });
});
