/**
 * Purpose: Integration tests for ConfigRepository operations.
 * Prerequisites: MongoDB running (via 'npm run stack:up').
 * Core Flow: Test config CRUD operations → Verify key-value storage → Cleanup.
 */

import { configRepository } from '../../src/repositories/config.repository';
import { Config } from '../../src/models/config.model';
import {
  suiteName,
  setupDb,
  teardownDb,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';

describe(suiteName(__filename), () => {
  beforeAll(async () => {
    await setupDb();
  });

  afterAll(async () => {
    await teardownDb();
  });

  afterEach(async () => {
    await cleanupDb(null, [COLLECTIONS.CONFIGS]);
  });

  describe('findByKey', () => {
    it('should find a config by key', async () => {
      const config: Config = {
        key: 'test-key',
        value: 'test-value',
      };

      await configRepository.create(config);
      const found = await configRepository.findByKey('test-key');

      expect(found).toBeDefined();
      expect(found?.key).toBe('test-key');
      expect(found?.value).toBe('test-value');
    });

    it('should return null if key not found', async () => {
      const found = await configRepository.findByKey('non-existent-key');
      expect(found).toBeNull();
    });
  });

  describe('getValue', () => {
    it('should return the value for an existing key', async () => {
      const config: Config = {
        key: 'telegram-session',
        value: 'session-string-123',
      };

      await configRepository.create(config);
      const value = await configRepository.getValue('telegram-session');

      expect(value).toBe('session-string-123');
    });

    it('should return null for non-existent key', async () => {
      const value = await configRepository.getValue('non-existent-key');
      expect(value).toBeNull();
    });
  });

  describe('setValue', () => {
    it('should create a new config if key does not exist', async () => {
      await configRepository.setValue('new-key', 'new-value');

      const found = await configRepository.findByKey('new-key');
      expect(found).toBeDefined();
      expect(found?.value).toBe('new-value');
    });

    it('should update an existing config if key exists', async () => {
      const config: Config = {
        key: 'existing-key',
        value: 'old-value',
      };

      await configRepository.create(config);
      await configRepository.setValue('existing-key', 'new-value');

      const found = await configRepository.findByKey('existing-key');
      expect(found).toBeDefined();
      expect(found?.value).toBe('new-value');
    });

    it('should handle multiple setValue operations', async () => {
      await configRepository.setValue('key1', 'value1');
      await configRepository.setValue('key2', 'value2');
      await configRepository.setValue('key3', 'value3');

      const value1 = await configRepository.getValue('key1');
      const value2 = await configRepository.getValue('key2');
      const value3 = await configRepository.getValue('key3');

      expect(value1).toBe('value1');
      expect(value2).toBe('value2');
      expect(value3).toBe('value3');
    });

    it('should handle long values', async () => {
      const longValue = 'a'.repeat(10000);
      await configRepository.setValue('long-key', longValue);

      const value = await configRepository.getValue('long-key');
      expect(value).toBe(longValue);
    });

    it('should handle special characters in values', async () => {
      const specialValue = '{"json": "value", "nested": {"key": "val"}}';
      await configRepository.setValue('json-key', specialValue);

      const value = await configRepository.getValue('json-key');
      expect(value).toBe(specialValue);
    });
  });

  describe('BaseRepository methods', () => {
    it('should support findById', async () => {
      const config: Config = {
        key: 'find-by-id-key',
        value: 'find-by-id-value',
      };

      const created = await configRepository.create(config);
      const found = await configRepository.findById(created._id!.toString());

      expect(found).toBeDefined();
      expect(found?.key).toBe('find-by-id-key');
    });

    it('should support findAll', async () => {
      await configRepository.create({ key: 'key1', value: 'value1' });
      await configRepository.create({ key: 'key2', value: 'value2' });

      const all = await configRepository.findAll();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('should support update', async () => {
      const config: Config = {
        key: 'update-key',
        value: 'original-value',
      };

      const created = await configRepository.create(config);
      const updated = await configRepository.update(created._id!.toString(), {
        value: 'updated-value',
      });

      expect(updated).toBe(true);

      const found = await configRepository.findByKey('update-key');
      expect(found?.value).toBe('updated-value');
    });

    it('should support delete', async () => {
      const config: Config = {
        key: 'delete-key',
        value: 'delete-value',
      };

      const created = await configRepository.create(config);
      const deleted = await configRepository.delete(created._id!.toString());

      expect(deleted).toBe(true);

      const found = await configRepository.findByKey('delete-key');
      expect(found).toBeNull();
    });
  });
});
