/**
 * Purpose: Integration tests for BaseRepository CRUD operations.
 * Prerequisites: MongoDB running (via 'npm run stack:up').
 * Core Flow: Create fake model → Test all base repository methods → Verify against real DB → Cleanup.
 */

import { Collection, Document, ObjectId } from 'mongodb';
import { init, close, getSchema } from '../../src/infra/db';
import { BaseRepository } from '../../src/repositories/base.repository';
import { createConfig } from '@telegram-trading-bot-mini/shared/utils';
import {
  fakeLogger,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { withMongoTransaction } from '../../src/infra/transaction';

// Fake model for testing
interface TestEntity extends Document {
  _id?: ObjectId;
  name: string;
  value: number;
  isActive: boolean;
}

// Fake repository extending BaseRepository
class TestRepository extends BaseRepository<TestEntity> {
  protected get collection(): Collection<TestEntity> {
    return getSchema<TestEntity>('test-entities' as any);
  }
}

describe(suiteName(__filename), () => {
  let testRepository: TestRepository;

  beforeAll(async () => {
    try {
      const config = createConfig();
      await init(config, fakeLogger);
      testRepository = new TestRepository();
    } catch (e) {
      console.error(
        'Failed to connect to MongoDB. Make sure it is running.',
        e,
      );
      throw e;
    }
  });

  afterAll(async () => {
    // Cleanup: remove all test entities
    await testRepository.deleteMany({});
    await close();
  });

  afterEach(async () => {
    // Clean up after each test
    await testRepository.deleteMany({});
  });

  describe('create', () => {
    it('should create a new entity and return it with _id', async () => {
      const entity: TestEntity = {
        name: 'Test Entity',
        value: 42,
        isActive: true,
      } as TestEntity;

      const created = await testRepository.create(entity);

      expect(created).toBeDefined();
      expect(created._id).toBeDefined();
      expect(created.name).toBe('Test Entity');
      expect(created.value).toBe(42);
      expect(created.isActive).toBe(true);
    });
  });

  describe('findById', () => {
    it('should find an entity by its ObjectId', async () => {
      const entity: TestEntity = {
        name: 'Find Me',
        value: 100,
        isActive: true,
      } as TestEntity;

      const created = await testRepository.create(entity);
      const found = await testRepository.findById(created._id!.toString());

      expect(found).toBeDefined();
      expect(found?._id?.toString()).toBe(created._id?.toString());
      expect(found?.name).toBe('Find Me');
    });

    it('should return null if entity not found', async () => {
      const fakeId = new ObjectId().toString();
      const found = await testRepository.findById(fakeId);

      expect(found).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should find a single entity matching the filter', async () => {
      await testRepository.create({
        name: 'First',
        value: 1,
        isActive: true,
      } as TestEntity);

      await testRepository.create({
        name: 'Second',
        value: 2,
        isActive: false,
      } as TestEntity);

      const found = await testRepository.findOne({ name: 'Second' } as any);

      expect(found).toBeDefined();
      expect(found?.name).toBe('Second');
      expect(found?.value).toBe(2);
    });

    it('should return null if no match found', async () => {
      const found = await testRepository.findOne({
        name: 'NonExistent',
      } as any);
      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should find all entities when no filter provided', async () => {
      await testRepository.create({
        name: 'Entity 1',
        value: 1,
        isActive: true,
      } as TestEntity);

      await testRepository.create({
        name: 'Entity 2',
        value: 2,
        isActive: true,
      } as TestEntity);

      const all = await testRepository.findAll();

      expect(all).toHaveLength(2);
      expect(all.map((e) => e.name)).toContain('Entity 1');
      expect(all.map((e) => e.name)).toContain('Entity 2');
    });

    it('should find entities matching the filter', async () => {
      await testRepository.create({
        name: 'Active 1',
        value: 1,
        isActive: true,
      } as TestEntity);

      await testRepository.create({
        name: 'Inactive',
        value: 2,
        isActive: false,
      } as TestEntity);

      await testRepository.create({
        name: 'Active 2',
        value: 3,
        isActive: true,
      } as TestEntity);

      const activeEntities = await testRepository.findAll({
        isActive: true,
      } as any);

      expect(activeEntities).toHaveLength(2);
      expect(activeEntities.every((e) => e.isActive)).toBe(true);
    });

    it('should return empty array if no matches', async () => {
      const found = await testRepository.findAll({
        name: 'NonExistent',
      } as any);
      expect(found).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update an entity by id and return true', async () => {
      const created = await testRepository.create({
        name: 'Original',
        value: 10,
        isActive: true,
      } as TestEntity);

      const updated = await testRepository.update(created._id!.toString(), {
        name: 'Updated',
        value: 20,
      });

      expect(updated).toBe(true);

      const found = await testRepository.findById(created._id!.toString());
      expect(found?.name).toBe('Updated');
      expect(found?.value).toBe(20);
      expect(found?.isActive).toBe(true); // Unchanged field
    });

    it('should return false if entity not found', async () => {
      const fakeId = new ObjectId().toString();
      const updated = await testRepository.update(fakeId, { name: 'Updated' });

      expect(updated).toBe(false);
    });
  });

  describe('updateMany', () => {
    it('should update multiple entities matching filter', async () => {
      await testRepository.create({
        name: 'Entity 1',
        value: 1,
        isActive: true,
      } as TestEntity);

      await testRepository.create({
        name: 'Entity 2',
        value: 2,
        isActive: true,
      } as TestEntity);

      await testRepository.create({
        name: 'Entity 3',
        value: 3,
        isActive: false,
      } as TestEntity);

      const count = await testRepository.updateMany(
        { isActive: true } as any,
        { $set: { value: 999 } } as any,
      );

      expect(count).toBe(2);

      const updated = await testRepository.findAll({ value: 999 } as any);
      expect(updated).toHaveLength(2);
    });
  });

  describe('delete', () => {
    it('should delete an entity by id and return true', async () => {
      const created = await testRepository.create({
        name: 'To Delete',
        value: 1,
        isActive: true,
      } as TestEntity);

      const deleted = await testRepository.delete(created._id!.toString());

      expect(deleted).toBe(true);

      const found = await testRepository.findById(created._id!.toString());
      expect(found).toBeNull();
    });

    it('should return false if entity not found', async () => {
      const fakeId = new ObjectId().toString();
      const deleted = await testRepository.delete(fakeId);

      expect(deleted).toBe(false);
    });
  });

  describe('deleteMany', () => {
    it('should delete multiple entities matching filter', async () => {
      await testRepository.create({
        name: 'Delete 1',
        value: 1,
        isActive: true,
      } as TestEntity);

      await testRepository.create({
        name: 'Delete 2',
        value: 2,
        isActive: true,
      } as TestEntity);

      await testRepository.create({
        name: 'Keep',
        value: 3,
        isActive: false,
      } as TestEntity);

      const count = await testRepository.deleteMany({ isActive: true } as any);

      expect(count).toBe(2);

      const remaining = await testRepository.findAll();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].name).toBe('Keep');
    });
  });

  describe('count', () => {
    it('should count all entities when no filter provided', async () => {
      await testRepository.create({
        name: 'Entity 1',
        value: 1,
        isActive: true,
      } as TestEntity);

      await testRepository.create({
        name: 'Entity 2',
        value: 2,
        isActive: true,
      } as TestEntity);

      const count = await testRepository.count();

      expect(count).toBe(2);
    });

    it('should count entities matching filter', async () => {
      await testRepository.create({
        name: 'Active 1',
        value: 1,
        isActive: true,
      } as TestEntity);

      await testRepository.create({
        name: 'Inactive',
        value: 2,
        isActive: false,
      } as TestEntity);

      await testRepository.create({
        name: 'Active 2',
        value: 3,
        isActive: true,
      } as TestEntity);

      const count = await testRepository.count({ isActive: true } as any);

      expect(count).toBe(2);
    });
  });

  describe('exists', () => {
    it('should return true if entity exists', async () => {
      await testRepository.create({
        name: 'Exists',
        value: 1,
        isActive: true,
      } as TestEntity);

      const exists = await testRepository.exists({ name: 'Exists' } as any);

      expect(exists).toBe(true);
    });

    it('should return false if entity does not exist', async () => {
      const exists = await testRepository.exists({
        name: 'NonExistent',
      } as any);

      expect(exists).toBe(false);
    });
  });

  describe('Transaction Support (Session Parameter)', () => {
    it('should create entity within a transaction', async () => {
      let createdEntity: TestEntity | null = null;

      await withMongoTransaction(async (session) => {
        const entity: TestEntity = {
          name: 'Transaction Test',
          value: 100,
          isActive: true,
        } as TestEntity;

        createdEntity = await testRepository.create(entity, session);
        expect(createdEntity._id).toBeDefined();
      });

      // Verify entity was committed
      const found = await testRepository.findById(
        createdEntity!._id!.toString(),
      );
      expect(found?.name).toBe('Transaction Test');
    });

    it('should rollback create on transaction failure', async () => {
      let entityId: string | undefined;

      try {
        await withMongoTransaction(async (session) => {
          const entity: TestEntity = {
            name: 'Rollback Test',
            value: 200,
            isActive: true,
          } as TestEntity;

          const created = await testRepository.create(entity, session);
          entityId = created._id!.toString();

          // Force transaction to fail
          throw new Error('Simulated error');
        });
      } catch (error) {
        // Expected error
      }

      // Verify entity was NOT committed
      const found = await testRepository.findById(entityId!);
      expect(found).toBeNull();
    });

    it('should update entity within a transaction', async () => {
      const created = await testRepository.create({
        name: 'Update Transaction',
        value: 50,
        isActive: true,
      } as TestEntity);

      await withMongoTransaction(async (session) => {
        const updated = await testRepository.update(
          created._id!.toString(),
          { value: 150 },
          session,
        );
        expect(updated).toBe(true);
      });

      const found = await testRepository.findById(created._id!.toString());
      expect(found?.value).toBe(150);
    });

    it('should find entity within transaction (consistent snapshot)', async () => {
      const created = await testRepository.create({
        name: 'Find Transaction',
        value: 75,
        isActive: true,
      } as TestEntity);

      await withMongoTransaction(async (session) => {
        const found = await testRepository.findById(
          created._id!.toString(),
          session,
        );
        expect(found?.name).toBe('Find Transaction');

        const foundOne = await testRepository.findOne(
          { name: 'Find Transaction' } as any,
          session,
        );
        expect(foundOne?.value).toBe(75);

        const foundAll = await testRepository.findAll(
          { isActive: true } as any,
          session,
        );
        expect(foundAll.length).toBeGreaterThan(0);
      });
    });

    it('should perform atomic read-modify-write within transaction', async () => {
      const created = await testRepository.create({
        name: 'Atomic Test',
        value: 100,
        isActive: true,
      } as TestEntity);

      await withMongoTransaction(async (session) => {
        // Read
        const found = await testRepository.findById(
          created._id!.toString(),
          session,
        );
        expect(found).toBeDefined();

        // Modify
        const newValue = found!.value + 50;

        // Write
        await testRepository.update(
          created._id!.toString(),
          { value: newValue },
          session,
        );
      });

      const final = await testRepository.findById(created._id!.toString());
      expect(final?.value).toBe(150);
    });

    it('should delete entity within a transaction', async () => {
      const created = await testRepository.create({
        name: 'Delete Transaction',
        value: 25,
        isActive: true,
      } as TestEntity);

      await withMongoTransaction(async (session) => {
        const deleted = await testRepository.delete(
          created._id!.toString(),
          session,
        );
        expect(deleted).toBe(true);
      });

      const found = await testRepository.findById(created._id!.toString());
      expect(found).toBeNull();
    });

    it('should count entities within transaction', async () => {
      await testRepository.create({
        name: 'Count 1',
        value: 1,
        isActive: true,
      } as TestEntity);

      await testRepository.create({
        name: 'Count 2',
        value: 2,
        isActive: true,
      } as TestEntity);

      await withMongoTransaction(async (session) => {
        const count = await testRepository.count(
          { isActive: true } as any,
          session,
        );
        expect(count).toBeGreaterThanOrEqual(2);

        const exists = await testRepository.exists(
          { name: 'Count 1' } as any,
          session,
        );
        expect(exists).toBe(true);
      });
    });
  });
});
