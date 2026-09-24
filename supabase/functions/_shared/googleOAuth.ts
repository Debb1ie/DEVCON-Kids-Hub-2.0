import { requestOAuthToken } from './googleOAuthCore.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

export const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
};

const encryptionKey = async () => {
  const raw = fromBase64(requiredEnv('GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY'));
  if (raw.byteLength !== 32) throw new Error('Invalid token encryption configuration');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
};

export async function encryptToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), encoder.encode(value));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptToken(value: string) {
  const [iv, ciphertext] = value.split('.');
  if (!iv || !ciphertext) throw new Error('Invalid encrypted token');
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, await encryptionKey(), fromBase64(ciphertext));
  return decoder.decode(decrypted);
}

export const sha256 = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');

export const callbackUrl = () => `${requiredEnv('SUPABASE_URL')}/functions/v1/google-workspace-auth/callback`;

export async function tokenRequest(parameters: URLSearchParams) {
  return requestOAuthToken(fetch, parameters);
}

export const refreshAccessToken = async (refreshToken: string) => {
  const tokens = await tokenRequest(new URLSearchParams({
    client_id: requiredEnv('GOOGLE_OAUTH_CLIENT_ID'), client_secret: requiredEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
    refresh_token: refreshToken, grant_type: 'refresh_token',
  }));
  if (!tokens.access_token) throw new Error('Google access token unavailable');
  return tokens.access_token as string;
};
