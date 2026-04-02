/**
 * Purpose: Integration tests for GroqAIService with real Groq API (stateless provider).
 * Tests the stateless translation with actual API calls.
 * Prerequisites: MongoDB running, valid AI_GROQ_API_KEY for full integration tests.
 * Core Flow: Setup test prompts → Test translation → Test different models → Cleanup.
 */

import {
  suiteName,
  setupDb,
  teardownDb,
  cleanupDb,
  COLLECTIONS,
  sleep,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { fakeLogger } from '@telegram-trading-bot-mini/shared/test-utils';
import { config } from '../../src/config';
import { GroqAIService } from '../../src/services/ai/providers/groq/groq-ai.service';
import { PromptCacheService } from '../../src/services/prompt-cache.service';
import { PromptRuleRepository } from '@dal';
import { PromptRule } from '@dal/models/prompt-rule.model';
import { MessageContext } from '../../src/services/ai/ai-service.interface';

describe(suiteName(__filename), () => {
  let service: GroqAIService;
  let promptCacheService: PromptCacheService;
  let promptRuleRepository: PromptRuleRepository;
  let testPromptId: string;
  const testChannelId = 'integration-test-channel-groq';
  const testTraceToken = 'integration-test-trace-groq';

  // Test data
  const mockContext: MessageContext = {
    prevMessage: 'Previous market analysis message',
    quotedMessage: 'Replied message context',
    quotedFirstMessage: 'Original message in thread',
  };

  beforeAll(async () => {
    await setupDb();
    promptRuleRepository = new PromptRuleRepository();

    // Create test prompt in database
    testPromptId = 'integration-test-prompts-groq';
    const testPromptRule: PromptRule = {
      promptId: testPromptId,
      name: 'Integration Test Prompts (Groq)',
      description: 'Combined prompt for GroqAIService integration tests',
      systemPrompt: `You are a trading signal classifier and extractor. Analyze telegram messages and return JSON with classification and extraction data.

Respond with this exact JSON format:
{
  "isCommand": boolean,
  "command": "LONG|SHORT|MOVE_SL|SET_TP_SL|CLOSE_BAD_POSITION|CLOSE|CLOSE_ALL|CANCEL|NONE",
  "confidence": number (0-1),
  "reason": "brief explanation (max 50 words)",
  "extraction": {
    "symbol": "SYMBOL",
    "isImmediate": boolean,
    "meta": {},
    "entry": number|null,
    "entryZone": [min, max]|null,
    "stopLoss": number|null,
    "takeProfits": [{"price": number}],
    "validationError": null
  } | null
}

Rules:
- LONG: buy/mua/long signals
- SHORT: sell/bán/short signals
- NONE: not a trading command
- Extract symbol, entry, SL, TP from message
- If not a command, set extraction to null`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await promptRuleRepository.create(testPromptRule);

    // Check if we have a real API key
    const apiKey = config('AI_GROQ_API_KEY');
    const model = config('AI_GROQ_MODEL');

    if (!apiKey || apiKey === 'fake-groq-key') {
      console.warn(
        '⚠️  Using fake Groq API key - integration tests will be skipped',
      );
    }

    // Create services (stateless)
    promptCacheService = new PromptCacheService(
      promptRuleRepository,
      fakeLogger,
      1800,
    );

    service = new GroqAIService(
      apiKey,
      model,
      model, // Use same model as fallback for testing
      promptCacheService,
      fakeLogger
    );
  });

  afterAll(async () => {
    await teardownDb();
  });

  afterEach(async () => {
    await cleanupDb(null, [COLLECTIONS.PROMPT_RULE]);
    await sleep(200);
  });

  describe('Real API Integration Tests', () => {
    const hasRealApiKey =
      config('AI_GROQ_API_KEY') &&
      config('AI_GROQ_API_KEY') !== 'fake-groq-key';

    describe('Basic Connectivity', () => {
      it('should successfully call Groq API and receive valid response', async () => {
        if (!hasRealApiKey) {
          console.log('⏭️  Skipping test - no real Groq API key');
          return;
        }

        const message = 'BUY EURUSD at 1.0850, SL 1.0800, TP 1.0900';

        const result = await service.translateMessage(
          message,
          mockContext,
          testChannelId,
          testPromptId,
          testTraceToken,
        );

        // Verify response structure (not AI accuracy)
        expect(result).toBeDefined();
        expect(result).toHaveLength(1);
        expect(result[0].isCommand).toBeDefined();
        expect(result[0].command).toBeDefined();
        expect(result[0].confidence).toBeGreaterThanOrEqual(0);
        expect(result[0].confidence).toBeLessThanOrEqual(1);
        expect(result[0].reason).toBeDefined();
        expect(typeof result[0].reason).toBe('string');
      }, 30000);

      it('should handle non-command messages', async () => {
        if (!hasRealApiKey) {
          console.log('⏭️  Skipping test - no real Groq API key');
          return;
        }

        const message = 'Good morning everyone! 🌞';

        const result = await service.translateMessage(
          message,
          mockContext,
          testChannelId,
          testPromptId,
          testTraceToken,
        );

        // Verify response structure
        expect(result).toBeDefined();
        expect(result).toHaveLength(1);
        expect(result[0].isCommand).toBeDefined();
        expect(result[0].command).toBeDefined();
        expect(result[0].confidence).toBeGreaterThanOrEqual(0);
        expect(result[0].reason).toBeDefined();
      }, 30000);
    });

    describe('Performance', () => {
      it('should complete translation within reasonable time', async () => {
        if (!hasRealApiKey) {
          console.log('⏭️  Skipping test - no real Groq API key');
          return;
        }

        const message = 'BUY EURUSD at 1.0850';

        const start = Date.now();
        await service.translateMessage(
          message,
          mockContext,
          testChannelId,
          testPromptId,
          testTraceToken,
        );
        const duration = Date.now() - start;

        // Groq should be fast (< 5 seconds for integration test)
        expect(duration).toBeLessThan(5000);
      }, 10000);

      it('should handle multiple sequential requests', async () => {
        if (!hasRealApiKey) {
          console.log('⏭️  Skipping test - no real Groq API key');
          return;
        }

        const messages = [
          'BUY EURUSD at 1.0850',
          'SELL GBPUSD at 1.2700',
          'Good morning!',
        ];

        const durations: number[] = [];

        for (const message of messages) {
          const start = Date.now();
          const result = await service.translateMessage(
            message,
            mockContext,
            testChannelId,
            testPromptId,
            testTraceToken,
          );
          durations.push(Date.now() - start);

          // Verify each response is valid
          expect(result).toBeDefined();
          expect(result).toHaveLength(1);
          expect(result[0].command).toBeDefined();
        }

        const avgDuration =
          durations.reduce((a, b) => a + b, 0) / durations.length;
        expect(avgDuration).toBeLessThan(5000);
      }, 30000);
    });

    describe('Error Handling', () => {
      it('should handle edge case messages gracefully', async () => {
        if (!hasRealApiKey) {
          console.log('⏭️  Skipping test - no real Groq API key');
          return;
        }

        const edgeCaseMessages = [
          '', // Empty message
          '123456789', // Just numbers
          '@#$%^&*()', // Just symbols
          'a'.repeat(1000), // Very long message
        ];

        for (const message of edgeCaseMessages) {
          const result = await service.translateMessage(
            message,
            mockContext,
            testChannelId,
            testPromptId,
            testTraceToken,
          );

          // Should not crash, should return valid result structure
          expect(result).toBeDefined();
          expect(result).toHaveLength(1);
          expect(result[0].isCommand).toBeDefined();
          expect(result[0].command).toBeDefined();
          expect(result[0].confidence).toBeGreaterThanOrEqual(0);
          expect(result[0].reason).toBeDefined();
        }
      }, 60000);

      it('should handle empty context gracefully', async () => {
        if (!hasRealApiKey) {
          console.log('⏭️  Skipping test - no real Groq API key');
          return;
        }

        const emptyContext: MessageContext = {
          prevMessage: '',
        };

        const result = await service.translateMessage(
          'BUY EURUSD at 1.0850',
          emptyContext,
          testChannelId,
          testPromptId,
          testTraceToken,
        );

        // Should handle empty context without errors
        expect(result).toBeDefined();
        expect(result).toHaveLength(1);
        expect(result[0].command).toBeDefined();
      }, 30000);
    });

    describe('Response Structure Validation', () => {
      it('should return properly structured extraction when command detected', async () => {
        if (!hasRealApiKey) {
          console.log('⏭️  Skipping test - no real Groq API key');
          return;
        }

        const message = 'BUY EURUSD at 1.0850, SL 1.0800, TP 1.0900';

        const result = await service.translateMessage(
          message,
          mockContext,
          testChannelId,
          testPromptId,
          testTraceToken,
        );

        // If it's a command, extraction should be defined
        if (result[0].isCommand && result[0].command !== 'NONE') {
          expect(result[0].extraction).toBeDefined();
          expect(result[0].extraction?.symbol).toBeDefined();
          expect(result[0].extraction?.isImmediate).toBeDefined();
        }
      }, 30000);

      it('should return undefined extraction for non-commands', async () => {
        if (!hasRealApiKey) {
          console.log('⏭️  Skipping test - no real Groq API key');
          return;
        }

        const message = 'Hello everyone!';

        const result = await service.translateMessage(
          message,
          mockContext,
          testChannelId,
          testPromptId,
          testTraceToken,
        );

        // Non-commands should have undefined extraction
        if (!result[0].isCommand || result[0].command === 'NONE') {
          expect(result[0].extraction).toBeFalsy();
        }
      }, 30000);
    });
  });

  describe('Mock API Tests (Always Run)', () => {
    it('should validate message context structure', () => {
      const validContext: MessageContext = {
        prevMessage: 'Previous message',
      };

      expect(validContext.prevMessage).toBeDefined();
    });

    it('should have correct service configuration', () => {
      expect(service).toBeDefined();
      expect(promptCacheService).toBeDefined();
    });
  });
});
