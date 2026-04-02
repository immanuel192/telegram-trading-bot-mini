/**
 * Purpose: Convert TypeBox schema to JSON Schema format for Groq
 * Exports: convertToGroqSchema function
 * Core Flow: Transform TypeBox discriminated union → Flatten to simple JSON Schema
 *
 * TypeBox schemas are already very close to JSON Schema, but we need to:
 * 1. Detect discriminated unions (anyOf with object types)
 * 2. Flatten discriminated unions to simple schema for AI
 * 3. Handle TypeBox's anyOf for simple unions (enums)
 * 4. Convert nullable unions to proper JSON Schema nullable
 * 5. Handle TypeBox's Optional fields
 * 6. Add additionalProperties: false for strict validation
 */

import { TSchema } from '@sinclair/typebox';

/**
 * Check if a schema is a discriminated union (anyOf with object types)
 */
function isDiscriminatedUnion(schema: any): boolean {
  if (!schema.anyOf || !Array.isArray(schema.anyOf)) {
    return false;
  }

  // Check if all variants are objects
  const allObjects = schema.anyOf.every((variant: any) => {
    return variant.type === 'object' || variant.properties;
  });

  return allObjects;
}

/**
 * Flatten a discriminated union into a single object schema
 * This merges all properties from all variants and makes them optional
 * The command field becomes an enum of all possible command values
 */
function flattenDiscriminatedUnion(schema: any): Record<string, any> {
  const allProperties: Record<string, any> = {};
  const commandValues: string[] = [];
  const requiredFields = new Set<string>([
    'isCommand',
    'confidence',
    'reason',
    'command',
  ]);

  // Process each variant in the union
  for (const variant of schema.anyOf) {
    if (!variant.properties) continue;

    // Extract command value from this variant
    if (variant.properties.command) {
      const commandSchema = variant.properties.command;
      if (commandSchema.const) {
        // Single literal
        commandValues.push(commandSchema.const);
      } else if (commandSchema.anyOf) {
        // Union of literals (e.g., LONG | SHORT)
        commandSchema.anyOf.forEach((literal: any) => {
          if (literal.const) {
            commandValues.push(literal.const);
          }
        });
      }
    }

    // Merge all properties from this variant
    for (const [propName, propSchema] of Object.entries(variant.properties)) {
      if (propName === 'command') {
        // Skip command, we'll handle it separately
        continue;
      }

      if (propName === 'extraction') {
        // Merge extraction properties from all variants
        if (!allProperties.extraction) {
          allProperties.extraction = {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
            nullable: true, // extraction is optional for NONE command
            description: 'Extraction data (only present if isCommand is true)',
          };
        }

        const extractionSchema = propSchema as any;
        if (extractionSchema.properties) {
          // Merge extraction properties
          for (const [extractProp, extractPropSchema] of Object.entries(
            extractionSchema.properties
          )) {
            if (!allProperties.extraction.properties[extractProp]) {
              // Convert the property and make it nullable (since different commands use different fields)
              const converted = convertToGroqSchema(
                extractPropSchema as TSchema
              );
              converted.nullable = true;
              allProperties.extraction.properties[extractProp] = converted;
            }
          }
        }
      } else {
        // Regular property (isCommand, confidence, reason)
        if (!allProperties[propName]) {
          allProperties[propName] = convertToGroqSchema(propSchema as TSchema);
        }
      }
    }
  }

  // Create command enum
  allProperties.command = {
    type: 'string',
    enum: [...new Set(commandValues)], // Remove duplicates
    description: schema.description || 'Command type',
  };

  return {
    type: 'object',
    properties: allProperties,
    required: Array.from(requiredFields),
    additionalProperties: false,
    description: schema.description || 'AI response schema',
  };
}

/**
 * Convert TypeBox schema to JSON Schema format for Groq
 *
 * @param schema - TypeBox schema to convert
 * @returns JSON Schema compatible with Groq's json_schema format
 */
export function convertToGroqSchema(schema: TSchema): Record<string, any> {
  const result: any = {};

  // Check if this is an optional field (TypeBox uses Symbol for this)
  const isOptional =
    (schema as any)[Symbol.for('TypeBox.Optional')] === 'Optional';

  // Handle discriminated unions first (before checking schema.type)
  if (isDiscriminatedUnion(schema)) {
    return flattenDiscriminatedUnion(schema);
  }

  // Handle different TypeBox schema types
  switch (schema.type) {
    case 'object':
      result.type = 'object';
      result.properties = {};

      // Convert each property
      if (schema.properties) {
        for (const [key, value] of Object.entries(schema.properties)) {
          result.properties[key] = convertToGroqSchema(value as TSchema);
        }
      }

      // Add required fields (only non-optional fields)
      if (schema.required && Array.isArray(schema.required)) {
        result.required = schema.required;
      } else {
        // JSON Schema expects required array even if empty
        result.required = [];
      }

      // Add strict validation
      result.additionalProperties = false;

      break;

    case 'string':
      result.type = 'string';
      break;

    case 'number':
      result.type = 'number';
      break;

    case 'boolean':
      result.type = 'boolean';
      break;

    case 'array':
      result.type = 'array';
      if (schema.items) {
        result.items = convertToGroqSchema(schema.items as TSchema);
      }
      break;

    case 'null':
      // JSON Schema uses nullable flag
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
          const converted = convertToGroqSchema(nonNullSchemas[0] as TSchema);
          converted.nullable = true;
          return converted;
        }

        // Check if it's an enum (union of literals)
        const allLiterals = schema.anyOf.every(
          (s: any) => s.const !== undefined
        );
        if (allLiterals) {
          result.type = 'string';
          result.enum = schema.anyOf.map((s: any) => s.const);
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
