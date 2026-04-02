import { TypeCompiler } from '@sinclair/typebox/compiler';
import {
  ExecuteOrderResultPayloadSchema,
  ExecuteOrderResultType,
} from '../../src/interfaces/messages/execute-order-result-payload';

describe('ExecuteOrderResultPayloadSchema', () => {
  const compiler = TypeCompiler.Compile(ExecuteOrderResultPayloadSchema);

  it('should validate a correct payload with all new fields', () => {
    const payload = {
      orderId: 'order-123',
      accountId: 'account-123',
      traceToken: 'trace-123',
      messageId: 100,
      channelId: 'channel-123',
      success: true,
      symbol: 'BTC/USDT',
      type: ExecuteOrderResultType.OrderOpen,
      side: 'LONG',
      lotSize: 0.1,
      lotSizeRemaining: 0.1,
      takeProfits: [{ price: 50000 }, { price: 51000 }],
      executedLots: 0.1,
      executedAt: Date.now(),
    };

    const isValid = compiler.Check(payload);
    expect(isValid).toBe(true);
  });

  it('should validate payload with only required fields (success/failure scenarios)', () => {
    const minPayload = {
      orderId: 'order-123',
      accountId: 'account-123',
      traceToken: 'trace-123',
      messageId: 100,
      channelId: 'channel-123',
      success: true,
      type: ExecuteOrderResultType.OTHERS,
    };

    const isValid = compiler.Check(minPayload);
    expect(isValid).toBe(true);
  });

  it('should reject payload with missing core required fields', () => {
    const payload = {
      orderId: 'order-123',
      accountId: 'account-123',
      // missing traceToken, messageId, channelId, success, type
    };

    const isValid = compiler.Check(payload);
    expect(isValid).toBe(false);

    const errors = [...compiler.Errors(payload)];
    expect(errors.some((e) => e.path === '/traceToken')).toBe(true);
    expect(errors.some((e) => e.path === '/messageId')).toBe(true);
    expect(errors.some((e) => e.path === '/channelId')).toBe(true);
    expect(errors.some((e) => e.path === '/success')).toBe(true);
    expect(errors.some((e) => e.path === '/type')).toBe(true);
  });

  it('should validate with optional error fields', () => {
    const payload = {
      orderId: 'order-123',
      accountId: 'account-123',
      traceToken: 'trace-123',
      messageId: 100,
      channelId: 'channel-123',
      success: false,
      symbol: 'BTC/USDT',
      type: ExecuteOrderResultType.OTHERS,
      side: 'LONG',
      lotSize: 0.1,
      lotSizeRemaining: 0.1,
      takeProfits: [],
      error: 'Execution failed',
      errorCode: 'INSUFFICIENT_FUNDS',
    };

    const isValid = compiler.Check(payload);
    expect(isValid).toBe(true);
  });

  it('should reject invalid ExecuteOrderResultType', () => {
    const payload = {
      orderId: 'order-123',
      accountId: 'account-123',
      traceToken: 'trace-123',
      messageId: 100,
      channelId: 'channel-123',
      success: true,
      symbol: 'BTC/USDT',
      type: 99, // Invalid enum value
      side: 'LONG',
      lotSize: 0.1,
      lotSizeRemaining: 0.1,
      takeProfits: [],
    };

    const isValid = compiler.Check(payload);
    expect(isValid).toBe(false);
  });
});
