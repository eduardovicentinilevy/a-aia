import { useCallback, useEffect, useState } from 'react';
import { deleteConversation, listConversations, renameConversation } from '../lib/api.js';

/** The user's conversations for the sidebar (most recent first), with rename and delete. */
export function useConversations() {
  const [items, setItems] = useState(/** @type {import('../lib/api.js').ConversationSummary[]} */ ([]));
  const [error, setError] = useState(/** @type {string|null} */ (null));

  const refresh = useCallback(async () => {
    try {
      setItems(await listConversations());
      setError(null);
    } catch (err) {
      setError(/** @type {Error} */ (err).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rename = useCallback(async (/** @type {string} */ id, /** @type {string} */ title) => {
    const updated = await renameConversation(id, title);
    setItems((list) => list.map((c) => (c.id === id ? updated : c)));
  }, []);

  const remove = useCallback(async (/** @type {string} */ id) => {
    await deleteConversation(id);
    setItems((list) => list.filter((c) => c.id !== id));
  }, []);

  return { items, error, refresh, rename, remove };
}
