export { supabase } from './client';

export { signUp, signIn, signInWithOAuth, signOut, getCurrentUser } from './auth';
export type { AuthUser, SignUpResult, SignInResult } from './auth';

export { getProfile, getPublicProfile, updateUsername } from './profiles';
export type { Profile, ProfileRow } from './profiles';

export { saveGame, getGames, getGameById } from './games';
export type { SaveGameOptions } from './games';
export type { SavedGame, NewGame, StoredMove, GameResult } from './types';

export { getUserRating, upsertUserRating } from './ratings';
export type { UserRating } from './ratings';

export { encryptEmail, decryptEmail, hashEmail } from './crypto';