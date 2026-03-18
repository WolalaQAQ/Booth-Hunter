import { Account, Client, Databases } from 'appwrite';

import { AppwriteClientConfig, getBrowserAppwriteConfig } from './config';

export type BrowserAppwriteServices = {
  config: AppwriteClientConfig;
  client: Client;
  account: Account;
  databases: Databases;
};

export function createBrowserAppwriteServices(config: AppwriteClientConfig): BrowserAppwriteServices {
  const client = new Client();
  client.setEndpoint(config.endpoint).setProject(config.projectId);

  return {
    config,
    client,
    account: new Account(client),
    databases: new Databases(client),
  };
}

let singleton: BrowserAppwriteServices | null = null;

export function getBrowserAppwriteServices(): BrowserAppwriteServices {
  if (!singleton) {
    singleton = createBrowserAppwriteServices(getBrowserAppwriteConfig(import.meta.env as Record<string, string | undefined>));
  }
  return singleton;
}
