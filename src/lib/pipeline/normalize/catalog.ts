import crypto from 'node:crypto';

import { CatalogImageProjection, CatalogItemProjection } from '../../appwrite/models';

function parsePriceJpy(priceText: string): number | null {
  const match = priceText.match(/([0-9,]+)/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function normalizeTags(tags: any[]): string[] {
  return (tags || []).map((tag) => String(tag?.name || '').trim()).filter(Boolean);
}

function normalizeImages(images: any[]): CatalogImageProjection[] {
  return (images || []).map((image, index) => ({
    imageIndex: index,
    sourceUrl: String(image?.original || image?.resized || '').trim(),
    previewUrl: String(image?.resized || image?.original || '').trim() || undefined,
  })).filter((image) => !!image.sourceUrl);
}

function buildNormalizedText(item: Omit<CatalogItemProjection, 'contentHash'>): string {
  return [
    item.title,
    item.description,
    item.categoryName,
    item.parentCategoryName,
    item.shopName,
    item.tags.join(' '),
    item.images.map((image) => image.sourceUrl).join(' '),
  ].filter(Boolean).join('\n');
}

export function normalizeBoothItem(raw: any): CatalogItemProjection {
  const base: Omit<CatalogItemProjection, 'contentHash'> = {
    itemId: String(raw?.id || '').trim(),
    title: String(raw?.name || '').trim(),
    description: String(raw?.description || '').trim(),
    normalizedText: '',
    priceText: String(raw?.price || '').trim(),
    priceJpy: parsePriceJpy(String(raw?.price || '')),
    shopName: String(raw?.shop?.name || '').trim(),
    shopUrl: String(raw?.shop?.url || '').trim() || undefined,
    itemUrl: String(raw?.url || '').trim(),
    categoryName: String(raw?.category?.name || '').trim(),
    parentCategoryName: String(raw?.category?.parent?.name || '').trim(),
    tags: normalizeTags(raw?.tags || []),
    images: normalizeImages(raw?.images || []),
    isAdult: !!raw?.is_adult,
    publishedAt: String(raw?.published_at || '').trim() || undefined,
  };

  base.normalizedText = buildNormalizedText(base);
  const contentHash = crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex');

  return {
    ...base,
    contentHash,
  };
}
