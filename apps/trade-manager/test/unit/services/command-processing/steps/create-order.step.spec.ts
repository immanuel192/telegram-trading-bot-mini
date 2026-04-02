import { OrderCreationStep } from '../../../../../src/services/command-processing/steps/create-order.step';
import {
  fakeLogger,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';
import { OrderSide, OrderExecutionType, TradeType } from '@dal';

describe(suiteName(__filename), () => {
  let step: OrderCreationStep;
  let mockOrderService: any;
  let mockNext: jest.Mock;
  let mockContext: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderService = {
      createOrder: jest.fn(),
    };
    mockNext = jest.fn();

    step = new OrderCreationStep(mockOrderService, fakeLogger);

    mockContext = {
      state: {
        command: {
          command: CommandEnum.LONG,
          extraction: { isLinkedWithPrevious: false },
        },
        account: { accountId: 'acc-1' },
        orderCreationPayload: {
          orderId: 'order-123',
          symbol: 'BTCUSDT',
          isImmediate: true,
          entry: 50000,
          lotSize: 0.1,
        },
        orderCreated: false,
      },
      messageContext: {
        messageId: 100,
        channelId: 'chan-1',
        traceToken: 'trace-123',
      },
    };
  });

  it('should skip if no orderCreationPayload', async () => {
    mockContext.state.orderCreationPayload = undefined;
    await step.execute(mockContext, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(mockOrderService.createOrder).not.toHaveBeenCalled();
  });

  it('should call orderService.createOrder and update state', async () => {
    mockOrderService.createOrder.mockResolvedValue({
      linkedOrderIds: ['old-1'],
    });

    await step.execute(mockContext, mockNext);

    expect(mockOrderService.createOrder).toHaveBeenCalledWith(
      {
        orderId: 'order-123',
        accountId: 'acc-1',
        messageId: 100,
        channelId: 'chan-1',
        symbol: 'BTCUSDT',
        side: OrderSide.LONG,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.FUTURE,
        lotSize: 0.1,
        isLinkedWithPrevious: false,
        entry: 50000,
        traceToken: 'trace-123',
        command: CommandEnum.LONG,
      },
      undefined,
    );

    expect(mockContext.state.orderCreated).toBe(true);
    expect(fakeLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-123' }),
      'Order created for LONG/SHORT command',
    );
    expect(mockNext).toHaveBeenCalled();
  });

  it('should handle SHORT command and limit executionType', async () => {
    mockContext.state.command.command = CommandEnum.SHORT;
    mockContext.state.orderCreationPayload.isImmediate = false;
    mockOrderService.createOrder.mockResolvedValue({ linkedOrderIds: [] });

    await step.execute(mockContext, mockNext);

    expect(mockOrderService.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        side: OrderSide.SHORT,
        executionType: OrderExecutionType.limit,
      }),
      undefined,
    );
  });
});
