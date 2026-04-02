import { OperationTimeCheckerService } from '../../../../src/services/calculations/operation-time-checker.service';
import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';

describe('OperationTimeCheckerService', () => {
  let service: OperationTimeCheckerService;
  let mockLogger: jest.Mocked<LoggerInstance>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;
    service = new OperationTimeCheckerService(mockLogger);
  });

  describe('Forex Style: Sun-Fri 18:05 - 16:59 (NY Time)', () => {
    const config = {
      timezone: 'America/New_York',
      schedule: 'Sun-Fri: 18:05 - 16:59',
    };

    test('should be OPEN on Monday 12:00 PM NY', () => {
      // 2026-01-05 is Monday
      const now = new Date('2026-01-05T12:00:00Z'); // UTC
      // 12:00 UTC is 07:00 AM NY (EST -5) -> within 18:05 - 16:59 range (it is after 18:05 Sunday and before 16:59 Friday, and it is 07:00 which is <= 16:59)

      // Let's use specific NY time for clarity in test
      const nyTime = new Date('2026-01-05T12:00:00-05:00'); // Monday 12:00 PM NY
      expect(service.isInside(config, nyTime)).toBe(true);
    });

    test('should be CLOSED on Monday 17:30 PM NY (Daily break)', () => {
      const nyTime = new Date('2026-01-05T17:30:00-05:00'); // Monday 5:30 PM NY
      expect(service.isInside(config, nyTime)).toBe(false);
    });

    test('should be OPEN on Monday 19:00 PM NY (After daily break)', () => {
      const nyTime = new Date('2026-01-05T19:00:00-05:00'); // Monday 7:00 PM NY
      expect(service.isInside(config, nyTime)).toBe(true);
    });

    test('should be CLOSED on Saturday 12:00 PM NY (Weekend)', () => {
      const nyTime = new Date('2026-01-03T12:00:00-05:00'); // Saturday
      expect(service.isInside(config, nyTime)).toBe(false);
    });

    test('should be CLOSED on Sunday 12:00 PM NY (Before market open)', () => {
      const nyTime = new Date('2026-01-04T12:00:00-05:00'); // Sunday noon
      expect(service.isInside(config, nyTime)).toBe(false);
    });

    test('should be OPEN on Sunday 19:00 PM NY (After market open)', () => {
      const nyTime = new Date('2026-01-04T19:00:00-05:00'); // Sunday 7:00 PM
      expect(service.isInside(config, nyTime)).toBe(true);
    });

    test('should be OPEN on Friday 16:00 PM NY (Before market close)', () => {
      const nyTime = new Date('2026-01-09T16:00:00-05:00'); // Friday 4:00 PM
      expect(service.isInside(config, nyTime)).toBe(true);
    });

    test('should be CLOSED on Friday 17:30 PM NY (After market close)', () => {
      const nyTime = new Date('2026-01-09T17:30:00-05:00'); // Friday 5:30 PM
      expect(service.isInside(config, nyTime)).toBe(false);
    });
  });

  describe('Standard Style: Mon-Fri 09:00 - 17:00', () => {
    const config = {
      timezone: 'UTC',
      schedule: 'Mon-Fri: 09:00 - 17:00',
    };

    test('should be OPEN on Wednesday 10:00 AM UTC', () => {
      const time = new Date('2026-01-07T10:00:00Z');
      expect(service.isInside(config, time)).toBe(true);
    });

    test('should be CLOSED on Wednesday 08:00 AM UTC', () => {
      const time = new Date('2026-01-07T08:00:00Z');
      expect(service.isInside(config, time)).toBe(false);
    });

    test('should be CLOSED on Sunday 10:00 AM UTC', () => {
      const time = new Date('2026-01-04T10:00:00Z');
      expect(service.isInside(config, time)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should return true (safety fallback) for invalid schedule format', () => {
      const config = { timezone: 'UTC', schedule: 'invalid' };
      expect(service.isInside(config)).toBe(true);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should return true (safety fallback) for invalid timezone', () => {
      const config = {
        timezone: 'Invalid/Zone',
        schedule: 'Mon-Fri: 09:00 - 17:00',
      };
      expect(service.isInside(config)).toBe(true);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
