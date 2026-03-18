import { UserSettings } from '../../appwrite/models';

export type SettingsRepository = {
  getSettings(): Promise<UserSettings>;
  saveSettings(settings: UserSettings): Promise<UserSettings>;
};
