/**
 * Integration tests for Redis stream group utilities
 * Requires Redis to be running (npm run stack:up)
 */

import Redis from 'ioredis';
import {
  suiteName,
  getTestRedisUrl,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  createConsumerGroup,
  deleteConsumerGroup,
  deleteStream,
} from '../../src/stream/redis-stream-group';

// Helper to parse XINFO GROUPS response (Upstash returns arrays, not objects)
function parseGroupsInfo(result: any[]): Array<{ name: string }> {
  return result.map((group) => {
    // group is an array like: ["name", "test-group", "consumers", 0, ...]
    const nameIndex = group.indexOf('name');
    return {
      name: nameIndex >= 0 ? group[nameIndex + 1] : undefined,
    };
  });
}

describe(suiteName(__filename), () => {
  let redis: Redis;
  const testStream = 'test-stream-group';
  const testGroup = 'test-group';

  beforeAll(() => {
    redis = new Redis(getTestRedisUrl());
  });

  afterEach(async () => {
    // Clean up: delete test stream
    await deleteStream(redis, testStream);
  });

  describe('createConsumerGroup', () => {
    it('should create a new consumer group', async () => {
      await expect(
        createConsumerGroup(redis, testStream, testGroup, '0'),
      ).resolves.not.toThrow();

      // Verify group was created
      const result = await (redis as any).call('XINFO', 'GROUPS', testStream);
      const groups = parseGroupsInfo(result);
      expect(groups).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: testGroup,
          }),
        ]),
      );
    });

    it('should create stream if it does not exist (MKSTREAM)', async () => {
      // Ensure stream doesn't exist
      await deleteStream(redis, testStream);

      await createConsumerGroup(redis, testStream, testGroup, '0');

      // Verify stream was created
      const exists = await redis.exists(testStream);
      expect(exists).toBe(1);
    });

    it('should not throw error if group already exists', async () => {
      // Create group first time
      await createConsumerGroup(redis, testStream, testGroup, '0');

      // Create same group again - should not throw
      await expect(
        createConsumerGroup(redis, testStream, testGroup, '0'),
      ).resolves.not.toThrow();
    });

    it('should create group with startId "$" for new messages only', async () => {
      await expect(
        createConsumerGroup(redis, testStream, `${testGroup}-new`, '$'),
      ).resolves.not.toThrow();

      const result = await (redis as any).call('XINFO', 'GROUPS', testStream);
      const groups = parseGroupsInfo(result);
      expect(groups).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: `${testGroup}-new`,
          }),
        ]),
      );
    });

    it('should create multiple groups on same stream', async () => {
      await createConsumerGroup(redis, testStream, `${testGroup}-1`, '0');
      await createConsumerGroup(redis, testStream, `${testGroup}-2`, '0');

      const result = await (redis as any).call('XINFO', 'GROUPS', testStream);
      const groups = parseGroupsInfo(result);
      expect(groups).toHaveLength(2);
      expect(groups).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: `${testGroup}-1` }),
          expect.objectContaining({ name: `${testGroup}-2` }),
        ]),
      );
    });
  });

  describe('deleteConsumerGroup', () => {
    beforeEach(async () => {
      // Create a group to delete
      await createConsumerGroup(redis, testStream, testGroup, '0');
    });

    it('should delete an existing consumer group', async () => {
      await expect(
        deleteConsumerGroup(redis, testStream, testGroup),
      ).resolves.not.toThrow();

      // Verify group was deleted
      const result = await (redis as any).call('XINFO', 'GROUPS', testStream);
      expect(result).toEqual([]);
    });

    it('should not throw error if group does not exist', async () => {
      await expect(
        deleteConsumerGroup(redis, testStream, 'non-existent-group'),
      ).resolves.not.toThrow();
    });

    it('should not throw error if stream does not exist', async () => {
      await expect(
        deleteConsumerGroup(redis, 'non-existent-stream', testGroup),
      ).resolves.not.toThrow();
    });

    it('should delete specific group without affecting others', async () => {
      // Create multiple groups
      await createConsumerGroup(redis, testStream, `${testGroup}-1`, '0');
      await createConsumerGroup(redis, testStream, `${testGroup}-2`, '0');

      // Delete one group
      await deleteConsumerGroup(redis, testStream, `${testGroup}-1`);

      // Verify two groups remain (testGroup and testGroup-2)
      const result = await (redis as any).call('XINFO', 'GROUPS', testStream);
      const groups = parseGroupsInfo(result);
      expect(groups.length).toBeGreaterThanOrEqual(2);
      // Should not contain the deleted group
      const groupNames = groups.map((g) => g.name);
      expect(groupNames).not.toContain(`${testGroup}-1`);
      expect(groupNames).toContain(testGroup);
      expect(groupNames).toContain(`${testGroup}-2`);
    });
  });

  describe('group lifecycle', () => {
    it('should support create-delete-create cycle', async () => {
      // Create
      await createConsumerGroup(redis, testStream, testGroup, '0');
      let result = await (redis as any).call('XINFO', 'GROUPS', testStream);
      expect(result).toHaveLength(1);

      // Delete
      await deleteConsumerGroup(redis, testStream, testGroup);
      result = await (redis as any).call('XINFO', 'GROUPS', testStream);
      expect(result).toEqual([]);

      // Create again
      await createConsumerGroup(redis, testStream, testGroup, '0');
      result = await (redis as any).call('XINFO', 'GROUPS', testStream);
      expect(result).toHaveLength(1);
    });
  });

  describe('deleteStream', () => {
    it('should delete stream and all groups', async () => {
      await createConsumerGroup(redis, testStream, testGroup, '0');
      await deleteStream(redis, testStream);
      const exists = await redis.exists(testStream);
      expect(exists).toBe(0);
    });

    it('should not throw if stream does not exist', async () => {
      await expect(
        deleteStream(redis, 'non-existent-stream'),
      ).resolves.not.toThrow();
    });
  });
});
