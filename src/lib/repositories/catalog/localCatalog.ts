import { CatalogItemProjection } from '../../appwrite/models';
import { listNormalizedItems, PipelineDatabase } from '../../pipeline/sqlite/db';
import { CatalogRepository } from './types';

export class LocalCatalogRepository implements CatalogRepository {
  constructor(private readonly db: PipelineDatabase) {}

  async upsertItems(): Promise<void> {
    throw new Error('LocalCatalogRepository is read-only');
  }

  async listItems(limit = 100): Promise<CatalogItemProjection[]> {
    return listNormalizedItems(this.db, limit).map((record) => JSON.parse(record.normalizedJson) as CatalogItemProjection);
  }
}
