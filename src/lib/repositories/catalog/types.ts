import { CatalogItemProjection } from '../../appwrite/models';

export type CatalogRepository = {
  upsertItems(items: CatalogItemProjection[]): Promise<void>;
  listItems(limit?: number): Promise<CatalogItemProjection[]>;
};
