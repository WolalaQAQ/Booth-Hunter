import { Account, AppwriteException, ID, Models } from 'appwrite';

import { AppUser } from '../../appwrite/models';
import { AuthRepository, SignInInput, SignUpInput } from './types';

function toAppUser(user: Models.User<Models.Preferences>): AppUser {
  return {
    id: user.$id,
    email: user.email,
    name: user.name,
    prefs: (user.prefs || {}) as Record<string, unknown>,
  };
}

export class AppwriteAuthRepository implements AuthRepository {
  constructor(private readonly account: Account) {}

  async getCurrentUser(): Promise<AppUser | null> {
    try {
      return toAppUser(await this.account.get());
    } catch (error) {
      if (error instanceof AppwriteException && error.code === 401) {
        return null;
      }
      throw error;
    }
  }

  async signUp(input: SignUpInput): Promise<AppUser> {
    await this.account.create(ID.unique(), input.email, input.password, input.name || input.email.split('@')[0]);
    return this.signIn({ email: input.email, password: input.password });
  }

  async signIn(input: SignInInput): Promise<AppUser> {
    await this.account.createEmailPasswordSession(input.email, input.password);
    return toAppUser(await this.account.get());
  }

  async signOut(): Promise<void> {
    await this.account.deleteSession('current');
  }
}
