/**
 * Purpose: Dependency injection container for interpret-service.
 * Wires up service instances only (no HTTP server or worker instances).
 */

import {
  accountRepository,
  promptRuleRepository,
  telegramMessageRepository,
} from '@dal';
import {
  LoggerInstance,
  RedisStreamPublisher,
  PushNotificationService,
} from '@telegram-trading-bot-mini/shared/utils';

import { config } from './config';
import { Container } from './interfaces';
import { PromptCacheService } from './services/prompt-cache.service';
import { GeminiAIService } from './services/ai/providers/gemini/gemini-ai.service';
import { GeminiSessionManager } from './services/ai/providers/gemini/gemini-session-manager';
import { GroqAIService } from './services/ai/providers/groq/groq-ai.service';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { IAIService } from './services/ai/ai-service.interface';

/**
 * Create Groq AI service instance
 * Stateless provider with configurable model
 */
function createGroqAIService(
  promptCacheService: PromptCacheService,
  logger: LoggerInstance,
): IAIService {
  const apiKey = config('AI_GROQ_API_KEY');
  const model = config('AI_GROQ_MODEL');
  const fallbackModel = config('AI_GROQ_MODEL_FALLBACK');

  const service = new GroqAIService(
    apiKey,
    model,
    fallbackModel,
    promptCacheService,
    logger,
  );

  logger.info(
    {
      provider: 'groq',
      model,
      fallbackModel,
    },
    'GroqAIService initialized (stateless) with fallback support',
  );

  return service;
}

/**
 * Create Gemini AI service instance
 * Session-based provider with caching
 */
function createGeminiAIService(
  promptCacheService: PromptCacheService,
  logger: LoggerInstance,
): IAIService {
  const apiKey = config('AI_GEMINI_API_KEY');
  const model = config('AI_GEMINI_MODEL');

  // Create GoogleGenerativeAI instance
  const genAI = new GoogleGenerativeAI(apiKey);

  // Create GeminiSessionManager for session caching and lifecycle management
  // Handles session expiration (8 AM Sydney + 100 message limit)
  const chatSessionManager = new GeminiSessionManager(
    promptCacheService,
    genAI,
    model,
    logger,
  );

  logger.info(
    {
      model,
      resetHour: 8,
      messageLimit: 100,
    },
    'GeminiSessionManager initialized',
  );

  // Create Gemini AI service
  const service = new GeminiAIService(chatSessionManager, logger);

  logger.info(
    {
      provider: 'gemini',
      model,
    },
    'GeminiAIService initialized with session caching',
  );

  return service;
}

/**
 * Create AI service based on provider configuration
 */
function createAIService(
  promptCacheService: PromptCacheService,
  logger: LoggerInstance,
): IAIService {
  const provider = config('AI_PROVIDER');

  switch (provider) {
    case 'groq':
      return createGroqAIService(promptCacheService, logger);
    case 'gemini':
      return createGeminiAIService(promptCacheService, logger);
    default:
      logger.warn({ provider }, 'Unknown AI provider, defaulting to Gemini');
      return createGeminiAIService(promptCacheService, logger);
  }
}

export function createContainer(logger: LoggerInstance): Container {
  // Create stream publisher for publishing translation results
  // NOTE: MVP constraint - Redis Streams lack Kafka-style partition grouping
  // REQUIREMENT: Run exactly one instance to maintain message sequence
  const streamPublisher = new RedisStreamPublisher({
    url: config('REDIS_URL'),
  });

  // Create push notification service
  const pushNotificationService = new PushNotificationService({
    apiKey: config('PUSHSAFER_API_KEY'),
    logger,
  });
  logger.info('PushNotificationService initialized');

  // Create prompt cache service with in-memory cache
  // MVP Note: In-memory cache is acceptable for single instance deployment
  const promptCacheService = new PromptCacheService(
    promptRuleRepository,
    logger,
    config('AI_PROMPT_CACHE_TTL_SECONDS'),
  );
  logger.info(
    { ttlSeconds: config('AI_PROMPT_CACHE_TTL_SECONDS') },
    'PromptCacheService initialized',
  );

  // Create AI service based on provider selection
  const aiService = createAIService(promptCacheService, logger);

  const container: Container = {
    accountRepository,
    promptRuleRepository,
    telegramMessageRepository,
    logger,
    streamPublisher,
    pushNotificationService,
    promptCacheService,
    aiService,
  };

  // Document message types this service will publish:
  // - TRANSLATE_MESSAGE_RESULT: Translation results to trade-manager

  return container;
}
