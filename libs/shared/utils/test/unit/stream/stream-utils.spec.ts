import { suiteName } from '@telegram-trading-bot-mini/shared/test-utils';
import { StreamConsumerMode } from '../../../src/constants/consumer';
import { getStreamStartId } from '../../../src/stream/stream-utils';

describe(suiteName(__filename), () => {
  describe('getStreamStartId', () => {
    it('should return "0" for BEGINNING mode', () => {
      const result = getStreamStartId(StreamConsumerMode.BEGINNING);
      expect(result).toBe('0');
    });

    it('should return "$" for NEW mode', () => {
      const result = getStreamStartId(StreamConsumerMode.NEW);
      expect(result).toBe('$');
    });
  });
});
