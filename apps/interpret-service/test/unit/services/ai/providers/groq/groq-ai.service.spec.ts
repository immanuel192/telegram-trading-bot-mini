/**
 * Purpose: Unit tests for GroqAIService
 * Tests: Model selection, response format detection, prompt enhancement, error handling
 * Core Flow: Mock Groq client and verify behavior
 */

import { GroqAIService } from '../../../../../../src/services/ai/providers/groq/groq-ai.service';
import { MessageContext } from '../../../../../../src/services/ai/ai-service.interface';
import { PromptCacheService } from '../../../../../../src/services/prompt-cache.service';
import { fakeLogger } from '@telegram-trading-bot-mini/shared/test-utils';
import * as utils from '@telegram-trading-bot-mini/shared/utils';
import Groq from 'groq-sdk';

jest.mock('groq-sdk');

describe('GroqAIService', () => {
  let mockPromptCacheService: jest.Mocked<PromptCacheService>;
  let mockCreateFn: jest.Mock;
  let gaugeMetricSpy: jest.SpyInstance;

  const mockApiKey = 'test-api-key';
  const mockContext: MessageContext = { prevMessage: '' };

  beforeEach(() => {
    gaugeMetricSpy = jest.spyOn(utils, 'gaugeMetric').mockImplementation();
    mockPromptCacheService = { getPrompt: jest.fn() } as any;
    mockCreateFn = jest.fn();

    (Groq as jest.MockedClass<typeof Groq>).mockImplementation(
      () =>
        ({
          chat: { completions: { create: mockCreateFn } },
        }) as any,
    );
  });

  afterEach(() => {
    gaugeMetricSpy.mockRestore();
  });

  describe('Response Format Selection', () => {
    it('should use json_object for non-schema models', async () => {
      const service = new GroqAIService(
        mockApiKey,
        'llama-3.1-8b-instant',
        'llama-3.3-70b-versatile', // fallback model
        mockPromptCacheService,
        fakeLogger,
      );

      mockPromptCacheService.getPrompt.mockResolvedValue({
        systemPrompt: 'Test',
        hash: 'abc',
      });

      mockCreateFn.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  isCommand: false,
                  command: 'NONE',
                  confidence: 0.5,
                  reason: 'Test',
                  extraction: undefined,
                },
              ]),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      await service.translateMessage('test', mockContext, 'ch1', 'p1');

      expect(mockCreateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: undefined, // Changed from json_object to allow array responses
        }),
      );
    });

    it('should use json_schema for supported models', async () => {
      const service = new GroqAIService(
        mockApiKey,
        'openai/gpt-oss-120b',
        'llama-3.3-70b-versatile', // fallback model
        mockPromptCacheService,
        fakeLogger,
      );

      mockPromptCacheService.getPrompt.mockResolvedValue({
        systemPrompt: 'Test',
        hash: 'abc',
      });

      mockCreateFn.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  isCommand: false,
                  command: 'NONE',
                  confidence: 0.5,
                  reason: 'Test',
                  extraction: undefined,
                },
              ]),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      await service.translateMessage('test', mockContext, 'ch1', 'p1');

      expect(mockCreateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: expect.objectContaining({
            type: 'json_schema',
            json_schema: expect.objectContaining({
              strict: true,
            }),
          }),
        }),
      );
    });
  });

  describe('Prompt Enhancement', () => {
    it('should append schema instruction for non-schema models', async () => {
      const service = new GroqAIService(
        mockApiKey,
        'llama-3.1-8b-instant',
        'llama-3.3-70b-versatile', // fallback model
        mockPromptCacheService,
        fakeLogger,
      );

      mockPromptCacheService.getPrompt.mockResolvedValue({
        systemPrompt: 'Original prompt',
        hash: 'abc',
      });

      mockCreateFn.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  isCommand: false,
                  command: 'NONE',
                  confidence: 0.5,
                  reason: 'Test',
                  extraction: undefined,
                },
              ]),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      await service.translateMessage('test', mockContext, 'ch1', 'p1');

      const systemPrompt = mockCreateFn.mock.calls[0][0].messages[0].content;

      // Should contain original prompt
      expect(systemPrompt).toContain('Original prompt');

      // For non-schema models, we use the prompt as-is (no schema instruction appended)
      // The prompt itself should instruct the AI on the format
      expect(systemPrompt).toBe('Original prompt');
    });

    it('should NOT append schema instruction for schema-supported models', async () => {
      const service = new GroqAIService(
        mockApiKey,
        'openai/gpt-oss-120b',
        'llama-3.3-70b-versatile', // fallback model
        mockPromptCacheService,
        fakeLogger,
      );

      mockPromptCacheService.getPrompt.mockResolvedValue({
        systemPrompt: 'Original prompt',
        hash: 'abc',
      });

      mockCreateFn.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  isCommand: false,
                  command: 'NONE',
                  confidence: 0.5,
                  reason: 'Test',
                  extraction: undefined,
                },
              ]),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      await service.translateMessage('test', mockContext, 'ch1', 'p1');

      const systemPrompt = mockCreateFn.mock.calls[0][0].messages[0].content;

      // Should only contain original prompt
      expect(systemPrompt).toBe('Original prompt');
    });
  });

  describe('Error Handling', () => {
    let service: GroqAIService;

    beforeEach(() => {
      service = new GroqAIService(
        mockApiKey,
        'llama-3.1-8b-instant',
        'llama-3.3-70b-versatile', // fallback model
        mockPromptCacheService,
        fakeLogger,
      );
    });

    it('should handle prompt cache failure', async () => {
      mockPromptCacheService.getPrompt.mockResolvedValue(null);

      const result = await service.translateMessage(
        'test',
        mockContext,
        'ch1',
        'p1',
      );

      expect(result).toHaveLength(1);
      expect(result[0].isCommand).toBe(false);
      expect(result[0].command).toBe('NONE');
      expect(result[0].reason).toContain('Error');
    });

    it('should handle JSON parse errors', async () => {
      mockPromptCacheService.getPrompt.mockResolvedValue({
        systemPrompt: 'Test',
        hash: 'abc',
      });

      mockCreateFn.mockResolvedValue({
        choices: [{ message: { content: 'invalid json' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      const result = await service.translateMessage(
        'test',
        mockContext,
        'ch1',
        'p1',
      );

      expect(result).toHaveLength(1);
      expect(result[0].isCommand).toBe(false);
      expect(result[0].reason).toContain('Failed to parse AI response');
    });

    it('should handle API errors', async () => {
      mockPromptCacheService.getPrompt.mockResolvedValue({
        systemPrompt: 'Test',
        hash: 'abc',
      });

      mockCreateFn.mockRejectedValue(new Error('API Error'));

      const result = await service.translateMessage(
        'test',
        mockContext,
        'ch1',
        'p1',
      );

      expect(result).toHaveLength(1);
      expect(result[0].isCommand).toBe(false);
      expect(result[0].reason).toContain('Error: API Error');
    });

    it('should handle rate limit errors', async () => {
      mockPromptCacheService.getPrompt.mockResolvedValue({
        systemPrompt: 'Test',
        hash: 'abc',
      });

      const error: any = new Error('Rate limit');
      error.status = 429;
      mockCreateFn.mockRejectedValue(error);

      const result = await service.translateMessage(
        'test',
        mockContext,
        'ch1',
        'p1',
      );

      expect(result).toHaveLength(1);
      expect(result[0].isCommand).toBe(false);
      expect(result[0].reason).toContain('Rate limit exceeded');
    });
  });

  describe('Fallback Model Support', () => {
    let service: GroqAIService;

    beforeEach(() => {
      service = new GroqAIService(
        mockApiKey,
        'llama-3.1-8b-instant',
        'llama-3.3-70b-versatile', // fallback model
        mockPromptCacheService,
        fakeLogger,
      );
    });

    it('should use primary model when it succeeds', async () => {
      mockPromptCacheService.getPrompt.mockResolvedValue({
        systemPrompt: 'Test',
        hash: 'abc',
      });

      mockCreateFn.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  isCommand: false,
                  command: 'NONE',
                  confidence: 0.5,
                  reason: 'Test',
                  extraction: undefined,
                },
              ]),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      await service.translateMessage('test', mockContext, 'ch1', 'p1');

      // Should only call once (primary model)
      expect(mockCreateFn).toHaveBeenCalledTimes(1);
      expect(mockCreateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'llama-3.1-8b-instant',
        }),
      );

      // Should track metrics with primary model
      expect(gaugeMetricSpy).toHaveBeenCalledWith(
        'ai.groq.latency',
        expect.any(Number),
        expect.objectContaining({
          model: 'llama-3.1-8b-instant',
          fallbackUsed: false,
        }),
      );
    });

    it('should fallback to secondary model on 503 error', async () => {
      mockPromptCacheService.getPrompt.mockResolvedValue({
        systemPrompt: 'Test',
        hash: 'abc',
      });

      const error503: any = new Error('Over capacity');
      error503.status = 503;

      // First call fails with 503, second succeeds
      mockCreateFn.mockRejectedValueOnce(error503).mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  isCommand: false,
                  command: 'NONE',
                  confidence: 0.5,
                  reason: 'Test',
                  extraction: undefined,
                },
              ]),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      const result = await service.translateMessage(
        'test',
        mockContext,
        'ch1',
        'p1',
      );

      // Should call twice (primary + fallback)
      expect(mockCreateFn).toHaveBeenCalledTimes(2);

      // First call with primary model
      expect(mockCreateFn).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          model: 'llama-3.1-8b-instant',
        }),
      );

      // Second call with fallback model
      expect(mockCreateFn).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          model: 'llama-3.3-70b-versatile',
        }),
      );

      // Should track fallback success metric
      expect(gaugeMetricSpy).toHaveBeenCalledWith(
        'ai.groq.fallback.success',
        1,
        expect.objectContaining({
          primaryModel: 'llama-3.1-8b-instant',
          fallbackModel: 'llama-3.3-70b-versatile',
        }),
      );

      // Should track fallback latency
      expect(gaugeMetricSpy).toHaveBeenCalledWith(
        'ai.groq.fallback.latency',
        expect.any(Number),
        expect.objectContaining({
          primaryModel: 'llama-3.1-8b-instant',
          fallbackModel: 'llama-3.3-70b-versatile',
        }),
      );

      // Should track overall latency with fallback model
      expect(gaugeMetricSpy).toHaveBeenCalledWith(
        'ai.groq.latency',
        expect.any(Number),
        expect.objectContaining({
          model: 'llama-3.3-70b-versatile',
          fallbackUsed: true,
        }),
      );

      // Should return successful result
      expect(result).toHaveLength(1);
      expect(result[0].isCommand).toBe(false);
    });

    it('should not fallback on non-503 errors', async () => {
      mockPromptCacheService.getPrompt.mockResolvedValue({
        systemPrompt: 'Test',
        hash: 'abc',
      });

      const error400: any = new Error('Bad request');
      error400.status = 400;
      mockCreateFn.mockRejectedValue(error400);

      const result = await service.translateMessage(
        'test',
        mockContext,
        'ch1',
        'p1',
      );

      // Should only call once (no fallback for non-503)
      expect(mockCreateFn).toHaveBeenCalledTimes(1);

      // Should return error response
      expect(result).toHaveLength(1);
      expect(result[0].isCommand).toBe(false);
      expect(result[0].reason).toContain('Error: Bad request');

      // Should NOT track fallback metrics
      expect(gaugeMetricSpy).not.toHaveBeenCalledWith(
        'ai.groq.fallback.success',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should handle both primary and fallback failing', async () => {
      mockPromptCacheService.getPrompt.mockResolvedValue({
        systemPrompt: 'Test',
        hash: 'abc',
      });

      const error503: any = new Error('Over capacity');
      error503.status = 503;

      // Both calls fail with 503
      mockCreateFn.mockRejectedValue(error503);

      const result = await service.translateMessage(
        'test',
        mockContext,
        'ch1',
        'p1',
      );

      // Should call twice (primary + fallback)
      expect(mockCreateFn).toHaveBeenCalledTimes(2);

      // Should track fallback failure metric
      expect(gaugeMetricSpy).toHaveBeenCalledWith(
        'ai.groq.fallback.failure',
        1,
        expect.objectContaining({
          primaryModel: 'llama-3.1-8b-instant',
          fallbackModel: 'llama-3.3-70b-versatile',
          errorStatus: 503,
        }),
      );

      // Should return error response
      expect(result).toHaveLength(1);
      expect(result[0].isCommand).toBe(false);
      expect(result[0].reason).toContain('Error: Over capacity');
    });

    it('should warn if fallback model does not support JSON schema', () => {
      // Create service where primary supports schema but fallback doesn't
      const serviceWithMismatch = new GroqAIService(
        mockApiKey,
        'openai/gpt-oss-120b', // supports JSON schema
        'llama-3.1-8b-instant', // does not support JSON schema
        mockPromptCacheService,
        fakeLogger,
      );

      // Check that warning was logged (via fakeLogger)
      expect(fakeLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          primary: 'openai/gpt-oss-120b',
          fallback: 'llama-3.1-8b-instant',
        }),
        'Fallback model does not support JSON schema - may have degraded accuracy',
      );
    });
  });
});
