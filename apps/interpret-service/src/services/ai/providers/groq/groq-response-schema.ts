/**
 * Purpose: Groq AI response schema (auto-generated from TypeBox)
 * Exports: GROQ_RESPONSE_SCHEMA constant
 * Core Flow: Import unified schema → Convert to JSON Schema → Export
 *
 * This schema is AUTO-GENERATED from the unified TypeBox schema.
 * DO NOT EDIT MANUALLY - update apps/interpret-service/src/services/ai/schemas/ai-response.schema.ts instead.
 *
 * Source: apps/interpret-service/src/services/ai/schemas/ai-response.schema.ts
 * Converter: apps/interpret-service/src/services/ai/schemas/converters/to-groq.ts
 */

import { AIResponseSchema } from '../../schemas/ai-response.schema';
import { convertToGroqSchema } from './schema-converter';

/**
 * Groq AI response schema (JSON Schema format)
 * Auto-generated from unified TypeBox schema
 *
 * This is the schema object that goes inside json_schema.schema
 */
export const GROQ_RESPONSE_SCHEMA = convertToGroqSchema(AIResponseSchema);
