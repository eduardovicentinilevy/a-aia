import { useCallback, useEffect, useState } from 'react';
import { getUsage } from '../lib/api.js';

/** Today's token usage and the daily limit (GET /me/usage). */
export function useUsage() {
  const [data, setData] = useState(/** @type {Awaited<ReturnType<typeof getUsage>>|null} */ (null));

  const refresh = useCallback(async () => {
    try {
      setData(await getUsage());
    } catch {
      // The meter is informative only: ignore failures.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, refresh };
}
