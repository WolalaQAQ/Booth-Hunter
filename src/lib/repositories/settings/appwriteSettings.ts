import { Account } from 'appwrite';

import { UserSettings } from '../../appwrite/models';
import { SettingsRepository } from './types';

export const DEFAULT_USER_SETTINGS: UserSettings = {
  displayName: '',
  language: 'zh-CN',
  providerLabel: 'OpenAI-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  temperature: 0.4,
};

const PREF_KEY = 'boothHunterSettings';

function normalizeSettings(input: Partial<UserSettings> | undefined): UserSettings {
  return {
    ...DEFAULT_USER_SETTINGS,
    ...(input || {}),
    baseUrl: (input?.baseUrl || DEFAULT_USER_SETTINGS.baseUrl).trim(),
    model: (input?.model || DEFAULT_USER_SETTINGS.model).trim(),
    temperature: Number.isFinite(input?.temperature as number)
      ? Number(input?.temperature)
      : DEFAULT_USER_SETTINGS.temperature,
  };
}

export class AppwriteSettingsRepository implements SettingsRepository {
  constructor(private readonly account: Account) {}

  async getSettings(): Promise<UserSettings> {
    const user = await this.account.get();
    return normalizeSettings((user.prefs || {})[PREF_KEY] as Partial<UserSettings> | undefined);
  }

  async saveSettings(settings: UserSettings): Promise<UserSettings> {
    const user = await this.account.get();
    const next = normalizeSettings(settings);
    const prefs = {
      ...(user.prefs || {}),
      [PREF_KEY]: next,
      displayName: next.displayName || user.name || '',
      language: next.language || 'zh-CN',
    };
    await this.account.updatePrefs(prefs);
    return next;
  }
}
