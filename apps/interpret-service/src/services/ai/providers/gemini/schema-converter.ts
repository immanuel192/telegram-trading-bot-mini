/**
 * Purpose: Convert TypeBox schema to Gemini ResponseSchema format
 * Exports: convertToGeminiSchema function
 * Core Flow: Recursively traverse TypeBox schema → Map to Gemini SchemaType format
 *
 * This converter transforms our unified TypeBox schema into Gemini's proprietary
 * ResponseSchema format, which uses SchemaType enums instead of string literals.
 */

import { TSchema } from '@sinclair/typebox';
import { SchemaType, ResponseSchema } from '@google/generative-ai';

/**
 * Convert TypeBox schema to Gemini ResponseSchema format
 *
 * @param schema - TypeBox schema to convert
 * @returns Gemini-compatible ResponseSchema
 */
export function convertToGeminiSchema(schema: TSchema): ResponseSchema {
  const result: any = {};

  // Check if this is an optional field (TypeBox uses Symbol for this)
  const isOptional =
    (schema as any)[Symbol.for('TypeBox.Optional')] === 'Optional';

  // Handle different TypeBox schema types
  switch (schema.type) {
    case 'object':
      result.type = SchemaType.OBJECT;
      result.properties = {};

      // Convert each property
      if (schema.properties) {
        for (const [key, value] of Object.entries(schema.properties)) {
          result.properties[key] = convertToGeminiSchema(value as TSchema);
        }
      }

      // Add required fields (only non-optional fields)
      if (schema.required && Array.isArray(schema.required)) {
        result.required = schema.required;
      } else {
        // Gemini expects required array even if empty
        result.required = [];
      }

      break;

    case 'string':
      result.type = SchemaType.STRING;
      break;

    case 'number':
      result.type = SchemaType.NUMBER;
      break;

    case 'boolean':
      result.type = SchemaType.BOOLEAN;
      break;

    case 'array':
      result.type = SchemaType.ARRAY;
      if (schema.items) {
        result.items = convertToGeminiSchema(schema.items as TSchema);
      }
      break;

    case 'null':
      // Gemini handles null via nullable flag on parent
      result.nullable = true;
      break;

    default:
      // Handle union types (anyOf in TypeBox)
      if (schema.anyOf) {
        // Check if it's a union with null (nullable field)
        const hasNull = schema.anyOf.some((s: any) => s.type === 'null');
        const nonNullSchemas = schema.anyOf.filter(
          (s: any) => s.type !== 'null'
        );

        if (hasNull && nonNullSchemas.length === 1) {
          // This is a nullable field
          const converted = convertToGeminiSchema(nonNullSchemas[0] as TSchema);
          converted.nullable = true;
          return converted;
        }

        // Check if it's an enum (union of literals)
        const allLiterals = schema.anyOf.every(
          (s: any) => s.const !== undefined
        );
        if (allLiterals) {
          result.type = SchemaType.STRING;
          result.enum = schema.anyOf.map((s: any) => s.const);
          result.format = 'enum';
        }
      }
      break;
  }

  // Add description if present
  if (schema.description) {
    result.description = schema.description;
  }

  // Mark as nullable if it's an optional field
  if (isOptional) {
    result.nullable = true;
  }

  return result;
}
