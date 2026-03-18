export type CaptionInput = {
  itemTitle: string;
  categoryName: string;
  tags: string[];
  imageIndex: number;
};

export type CaptionProvider = {
  caption(input: CaptionInput): Promise<string>;
};

export class HeuristicCaptionProvider implements CaptionProvider {
  async caption(input: CaptionInput): Promise<string> {
    const tags = input.tags.slice(0, 4).join(', ');
    return [
      `Image ${input.imageIndex + 1} for ${input.itemTitle || 'BOOTH item'}.`,
      input.categoryName ? `Category: ${input.categoryName}.` : '',
      tags ? `Tags: ${tags}.` : '',
    ].filter(Boolean).join(' ');
  }
}

export async function generateCaption(input: CaptionInput, provider: CaptionProvider = new HeuristicCaptionProvider()): Promise<string> {
  return provider.caption(input);
}
