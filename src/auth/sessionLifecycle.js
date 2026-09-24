const hasAuthenticatedUser = (session) => Boolean(session?.user?.id && session?.access_token);

export const createSessionLifecycle = () => {
  let currentSession = null;
  let initialized = false;
  let explicitlySignedOut = false;
  let restoration = null;
  let revision = 0;

  const accept = (session) => {
    revision += 1;
    currentSession = hasAuthenticatedUser(session) ? session : null;
    initialized = true;
    explicitlySignedOut = false;
    return currentSession;
  };

  const restore = async (auth, { force = false } = {}) => {
    if (!force && initialized) return currentSession;
    if (!restoration) {
      const restorationRevision = revision;
      restoration = auth.getSession()
        .then(({ data, error }) => {
          if (error) throw error;
          // An auth event received while getSession() was pending is newer than
          // the snapshot returned by that call and must win the race.
          if (revision !== restorationRevision) return currentSession;
          currentSession = hasAuthenticatedUser(data?.session) ? data.session : null;
          initialized = true;
          explicitlySignedOut = false;
          return currentSession;
        })
        .finally(() => {
          restoration = null;
        });
    }
    return restoration;
  };

  const requireSession = async (auth) => {
    let session = initialized ? currentSession : await restore(auth);
    // INITIAL_SESSION may legitimately be null while PKCE persistence catches
    // up. Re-read once at the point of use instead of caching that null forever.
    if (!session && !explicitlySignedOut) session = await restore(auth, { force: true });
    return hasAuthenticatedUser(session) ? session : null;
  };

  const clear = ({ signedOut = true } = {}) => {
    revision += 1;
    currentSession = null;
    initialized = true;
    explicitlySignedOut = signedOut;
  };

  const acceptAuthEvent = (event, session) => {
    if (hasAuthenticatedUser(session)) return accept(session);
    clear({ signedOut: event === 'SIGNED_OUT' });
    return null;
  };

  const resetForTests = () => {
    currentSession = null;
    initialized = false;
    explicitlySignedOut = false;
    restoration = null;
    revision = 0;
  };

  return { accept, acceptAuthEvent, clear, requireSession, resetForTests, restore };
};

// The browser has one Supabase client and one corresponding session lifecycle.
export const authSessionLifecycle = createSessionLifecycle();
