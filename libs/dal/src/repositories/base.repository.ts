/**
 * Purpose: Provide base CRUD operations for all MongoDB repositories.
 * Exports: BaseRepository abstract class with common database operations.
 * Core Flow: Generic repository pattern with type-safe MongoDB operations for entities with ObjectId.
 */

import {
  Collection,
  Document,
  ObjectId,
  Filter,
  UpdateFilter,
  ClientSession,
} from 'mongodb';

/**
 * Base repository providing common CRUD operations for MongoDB collections
 * @template T - The entity type extending MongoDB Document
 */
export abstract class BaseRepository<T extends Document> {
  /**
   * Get the MongoDB collection for this repository
   * Must be implemented by derived classes
   */
  protected abstract get collection(): Collection<T>;

  /**
   * Create a new document in the collection
   * @param entity - The entity to create
   * @param session - Optional MongoDB session for transaction support
   * @returns The created entity with _id populated
   */
  async create(entity: T, session?: ClientSession): Promise<T> {
    const result = await this.collection.insertOne(entity as any, { session });
    return { ...entity, _id: result.insertedId } as T;
  }

  /**
   * Find a document by its MongoDB ObjectId
   * @param id - The ObjectId as string
   * @param session - Optional MongoDB session for transaction support
   * @returns The found entity or null
   */
  async findById(id: string, session?: ClientSession): Promise<T | null> {
    return this.collection.findOne(
      {
        _id: new ObjectId(id),
      } as Filter<T>,
      { session }
    ) as Promise<T | null>;
  }

  /**
   * Find a single document matching the filter
   * @param filter - MongoDB filter query
   * @param session - Optional MongoDB session for transaction support
   * @returns The found entity or null
   */
  async findOne(filter: Filter<T>, session?: ClientSession): Promise<T | null> {
    return this.collection.findOne(filter, { session }) as Promise<T | null>;
  }

  /**
   * Find all documents matching the filter
   * @param filter - MongoDB filter query (optional, defaults to all documents)
   * @param session - Optional MongoDB session for transaction support
   * @param projection - Optional MongoDB projection to include/exclude fields (e.g., { history: 0 } to exclude history)
   * @returns Array of matching entities
   */
  async findAll(
    filter: Filter<T> = {},
    session?: ClientSession,
    projection?: Document
  ): Promise<T[]> {
    return this.collection
      .find(filter, { session, projection })
      .toArray() as Promise<T[]>;
  }

  /**
   * Update a document by its MongoDB ObjectId
   * @param id - The ObjectId as string
   * @param update - Partial entity with fields to update
   * @param session - Optional MongoDB session for transaction support
   * @returns True if document was updated, false if not found
   */
  async update(
    id: string,
    update: Partial<T>,
    session?: ClientSession
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: new ObjectId(id) } as Filter<T>,
      { $set: update } as UpdateFilter<T>,
      { session }
    );
    return result.modifiedCount > 0;
  }

  /**
   * Update a single document matching the filter
   * @param filter - MongoDB filter query
   * @param update - MongoDB update operations (e.g., { $set: {...}, $push: {...} })
   * @param session - Optional MongoDB session for transaction support
   * @returns True if document was updated, false if not found
   */
  async updateOne(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    session?: ClientSession
  ): Promise<boolean> {
    const result = await this.collection.updateOne(filter, update, { session });
    return result.modifiedCount > 0;
  }

  /**
   * Update documents matching the filter
   * @param filter - MongoDB filter query
   * @param update - Update operations
   * @param session - Optional MongoDB session for transaction support
   * @returns Number of documents modified
   */
  async updateMany(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    session?: ClientSession
  ): Promise<number> {
    const result = await this.collection.updateMany(filter, update, {
      session,
    });
    return result.modifiedCount;
  }

  /**
   * Delete a document by its MongoDB ObjectId
   * @param id - The ObjectId as string
   * @param session - Optional MongoDB session for transaction support
   * @returns True if document was deleted, false if not found
   */
  async delete(id: string, session?: ClientSession): Promise<boolean> {
    const result = await this.collection.deleteOne(
      {
        _id: new ObjectId(id),
      } as Filter<T>,
      { session }
    );
    return result.deletedCount > 0;
  }

  /**
   * Delete documents matching the filter
   * @param filter - MongoDB filter query
   * @param session - Optional MongoDB session for transaction support
   * @returns Number of documents deleted
   */
  async deleteMany(
    filter: Filter<T>,
    session?: ClientSession
  ): Promise<number> {
    const result = await this.collection.deleteMany(filter, { session });
    return result.deletedCount;
  }

  /**
   * Count documents matching the filter
   * @param filter - MongoDB filter query (optional, defaults to all documents)
   * @param session - Optional MongoDB session for transaction support
   * @returns Number of matching documents
   */
  async count(
    filter: Filter<T> = {},
    session?: ClientSession
  ): Promise<number> {
    return this.collection.countDocuments(filter, { session });
  }

  /**
   * Check if any documents match the filter
   * @param filter - MongoDB filter query
   * @param session - Optional MongoDB session for transaction support
   * @returns True if at least one document exists
   */
  async exists(filter: Filter<T>, session?: ClientSession): Promise<boolean> {
    const count = await this.collection.countDocuments(filter, {
      limit: 1,
      session,
    });
    return count > 0;
  }
}
