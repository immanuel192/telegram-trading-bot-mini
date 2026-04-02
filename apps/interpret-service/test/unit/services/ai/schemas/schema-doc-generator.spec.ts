/**
 * Unit tests for Schema Documentation Generator (schema-doc-generator.ts)
 *
 * Tests the generateSampleResponse() function which generates JSON schema documentation
 * for AI models that don't support native json_schema mode (e.g., llama-3.1-8b-instant).
 *
 * This is NOT testing the schema validation itself - see ai-response.schema.spec.ts for that.
 * This tests the dynamic generation of schema examples that get appended to AI prompts.
 */

import { describe, it, expect } from '@jest/globals';
import { generateSampleResponse } from '../../../../../src/services/ai/schemas/schema-doc-generator';
import { CommandSide } from '@telegram-trading-bot-mini/shared/utils';

describe('AI Response Schema - generateSampleResponse', () => {
  describe('JSON Generation', () => {
    it('should generate valid JSON string', () => {
      const result = generateSampleResponse();

      // Should be parseable JSON
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should generate formatted JSON with indentation', () => {
      const result = generateSampleResponse();

      // Should contain newlines (formatted)
      expect(result).toContain('\n');

      // Should contain proper indentation
      expect(result).toMatch(/\n {2}/); // 2-space indent
    });
  });

  describe('Schema Compliance', () => {
    it('should generate schema documentation that is valid JSON', () => {
      const result = generateSampleResponse();
      const parsed = JSON.parse(result);

      // Should be a valid array
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('should include all required top-level fields as type descriptions in array elements', () => {
      const result = generateSampleResponse();
      const parsed = JSON.parse(result);

      // Should be an array with at least one element
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);

      // First element should have the required fields
      const firstElement = parsed[0];
      expect(firstElement).toHaveProperty('isCommand');
      expect(firstElement).toHaveProperty('confidence');
      expect(firstElement).toHaveProperty('reason');
      expect(firstElement).toHaveProperty('command');
    });

    it('should show types as strings, not actual values', () => {
      const result = generateSampleResponse();
      const parsed = JSON.parse(result);
      const firstElement = parsed[0];

      // These should be type descriptions (strings), not actual typed values
      expect(typeof firstElement.isCommand).toBe('string');
      expect(firstElement.isCommand).toBe('boolean');

      expect(typeof firstElement.confidence).toBe('string');
      // Confidence has a description, so it contains the full description text
      expect(firstElement.confidence).toContain('0-1');

      expect(typeof firstElement.reason).toBe('string');
      // Reason has a description with more details
      expect(firstElement.reason.length).toBeGreaterThan(0);

      expect(typeof firstElement.command).toBe('string');
      expect(firstElement.command).toContain('LONG');
      expect(firstElement.command).toContain('SHORT');
    });

    it('should include extraction object structure', () => {
      const result = generateSampleResponse();
      const parsed = JSON.parse(result);
      const firstElement = parsed[0];

      expect(firstElement.extraction).toBeDefined();
      expect(typeof firstElement.extraction).toBe('object');
    });
  });

  describe('Schema Documentation Format', () => {
    it('should use type descriptions instead of actual values', () => {
      const result = generateSampleResponse();
      const parsed = JSON.parse(result);
      const firstElement = parsed[0];

      // Should not contain actual boolean/number values
      expect(firstElement.isCommand).not.toBe(true);
      expect(firstElement.isCommand).not.toBe(false);

      // Should be string descriptions
      expect(typeof firstElement.isCommand).toBe('string');
      expect(typeof firstElement.confidence).toBe('string');
    });

    it('should show command enum values', () => {
      const result = generateSampleResponse();
      const parsed = JSON.parse(result);
      const firstElement = parsed[0];

      const commandDesc = firstElement.command;
      expect(typeof commandDesc).toBe('string');

      // Should list all valid command values
      expect(commandDesc).toContain('LONG');
      expect(commandDesc).toContain('SHORT');
      expect(commandDesc).toContain('MOVE_SL');
      expect(commandDesc).toContain('SET_TP_SL');
      expect(commandDesc).toContain('NONE');
    });

    it('should show extraction field types when present', () => {
      const result = generateSampleResponse();
      const parsed = JSON.parse(result);
      const firstElement = parsed[0];

      if (firstElement.extraction) {
        // Symbol should show as string type (with description)
        expect(typeof firstElement.extraction.symbol).toBe('string');
        expect(firstElement.extraction.symbol.length).toBeGreaterThan(0);

        // isImmediate should show as boolean type
        expect(typeof firstElement.extraction.isImmediate).toBe('string');
        expect(firstElement.extraction.isImmediate).toBe('boolean');

        // Numeric fields should show as number type (with description)
        if (firstElement.extraction.entry) {
          expect(typeof firstElement.extraction.entry).toBe('string');
          expect(firstElement.extraction.entry.length).toBeGreaterThan(0);
        }
      }
    });

    it('should include side field in extraction', () => {
      const result = generateSampleResponse();
      const parsed = JSON.parse(result);
      const firstElement = parsed[0];

      if (firstElement.extraction) {
        // Side field should be present
        expect(firstElement.extraction.side).toBeDefined();
        expect(typeof firstElement.extraction.side).toBe('string');
        expect(firstElement.extraction.side).toContain(CommandSide.BUY);
        expect(firstElement.extraction.side).toContain(CommandSide.SELL);
      }
    });
  });

  describe('Dynamic Schema Adaptation', () => {
    it('should generate documentation that includes optional fields', () => {
      const result = generateSampleResponse();
      const parsed = JSON.parse(result);
      const firstElement = parsed[0];

      // The schema doc should show all fields (required and optional)
      if (firstElement.extraction) {
        // Optional fields should be present in the documentation
        expect(firstElement.extraction.entry).toBeDefined();
        expect(firstElement.extraction.entryZone).toBeDefined();
        expect(firstElement.extraction.stopLoss).toBeDefined();
        expect(firstElement.extraction.takeProfits).toBeDefined();
        expect(firstElement.extraction.meta).toBeDefined();
      }
    });

    it('should be consistent across multiple calls', () => {
      const result1 = generateSampleResponse();
      const result2 = generateSampleResponse();

      // Should generate the same output (deterministic)
      expect(result1).toBe(result2);
    });

    it('should reflect schema changes dynamically', () => {
      const result = generateSampleResponse();
      const parsed = JSON.parse(result);

      // Should be an array
      expect(Array.isArray(parsed)).toBe(true);

      const firstElement = parsed[0];
      // If we have these fields in the schema, they should appear in the doc
      expect(firstElement.isCommand).toBeDefined();
      expect(firstElement.confidence).toBeDefined();
      expect(firstElement.reason).toBeDefined();
      expect(firstElement.command).toBeDefined();
    });
  });

  describe('AI Instruction Suitability', () => {
    it('should be suitable for prompt instruction (readable format)', () => {
      const result = generateSampleResponse();

      // Should be human-readable (formatted JSON)
      expect(result).toContain('\n');

      // Should not be minified
      expect(result.split('\n').length).toBeGreaterThan(5);
    });

    it('should clearly show expected types for AI understanding', () => {
      const result = generateSampleResponse();
      const parsed = JSON.parse(result);
      const firstElement = parsed[0];

      // Type descriptions should be clear and instructive
      expect(firstElement.isCommand).toBe('boolean');
      // Confidence includes the description from schema
      expect(firstElement.confidence).toContain('0-1');
      // Reason includes the description from schema
      expect(firstElement.reason.length).toBeGreaterThan(0);

      // Command should show all possible enum values
      expect(firstElement.command).toContain('|'); // Enum separator
    });

    it('should demonstrate nested object structure', () => {
      const result = generateSampleResponse();
      const parsed = JSON.parse(result);
      const firstElement = parsed[0];

      // Should show extraction as an object with its own fields
      expect(typeof firstElement.extraction).toBe('object');
      expect(firstElement.extraction.symbol).toBeDefined();
      expect(firstElement.extraction.isImmediate).toBeDefined();

      // Should show nested meta object
      if (firstElement.extraction.meta) {
        expect(typeof firstElement.extraction.meta).toBe('object');
      }
    });

    it('should demonstrate array structure with type info', () => {
      const result = generateSampleResponse();
      const parsed = JSON.parse(result);
      const firstElement = parsed[0];

      if (firstElement.extraction && firstElement.extraction.takeProfits) {
        // Should show array with element type
        expect(Array.isArray(firstElement.extraction.takeProfits)).toBe(true);
        expect(firstElement.extraction.takeProfits.length).toBeGreaterThan(0);

        // Array element should show object structure
        const tpElement = firstElement.extraction.takeProfits[0];
        expect(typeof tpElement).toBe('object');
      }
    });

    it('should show response as array to indicate multiple commands support', () => {
      const result = generateSampleResponse();
      const parsed = JSON.parse(result);

      // The top-level should be an array
      expect(Array.isArray(parsed)).toBe(true);
      // Should have at least one element showing the structure
      expect(parsed.length).toBeGreaterThan(0);
    });
  });
});
