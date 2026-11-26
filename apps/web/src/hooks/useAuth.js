import { useEffect, useState } from 'react';
import { authEnabled, onUserChange } from '../lib/auth.js';

/**
 * Current login state.
 * - 'disabled': no Firebase config (development) — the API uses the local "Dev local" user.
 * - 'loading':  waiting for Firebase to say whether someone is signed in.
 * - 'signedOut' / 'signedIn'.
 * @returns {{ status: 'disabled'|'loading'|'signedOut'|'signedIn', user: import('../lib/auth.js').AuthUser|null }}
 */
export function useAuth() {
  const [state, setState] = useState(
    /** @type {{ status: 'disabled'|'loading'|'signedOut'|'signedIn', user: import('../lib/auth.js').AuthUser|null }} */ ({
      status: authEnabled ? 'loading' : 'disabled',
      user: null,
    }),
  );

  useEffect(() => {
    if (!authEnabled) return undefined;
    return onUserChange((user) => setState({ status: user ? 'signedIn' : 'signedOut', user }));
  }, []);

  return state;
}
