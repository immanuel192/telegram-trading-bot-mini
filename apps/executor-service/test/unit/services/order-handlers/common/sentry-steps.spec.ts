import {
  SentryStartStep,
  SentryCommitStep,
} from '../../../../../src/services/order-handlers/common';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';
import { Sentry } from '../../../../../src/sentry';

jest.mock('../../../../../src/sentry', () => ({
  Sentry: {
    metrics: {
      distribution: jest.fn(),
    },
  },
}));

describe('Sentry Steps', () => {
  let context: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    context = {
      payload: {
        orderId: 'order-1',
        command: CommandEnum.LONG,
        traceToken: 'trace-1',
        channelId: 'chan-1',
        accountId: 'acc-1',
      },
      state: {},
      logger: {
        debug: jest.fn(),
      },
    };
  });

  describe('SentryStartStep', () => {
    it('should record start time in context state', async () => {
      const startTime = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(startTime);

      await SentryStartStep.execute(context, next);

      expect(context.state.sentryStartTime).toBe(startTime);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('SentryCommitStep', () => {
    it('should emit duration metric if sentryStartTime is present', async () => {
      const startTime = 1000;
      const endTime = 1500;
      context.state.sentryStartTime = startTime;

      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(endTime);

      await SentryCommitStep.execute(context, next);

      expect(Sentry.metrics.distribution).toHaveBeenCalledWith(
        'order.execution.duration',
        500,
        {
          unit: 'millisecond',
          attributes: {
            command: CommandEnum.LONG,
            channelId: 'chan-1',
            accountId: 'acc-1',
            success: 'true',
          },
        },
      );
      expect(context.logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          duration: 500,
          success: true,
        }),
        'Order execution duration metric emitted',
      );
      expect(next).toHaveBeenCalled();

      nowSpy.mockRestore();
    });

    it('should emit success: false if error is present', async () => {
      context.state.sentryStartTime = 1000;
      context.state.error = new Error('Test error');
      jest.spyOn(Date, 'now').mockReturnValue(1100);

      await SentryCommitStep.execute(context, next);

      expect(Sentry.metrics.distribution).toHaveBeenCalledWith(
        'order.execution.duration',
        100,
        expect.objectContaining({
          attributes: expect.objectContaining({
            success: 'false',
          }),
        }),
      );
    });

    it('should skip metric if sentryStartTime is missing', async () => {
      await SentryCommitStep.execute(context, next);

      expect(Sentry.metrics.distribution).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should not throw if metric emission fails', async () => {
      context.state.sentryStartTime = 1000;
      (Sentry.metrics.distribution as jest.Mock).mockImplementation(() => {
        throw new Error('Sentry error');
      });

      await expect(
        SentryCommitStep.execute(context, next),
      ).resolves.not.toThrow();
      expect(context.logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to emit execution duration metric (non-blocking)',
      );
      expect(next).toHaveBeenCalled();
    });
  });
});
