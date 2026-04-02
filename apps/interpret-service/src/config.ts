import {
  createConfig,
  BaseConfig,
  StreamConsumerMode,
} from '@telegram-trading-bot-mini/shared/utils';

export interface InterpretServiceConfig extends BaseConfig {
  PORT: number;
  // Sentry configuration
  SENTRY_DSN: string;
  // Redis Stream configuration (native Redis)
  REDIS_URL: string;
  // Stream consumer configuration - per stream
  STREAM_CONSUMER_MODE_REQUESTS: StreamConsumerMode;
  // PushSafer API configuration
  PUSHSAFER_API_KEY: string;
  // AI Provider selection
  AI_PROVIDER: 'gemini' | 'groq';
  // AI Gemini configuration
  AI_GEMINI_API_KEY: string;
  AI_GEMINI_MODEL: string;
  // AI Groq configuration
  AI_GROQ_API_KEY: string;
  AI_GROQ_MODEL: string;
  /** Fallback model to use when primary Groq model returns 503 (over capacity) */
  AI_GROQ_MODEL_FALLBACK: string;
  // Prompt cache configuration (in-memory for MVP single instance)
  AI_PROMPT_CACHE_TTL_SECONDS: number;
}

const defaultConfig: Record<keyof InterpretServiceConfig, any> = {
  APP_NAME: 'interpret-service',
  LOG_LEVEL: 'info',
  NODE_ENV: 'development',
  MONGODB_URI:
    'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true',
  MONGODB_DBNAME: 'telegram-trading-bot',
  PORT: 9002,
  // Sentry DSN for development
  SENTRY_DSN:
    'https://87db4bf0fde1ac08474d384f3d00fb48@o4510400272531457.ingest.us.sentry.io/4510400293175305',
  // Redis Stream configuration (native Redis for development)
  REDIS_URL: 'redis://localhost:6379',
  // Stream consumer configuration - per stream
  STREAM_CONSUMER_MODE_REQUESTS: StreamConsumerMode.NEW,
  // Push notification configuration
  PUSHSAFER_API_KEY: 'fake-pushsafer-key',
  // AI Provider selection (default: Gemini for backward compatibility)
  AI_PROVIDER: 'gemini',
  // AI Gemini configuration
  AI_GEMINI_API_KEY: 'fake-gemini-key',
  AI_GEMINI_MODEL: 'gemini-2.5-flash-lite',
  // AI Groq configuration
  AI_GROQ_API_KEY: 'fake-groq-key',
  AI_GROQ_MODEL: 'llama-3.1-8b-instant',
  AI_GROQ_MODEL_FALLBACK: 'llama-3.3-70b-versatile',
  // Prompt cache configuration (30 minutes = 1800 seconds)
  AI_PROMPT_CACHE_TTL_SECONDS: 1800,
};

export const config = createConfig<InterpretServiceConfig>(defaultConfig);
