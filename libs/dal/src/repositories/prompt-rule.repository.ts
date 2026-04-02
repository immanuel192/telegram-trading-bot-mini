/**
 * Purpose: Provide CRUD operations for the PromptRule entity.
 * Exports: PromptRuleRepository class and promptRuleRepository singleton instance.
 * Core Flow: Extends BaseRepository with PromptRule-specific query methods.
 */

import { Collection } from 'mongodb';
import { PromptRule } from '../models/prompt-rule.model';
import { COLLECTIONS, getSchema } from '../infra/db';
import { BaseRepository } from './base.repository';

export class PromptRuleRepository extends BaseRepository<PromptRule> {
  protected get collection(): Collection<PromptRule> {
    return getSchema<PromptRule>(COLLECTIONS.PROMPT_RULE);
  }

  /**
   * Find a prompt rule by its promptId
   * @param promptId - The unique prompt identifier
   * @returns The found prompt rule or null
   */
  async findByPromptId(promptId: string): Promise<PromptRule | null> {
    return this.findOne({ promptId });
  }

  /**
   * Find all prompt rules ordered by creation date (newest first)
   * @returns Array of all prompt rules
   */
  override async findAll(): Promise<PromptRule[]> {
    return this.collection
      .find({})
      .sort({ createdAt: -1 })
      .toArray() as Promise<PromptRule[]>;
  }
}

export const promptRuleRepository = new PromptRuleRepository();
