import { load } from 'cheerio';

export type BoothListingItem = {
  itemId: string;
  itemUrl: string;
  title: string;
  shopName: string;
  priceText: string;
  categoryName: string;
  previewImageUrls: string[];
  listingPage: number;
};

export function buildBrowseUrl(page = 1): string {
  return `https://booth.pm/en/browse/3D%20Models?page=${page}`;
}

export function buildItemJsonUrl(itemId: string): string {
  return `https://booth.pm/en/items/${encodeURIComponent(itemId)}.json`;
}

export function parseBrowseItems(html: string, listingPage = 1): BoothListingItem[] {
  const $ = load(html);
  return $('.item-card').map((_, node) => {
    const card = $(node);
    const itemId = (card.attr('data-product-id') || '').trim();
    const title = card.find('.item-card__title a').first().text().trim();
    const itemUrl = card.find('.item-card__title a').first().attr('href') || card.find('.item-card__thumbnail-image').first().attr('href') || '';
    const shopName = card.find('.item-card__shop-name').first().text().trim();
    const priceText = card.find('.price').first().text().trim();
    const categoryName = card.find('.item-card__category-anchor').first().text().trim();
    const previewImageUrls = card.find('.item-card__thumbnail-image').map((__, image) => $(image).attr('data-original') || '').get().filter(Boolean);

    return {
      itemId,
      itemUrl: itemUrl.startsWith('http') ? itemUrl : `https://booth.pm${itemUrl}`,
      title,
      shopName,
      priceText,
      categoryName,
      previewImageUrls,
      listingPage,
    };
  }).get().filter((item) => !!item.itemId);
}

export function parseTotalCount(html: string): number | null {
  const direct = html.match(/There are\s+([0-9,]+)\s+items about 3D Models/i) || html.match(/Results\s+([0-9,]+)\s+件/i);
  if (!direct) return null;
  return Number((direct[1] || '').replace(/,/g, '')) || null;
}

export async function fetchBrowsePage(page = 1, fetcher: typeof fetch = fetch): Promise<{ items: BoothListingItem[]; totalCount: number | null; html: string }> {
  const response = await fetcher(buildBrowseUrl(page), {
    headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch BOOTH browse page ${page}: ${response.status}`);
  }
  const html = await response.text();
  return {
    items: parseBrowseItems(html, page),
    totalCount: parseTotalCount(html),
    html,
  };
}

export async function fetchItemJson(itemId: string, fetcher: typeof fetch = fetch): Promise<any> {
  const response = await fetcher(buildItemJsonUrl(itemId), {
    headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch BOOTH item ${itemId}: ${response.status}`);
  }
  return response.json();
}
