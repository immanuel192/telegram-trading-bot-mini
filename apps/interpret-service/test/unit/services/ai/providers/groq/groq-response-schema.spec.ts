/**
 * Unit tests for Groq Response Schema (Flattened Array Structure)
 *
 * Tests the GROQ_RESPONSE_SCHEMA which is an array schema with a flattened
 * object schema in items. The discriminated union is flattened into a single
 * object with command as an enum.
 *
 * This validates that the schema converter properly transforms the
 * TypeBox AIResponseSchema into a valid JSON Schema for Groq.
 */

import { suiteName } from '@telegram-trading-bot-mini/shared/test-utils';
import { GROQ_RESPONSE_SCHEMA } from '../../../../../../src/services/ai/providers/groq/groq-response-schema';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';

describe(suiteName(__filename), () => {
  let itemsSchema: any;

  beforeAll(() => {
    itemsSchema = GROQ_RESPONSE_SCHEMA.items as any;
  });

  describe('Top-Level Array Schema', () => {
    it('should be an array schema', () => {
      expect(GROQ_RESPONSE_SCHEMA.type).toBe('array');
      expect(GROQ_RESPONSE_SCHEMA.items).toBeDefined();
    });

    it('should have items as a flattened object schema', () => {
      expect(itemsSchema.type).toBe('object');
      expect(itemsSchema.properties).toBeDefined();
      // The discriminated union is flattened into a single object
      // with command as an enum of all possible values
    });
  });

  describe('Command Field', () => {
    it('should have command as enum with all command types', () => {
      const command = itemsSchema.properties?.command;
      expect(command).toBeDefined();
      expect(command.type).toBe('string');
      expect(command.enum).toBeDefined();
      expect(Array.isArray(command.enum)).toBe(true);
    });

    it('should include all major command types in enum', () => {
      const command = itemsSchema.properties?.command;

      expect(command.enum).toContain(CommandEnum.CANCEL);
      expect(command.enum).toContain(CommandEnum.CLOSE_ALL);
      expect(command.enum).toContain(CommandEnum.CLOSE_BAD_POSITION);
      expect(command.enum).toContain(CommandEnum.LIMIT_EXECUTED);
      expect(command.enum).toContain(CommandEnum.LONG);
      expect(command.enum).toContain(CommandEnum.MOVE_SL);
      expect(command.enum).toContain(CommandEnum.NONE);
      expect(command.enum).toContain(CommandEnum.SHORT);
      expect(command.enum).toContain(CommandEnum.SET_TP_SL);
    });

    it('should have no duplicate command values', () => {
      const command = itemsSchema.properties?.command;
      const uniqueCommands = [...new Set(command.enum)];
      expect(uniqueCommands.length).toBe(command.enum.length);
    });
  });

  describe('Required Fields', () => {
    it('should have all required top-level fields', () => {
      expect(itemsSchema.required).toContain('isCommand');
      expect(itemsSchema.required).toContain('confidence');
      expect(itemsSchema.required).toContain('reason');
      expect(itemsSchema.required).toContain('command');
    });

    it('should have additionalProperties: false for strict validation', () => {
      expect(itemsSchema.additionalProperties).toBe(false);
    });
  });

  describe('Common Fields', () => {
    it('should have isCommand field as boolean', () => {
      const isCommand = itemsSchema.properties?.isCommand;
      expect(isCommand).toBeDefined();
      expect(isCommand.type).toBe('boolean');
      expect(isCommand.description).toBeDefined();
    });

    it('should have confidence field as number', () => {
      const confidence = itemsSchema.properties?.confidence;
      expect(confidence).toBeDefined();
      expect(confidence.type).toBe('number');
      expect(confidence.description).toContain('0-1');
    });

    it('should have reason field as string', () => {
      const reason = itemsSchema.properties?.reason;
      expect(reason).toBeDefined();
      expect(reason.type).toBe('string');
      expect(reason.description).toBeDefined();
    });
  });

  describe('Extraction Field', () => {
    let extraction: any;

    beforeAll(() => {
      extraction = itemsSchema.properties?.extraction;
    });

    it('should exist as nullable object', () => {
      expect(extraction).toBeDefined();
      expect(extraction.type).toBe('object');
      expect(extraction.nullable).toBe(true); // Nullable for NONE command
      expect(extraction.properties).toBeDefined();
    });

    it('should have symbol field', () => {
      const symbol = extraction.properties?.symbol;
      expect(symbol).toBeDefined();
      expect(symbol.type).toBe('string');
      expect(symbol.nullable).toBe(true);
    });

    it('should have side field', () => {
      const side = extraction.properties?.side;
      expect(side).toBeDefined();
      expect(side.nullable).toBe(true);
    });

    it('should have isImmediate field', () => {
      const isImmediate = extraction.properties?.isImmediate;
      expect(isImmediate).toBeDefined();
      expect(isImmediate.type).toBe('boolean');
      expect(isImmediate.nullable).toBe(true);
    });

    it('should have entry field as nullable number', () => {
      const entry = extraction.properties?.entry;
      expect(entry).toBeDefined();
      expect(entry.type).toBe('number');
      expect(entry.nullable).toBe(true);
    });

    it('should have stopLoss field as nullable object', () => {
      const stopLoss = extraction.properties?.stopLoss;
      expect(stopLoss).toBeDefined();
      expect(stopLoss.type).toBe('object');
      expect(stopLoss.properties?.price).toBeDefined();
      expect(stopLoss.properties?.pips).toBeDefined();
      expect(stopLoss.nullable).toBe(true);
    });

    it('should have entryZone field as array', () => {
      const entryZone = extraction.properties?.entryZone;
      expect(entryZone).toBeDefined();
      expect(entryZone.type).toBe('array');
      expect(entryZone.items?.type).toBe('number');
      expect(entryZone.nullable).toBe(true);
    });

    it('should have takeProfits field as array of objects', () => {
      const takeProfits = extraction.properties?.takeProfits;
      expect(takeProfits).toBeDefined();
      expect(takeProfits.type).toBe('array');
      expect(takeProfits.items?.type).toBe('object');
      expect(takeProfits.items?.properties?.price).toBeDefined();
      expect(takeProfits.nullable).toBe(true);
    });

    it('should have meta field as object', () => {
      const meta = extraction.properties?.meta;
      expect(meta).toBeDefined();
      expect(meta.type).toBe('object');
      expect(meta.properties?.reduceLotSize).toBeDefined();
      expect(meta.properties?.adjustEntry).toBeDefined();
      expect(meta.nullable).toBe(true);
    });

    it('should have validationError field as nullable string', () => {
      const validationError = extraction.properties?.validationError;
      expect(validationError).toBeDefined();
      expect(validationError.type).toBe('string');
      expect(validationError.nullable).toBe(true);
    });

    it('should have isLinkedWithPrevious field as nullable boolean', () => {
      const isLinkedWithPrevious = extraction.properties?.isLinkedWithPrevious;
      expect(isLinkedWithPrevious).toBeDefined();
      expect(isLinkedWithPrevious.type).toBe('boolean');
      expect(isLinkedWithPrevious.nullable).toBe(true);
    });
  });

  describe('JSON Schema Compliance', () => {
    it('should use standard JSON Schema types', () => {
      expect(GROQ_RESPONSE_SCHEMA.type).toBe('array');
      expect(itemsSchema.type).toBe('object');
      expect(itemsSchema.properties?.isCommand?.type).toBe('boolean');
      expect(itemsSchema.properties?.confidence?.type).toBe('number');
      expect(itemsSchema.properties?.reason?.type).toBe('string');
      expect(itemsSchema.properties?.command?.type).toBe('string');
    });

    it('should not have TypeBox-specific fields', () => {
      // JSON Schema should not contain TypeBox's [Kind] symbol
      const schemaString = JSON.stringify(GROQ_RESPONSE_SCHEMA);
      expect(schemaString).not.toContain('[Kind]');
      expect(schemaString).not.toContain('Symbol(');
    });

    it('should be valid JSON', () => {
      expect(() => JSON.stringify(GROQ_RESPONSE_SCHEMA)).not.toThrow();
      expect(() =>
        JSON.parse(JSON.stringify(GROQ_RESPONSE_SCHEMA)),
      ).not.toThrow();
    });

    it('should use nullable flag for optional fields', () => {
      const extraction = itemsSchema.properties?.extraction;
      expect(extraction.nullable).toBe(true);

      // All extraction fields should be nullable (flattened from different commands)
      expect(extraction.properties?.entry?.nullable).toBe(true);
      expect(extraction.properties?.stopLoss?.nullable).toBe(true);
      expect(extraction.properties?.entryZone?.nullable).toBe(true);
      expect(extraction.properties?.takeProfits?.nullable).toBe(true);
    });
  });

  describe('Schema Completeness', () => {
    it('should have all extraction fields from all command types', () => {
      const extraction = itemsSchema.properties?.extraction;
      const extractionProps = Object.keys(extraction.properties || {});

      // Should have fields from all command types merged
      expect(extractionProps).toContain('symbol');
      expect(extractionProps).toContain('side');
      expect(extractionProps).toContain('isImmediate');
      expect(extractionProps).toContain('entry');
      expect(extractionProps).toContain('entryZone');
      expect(extractionProps).toContain('stopLoss');
      expect(extractionProps).toContain('takeProfits');
      expect(extractionProps).toContain('meta');
      expect(extractionProps).toContain('validationError');
      expect(extractionProps).toContain('isLinkedWithPrevious');
    });

    it('should have extraction with additionalProperties: false', () => {
      const extraction = itemsSchema.properties?.extraction;
      expect(extraction.additionalProperties).toBe(false);
    });
  });
});
