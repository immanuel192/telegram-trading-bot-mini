/**
 * Purpose: Define the Config entity for storing dynamic application configuration.
 * Exports: Config (main entity).
 * Core Flow: Extends MongoDB Document, stores key-value pairs for runtime settings.
 */

import { Document, ObjectId } from 'mongodb';

export interface Config extends Document {
  _id?: ObjectId;
  /**
   * Unique key for the configuration item (e.g., 'telegram-session')
   */
  key: string;
  /**
   * Value of the configuration item
   */
  value: string;
}
