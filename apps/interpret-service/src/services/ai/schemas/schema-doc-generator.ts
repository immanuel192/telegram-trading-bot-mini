/**
 * Purpose: Generate schema documentation from TypeBox schemas
 * Exports: generateSchemaDoc function
 * Core Flow: Recursively traverse TypeBox schema → Generate type documentation
 *
 * This utility generates human-readable schema documentation showing types
 * instead of actual values, making it suitable for AI prompt instruction.
 *
 * Example output:
 * {
 *   "isCommand": "boolean",
 *   "confidence": "number (0-1)",
 *   "command": "string (LONG|SHORT|...)",
 *   ...
 * }
 */

import { GROQ_RESPONSE_SCHEMA } from '../providers/groq/groq-response-schema';

/**
 * Generate schema documentation from a JSON Schema object
 *
 * Recursively traverses the schema and generates a JSON-like structure
 * showing types and descriptions instead of actual values.
 *
 * @param schema - JSON Schema object to generate documentation for
 * @returns Schema documentation object
 */
export function generateSchemaDoc(schema: any): any {
  // Handle enum
  if (schema.enum) {
    const values = schema.enum.join('|');
    return `${schema.type || 'string'} (${values})`;
  }

  // Handle different types
  switch (schema.type) {
    case 'object': {
      const obj: any = {};
      const properties = schema.properties;

      if (properties) {
        for (const [key, propSchema] of Object.entries(properties)) {
          obj[key] = generateSchemaDoc(propSchema);
        }
      }
      return obj;
    }

    case 'array': {
      const items = schema.items;
      if (items) {
        return [generateSchemaDoc(items)];
      }
      return ['any'];
    }

    case 'string':
      return schema.description || 'string';

    case 'number':
      return schema.description || 'number';

    case 'boolean':
      return 'boolean';

    case 'null':
      return 'null';

    default:
      return 'any';
  }
}

/**
 * Generate a schema documentation format dynamically from the flattened schema
 * Used for models that don't support json_schema mode (e.g., llama-3.1-8b-instant)
 *
 * This function generates a JSON-like structure showing types and descriptions
 * instead of actual values, making it more instructive for the AI.
 *
 * Example output:
 * {
 *   "isCommand": "boolean",
 *   "confidence": "number (0-1)",
 *   "command": "string (LONG|SHORT|...)",
 *   ...
 * }
 *
 * @returns Formatted schema documentation string
 */
export function generateSampleResponse(): string {
  // Use the flattened Groq schema which has all commands in the enum
  const schemaDoc = generateSchemaDoc(GROQ_RESPONSE_SCHEMA);
  return JSON.stringify(schemaDoc, null, 2);
}
