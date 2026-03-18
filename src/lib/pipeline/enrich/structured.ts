export type StructuredSignals = {
  parts: string[];
  styles: string[];
  compatibilityHints: string[];
  keywordDigest: string[];
};

const PART_PATTERNS: Record<string, RegExp[]> = {
  avatar: [/avatar/i, /character/i, /アバター/, /モデル/],
  outfit: [/outfit/i, /dress/i, /clothing/i, /衣装/, /服/, /メイド/],
  accessory: [/accessor/i, /bag/i, /hat/i, /hair accessory/i, /アクセサ/],
  prop: [/prop/i, /tool/i, /pose/i, /weapon/i, /小物/, /ツール/],
  texture: [/texture/i, /material/i, /テクスチャ/],
  motion: [/motion/i, /animation/i, /pose/i, /モーション/],
  world: [/world/i, /environment/i, /背景/],
};

const STYLE_PATTERNS: Record<string, RegExp[]> = {
  maid: [/maid/i, /メイド/],
  cyber: [/cyber/i, /サイバー/],
  gothic: [/gothic/i, /ゴシック/],
  cute: [/cute/i, /かわいい/, /可愛い/],
  military: [/military/i, /ミリタリー/],
  japanese: [/japanese/i, /和風/, /着物/],
  casual: [/casual/i, /カジュアル/],
  fantasy: [/fantasy/i, /ファンタジー/],
};

const COMPATIBILITY_PATTERNS: Record<string, RegExp[]> = {
  VRChat: [/vrchat/i, /vrc/i],
  ModularAvatar: [/modular\s*avatar/i, /modularavatar/i, /ma\b/i],
  lilToon: [/liltoon/i],
  Unity: [/unity/i],
  VCC: [/vcc/i, /creator companion/i],
};

function collectMatches(patternMap: Record<string, RegExp[]>, corpus: string): string[] {
  const matched = new Set<string>();
  for (const [label, patterns] of Object.entries(patternMap)) {
    if (patterns.some((pattern) => pattern.test(corpus))) {
      matched.add(label);
    }
  }
  return Array.from(matched);
}

function collectKeywordDigest(corpus: string): string[] {
  return Array.from(new Set(
    corpus
      .split(/[^\p{L}\p{N}_+-]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .slice(0, 24)
  ));
}

export function extractStructuredSignals(input: {
  title: string;
  description: string;
  tags: string[];
  captions: string[];
  ocrTexts: string[];
}): StructuredSignals {
  const corpus = [input.title, input.description, input.tags.join(' '), input.captions.join(' '), input.ocrTexts.join(' ')].join('\n');
  return {
    parts: collectMatches(PART_PATTERNS, corpus),
    styles: collectMatches(STYLE_PATTERNS, corpus),
    compatibilityHints: collectMatches(COMPATIBILITY_PATTERNS, corpus),
    keywordDigest: collectKeywordDigest(corpus),
  };
}
