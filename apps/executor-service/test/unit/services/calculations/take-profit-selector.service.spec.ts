import { TakeProfitSelectorService } from '../../../../src/services/calculations/take-profit-selector.service';
import {
  LoggerInstance,
  CommandEnum,
} from '@telegram-trading-bot-mini/shared/utils';
import { Account, OrderSide } from '@dal';

describe('TakeProfitSelectorService', () => {
  let service: TakeProfitSelectorService;
  let mockLogger: jest.Mocked<LoggerInstance>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;
    service = new TakeProfitSelectorService(mockLogger);
  });

  describe('normaliseTakeProfits', () => {
    test('should sort correctly for LONG (natural/ascending)', async () => {
      const takeProfits = [{ price: 4094 }, { price: 4111 }, { price: 4150 }];
      const result = await service.normaliseTakeProfits(
        takeProfits,
        CommandEnum.LONG,
      );
      expect(result).toEqual([
        { price: 4094 },
        { price: 4111 },
        { price: 4150 },
      ]);
    });

    test('should sort correctly for SHORT (natural/descending)', async () => {
      const takeProfits = [{ price: 2600 }, { price: 2550 }, { price: 2500 }];
      const result = await service.normaliseTakeProfits(
        takeProfits,
        CommandEnum.SHORT,
      );
      expect(result).toEqual([
        { price: 2600 },
        { price: 2550 },
        { price: 2500 },
      ]);
    });

    test('should respect side over command', async () => {
      const takeProfits = [{ price: 4094 }, { price: 4111 }];
      // Command LONG but side SHORT -> descending (least profitable first)
      const result = await service.normaliseTakeProfits(
        takeProfits,
        CommandEnum.LONG,
        OrderSide.SHORT,
      );
      expect(result).toEqual([{ price: 4111 }, { price: 4094 }]);
    });

    test('should filter out entries without price', async () => {
      const takeProfits = [{ price: 4094 }, { pips: 50 }, { price: 4111 }];
      const result = await service.normaliseTakeProfits(
        takeProfits,
        CommandEnum.LONG,
      );
      expect(result).toEqual([{ price: 4094 }, { price: 4111 }]);
    });

    test('should return empty array for undefined or empty input', async () => {
      expect(
        await service.normaliseTakeProfits(undefined, CommandEnum.LONG),
      ).toEqual([]);
      expect(await service.normaliseTakeProfits([], CommandEnum.LONG)).toEqual(
        [],
      );
    });
  });

  describe('selectTakeProfit', () => {
    describe('Returns single TP when only one available', () => {
      test('should return single TP', async () => {
        const normalisedTPs = [{ price: 4094 }];
        const account = {
          accountId: 'test-acc',
          configs: { takeProfitIndex: 0 },
        } as Account;

        const result = await service.selectTakeProfit(normalisedTPs, account);

        expect(result).toEqual([{ price: 4094 }]);
        expect(result?.length).toBe(1);
      });
    });

    describe('Returns two TPs when multiple available', () => {
      test('should return two TPs for LONG order', async () => {
        const normalisedTPs = [{ price: 4111 }, { price: 4094 }];
        const account = {
          accountId: 'test-acc',
          configs: { takeProfitIndex: 0 },
        } as Account;

        const result = await service.selectTakeProfit(normalisedTPs, account);

        expect(result).toEqual([
          { price: 4111 }, // Index 0 (highest)
          { price: 4102.5 }, // Average of 4111 and 4094
        ]);
        expect(result?.length).toBe(2);
      });

      test('should return two TPs for SHORT order', async () => {
        const normalisedTPs = [
          { price: 2500 },
          { price: 2550 },
          { price: 2600 },
        ];
        const account = {
          accountId: 'test-acc',
          configs: { takeProfitIndex: 0 },
        } as Account;

        const result = await service.selectTakeProfit(normalisedTPs, account);

        expect(result).toEqual([
          { price: 2500 }, // Index 0 (lowest)
          { price: 2525 }, // Average of 2500 and 2550
        ]);
        expect(result?.length).toBe(2);
      });
    });

    describe('Returns single TP when index + 1 out of bounds', () => {
      test('should return only one TP when takeProfitIndex = 1 and only 2 TPs available', async () => {
        const normalisedTPs = [{ price: 4111 }, { price: 4094 }];
        const account = {
          accountId: 'test-acc',
          configs: { takeProfitIndex: 1 },
        } as Account;

        const result = await service.selectTakeProfit(normalisedTPs, account);

        expect(result).toEqual([{ price: 4094 }]);
        expect(result?.length).toBe(1);
      });
    });

    describe('Respects forceNoTakeProfit flag', () => {
      test('should return undefined when forceNoTakeProfit is true', async () => {
        const normalisedTPs = [{ price: 4111 }, { price: 4094 }];
        const account = {
          accountId: 'test-acc',
          configs: { forceNoTakeProfit: true, takeProfitIndex: 0 },
        } as Account;

        const result = await service.selectTakeProfit(normalisedTPs, account);

        expect(result).toBeUndefined();
        expect(mockLogger.info).toHaveBeenCalledWith(
          { accountId: 'test-acc' },
          'forceNoTakeProfit is enabled, ignoring all takeProfits',
        );
      });
    });

    describe('Edge cases', () => {
      test('should return undefined when no normalisedTPs provided', async () => {
        const account = {
          accountId: 'test-acc',
          configs: { takeProfitIndex: 0 },
        } as Account;

        const result = await service.selectTakeProfit(undefined, account);
        expect(result).toBeUndefined();
      });

      test('should use last TP when takeProfitIndex out of range', async () => {
        const normalisedTPs = [{ price: 4111 }, { price: 4094 }];
        const account = {
          accountId: 'test-acc',
          configs: { takeProfitIndex: 5 },
        } as Account;

        const result = await service.selectTakeProfit(normalisedTPs, account);

        // Sorted: [4111, 4094]
        // Index 5 is out of range, should use last (4094)
        expect(result).toEqual([{ price: 4094 }]);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          {
            accountId: 'test-acc',
            takeProfitIndex: 5,
            availableTPs: 2,
          },
          'takeProfitIndex out of range, using last available TP',
        );
      });

      test('should default to takeProfitIndex = 0 when not specified', async () => {
        const normalisedTPs = [
          { price: 4150 },
          { price: 4111 },
          { price: 4094 },
        ];
        const account = { accountId: 'test-acc', configs: {} } as Account;

        const result = await service.selectTakeProfit(normalisedTPs, account);

        // Should use index 0 by default
        expect(result).toEqual([
          { price: 4150 }, // Index 0
          { price: 4130.5 }, // Average of 4150 and 4111
        ]);
      });
    });

    describe('Logging', () => {
      test('should log debug info with both TPs when 2 returned', async () => {
        const normalisedTPs = [{ price: 4111 }, { price: 4094 }];
        const account = {
          accountId: 'test-acc',
          configs: { takeProfitIndex: 0 },
        } as Account;

        await service.selectTakeProfit(normalisedTPs, account);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            accountId: 'test-acc',
            takeProfitIndex: 0,
            selectedTP: { price: 4111 },
            nextTP: { price: 4094 },
            returnedCount: 2,
          }),
          'Selected 2 take profit level(s) based on config',
        );
      });
    });
  });
});
