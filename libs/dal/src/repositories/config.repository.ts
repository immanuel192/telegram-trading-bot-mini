import { Collection } from 'mongodb';
import { Config } from '../models/config.model';
import { COLLECTIONS, getSchema } from '../infra/db';
import { BaseRepository } from './base.repository';

export class ConfigRepository extends BaseRepository<Config> {
  protected get collection(): Collection<Config> {
    return getSchema<Config>(COLLECTIONS.CONFIGS);
  }

  async findByKey(key: string): Promise<Config | null> {
    return this.findOne({ key });
  }

  async getValue(key: string): Promise<string | null> {
    const config = await this.findByKey(key);
    return config ? config.value : null;
  }

  async setValue(key: string, value: string): Promise<void> {
    await this.collection.updateOne(
      { key },
      { $set: { value } },
      { upsert: true }
    );
  }
}

export const configRepository = new ConfigRepository();
