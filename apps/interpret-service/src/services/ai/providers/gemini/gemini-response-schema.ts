/**
 * Purpose: Gemini AI response schema (auto-generated from TypeBox)
 * Exports: GEMINI_RESPONSE_SCHEMA constant
 * Core Flow: Import unified schema → Convert to Gemini format → Export
 *
 * This schema is AUTO-GENERATED from the unified TypeBox schema.
 * DO NOT EDIT MANUALLY - update apps/interpret-service/src/services/ai/schemas/ai-response.schema.ts instead.
 *
 * Source: apps/interpret-service/src/services/ai/schemas/ai-response.schema.ts
 * Converter: apps/interpret-service/src/services/ai/schemas/converters/to-gemini.ts
 */

import { ResponseSchema } from '@google/generative-ai';
import { AIResponseSchema } from '../../schemas/ai-response.schema';
import { convertToGeminiSchema } from './schema-converter';

/**
 * Gemini AI response schema
 * Auto-generated from unified TypeBox schema
 */
export const GEMINI_RESPONSE_SCHEMA: ResponseSchema =
  convertToGeminiSchema(AIResponseSchema);
