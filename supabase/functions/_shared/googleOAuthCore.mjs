export const GOOGLE_SCOPES = [
  'openid', 'email',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
];

export function buildGoogleAuthorizationUrl({ clientId, redirectUri, state }) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
    access_type: 'offline', prompt: 'consent select_account', scope: GOOGLE_SCOPES.join(' '), state,
  }).toString();
  return url.toString();
}

export async function requestOAuthToken(fetchImplementation, parameters) {
  const response = await fetchImplementation('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: parameters,
  });
  if (!response.ok) throw new Error('Google OAuth token exchange failed');
  return response.json();
}

export async function revokeOAuthToken(fetchImplementation, token) {
  const response = await fetchImplementation('https://oauth2.googleapis.com/revoke', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  });
  return response.ok;
}

export async function revokeOAuthTokenSafely(fetchImplementation, token) {
  try {
    const response = await fetchImplementation('https://oauth2.googleapis.com/revoke', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
    if (response.ok) return { confirmed: true, outcome: 'success', providerStatus: response.status || 200, reason: null };
    const tokenInvalid = response.status === 400 || response.status === 401;
    return {
      confirmed: false,
      outcome: tokenInvalid ? 'failed' : 'unavailable',
      providerStatus: Number.isInteger(response.status) ? response.status : null,
      reason: tokenInvalid ? 'token_invalid_or_expired' : 'provider_error',
    };
  } catch {
    return { confirmed: false, outcome: 'unavailable', providerStatus: null, reason: 'network_error' };
  }
}
