export const AUTH_CALLBACK_PATH = '/auth/callback';
export const AUTH_CALLBACK_TIMEOUT_MS = 20_000;

export const buildOAuthRedirectUrl = (origin) => `${origin}${AUTH_CALLBACK_PATH}`;

export const getPostAuthRoute = (profile) =>
  !profile || profile.roleKey === 'pending_volunteer' ? '/pending-approval' : '/dashboard';

export const getProtectedRouteResult = ({ authLoading, isAuthenticated, isPendingVolunteer, roleKey }, roles = null) => {
  if (authLoading) return 'loading';
  if (!isAuthenticated) return '/login';
  if (isPendingVolunteer) return '/pending-approval';
  if (roles && !roles.includes(roleKey)) return '/dashboard';
  return 'allow';
};

export const withTimeout = (promise, timeoutMs = AUTH_CALLBACK_TIMEOUT_MS) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Authentication took too long. Please try again.')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

export const completeOAuthCallback = async (auth, callbackUrl) => {
  const url = new URL(callbackUrl);
  const providerError = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (providerError) throw new Error('Google sign-in was not completed. Please try again.');

  const code = url.searchParams.get('code');
  if (code) {
    const { data, error } = await auth.exchangeCodeForSession(code);
    if (error || !data?.session) throw new Error('We could not complete Google sign-in. Please try again.');
    return data.session;
  }

  const { data, error } = await auth.getSession();
  if (error || !data?.session) throw new Error('No Google sign-in session was found. Please try again.');
  return data.session;
};

export const clearAuthSession = async (auth) => {
  const { error } = await auth.signOut();
  if (error) throw error;
};
