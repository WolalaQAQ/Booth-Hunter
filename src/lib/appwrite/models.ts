export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type ChatThread = {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export type UserSettings = {
  displayName?: string;
  language?: string;
  providerLabel?: string;
  baseUrl: string;
  model: string;
  temperature: number;
};

export type AppUser = {
  id: string;
  email: string;
  name: string;
  prefs: Record<string, unknown>;
};

export type CatalogImageProjection = {
  imageIndex: number;
  sourceUrl: string;
  previewUrl?: string;
  width?: number;
  height?: number;
};

export type CatalogItemProjection = {
  itemId: string;
  title: string;
  description: string;
  normalizedText: string;
  priceText: string;
  priceJpy: number | null;
  shopName: string;
  shopUrl?: string;
  itemUrl: string;
  categoryName: string;
  parentCategoryName: string;
  tags: string[];
  images: CatalogImageProjection[];
  isAdult: boolean;
  publishedAt?: string;
  contentHash: string;
};
