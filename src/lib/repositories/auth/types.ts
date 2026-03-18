import { AppUser } from '../../appwrite/models';

export type SignUpInput = {
  email: string;
  password: string;
  name?: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

export type AuthRepository = {
  getCurrentUser(): Promise<AppUser | null>;
  signUp(input: SignUpInput): Promise<AppUser>;
  signIn(input: SignInInput): Promise<AppUser>;
  signOut(): Promise<void>;
};
