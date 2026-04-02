/**
 * Purpose: Define the PromptRule entity for storing custom AI prompts for message translation.
 * Exports: PromptRule interface.
 * Core Flow: Extends MongoDB Document, includes single system prompt for combined classification and extraction.
 */

import { Document, ObjectId } from 'mongodb';

/**
 * Data Model for PromptRule
 * Stores custom AI prompts for translating Telegram messages into trading commands
 * Uses single-step pipeline with combined classification and extraction
 */
export interface PromptRule extends Document {
  _id?: ObjectId;
  /**
   * Unique identifier for this prompt rule
   * Used to reference this prompt from Account entities
   */
  promptId: string;
  /**
   * Human-readable name for this prompt rule
   */
  name: string;
  /**
   * Optional description explaining the purpose or use case of this prompt
   */
  description?: string;
  /**
   * System prompt for single-step AI pipeline
   * Combines classification and extraction instructions
   * Guides the AI to both identify commands and extract structured trading data in one call
   * Should return JSON with both classification and extraction fields
   */
  systemPrompt: string;
  /**
   * Timestamp when this prompt rule was created
   */
  createdAt: Date;
  /**
   * Timestamp when this prompt rule was last updated
   */
  updatedAt: Date;
}
