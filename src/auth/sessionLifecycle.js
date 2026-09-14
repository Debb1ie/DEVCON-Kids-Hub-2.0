const hasAuthenticatedUser = (session) => Boolean(session?.user?.id && session?.access_token);

export const createSessionLifecycle = () => {
  let currentSession = null;
  let initialized = false;
  let restoration = null;

  const accept = (session) => {
    currentSession = hasAuthenticatedUser(session) ? session : null;
    initialized = true;
    return currentSession;
  };

  const restore = async (auth) => {
    if (initialized) return currentSession;
    if (!restoration) {
      restoration = auth.getSession()
        .then(({ data, error }) => {
          if (error) throw error;
          return accept(data?.session || null);
        })
        .finally(() => {
          restoration = null;
        });
    }
    return restoration;
  };

  const requireSession = async (auth) => {
    const session = initialized ? currentSession : await restore(auth);
    return hasAuthenticatedUser(session) ? session : null;
  };

  const clear = () => {
    currentSession = null;
    initialized = true;
  };

  const resetForTests = () => {
    currentSession = null;
    initialized = false;
    restoration = null;
  };

  return { accept, clear, requireSession, resetForTests, restore };
};

// The browser has one Supabase client and one corresponding session lifecycle.
export const authSessionLifecycle = createSessionLifecycle();
