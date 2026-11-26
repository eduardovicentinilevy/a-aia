import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ApiError, createConversation, getMessages, sendMessage } from '../lib/api.js';
import { chatReducer, fromServerMessage, initialChatState } from '../lib/chat-reducer.js';

const API_UNREACHABLE_MESSAGE = 'Não consegui falar com a API. Ela está rodando? (npm run dev)';

let localIdCounter = 0;
/** Local ids for React keys (crypto.randomUUID only works on https/localhost). */
const nextLocalId = () => `local-${++localIdCounter}`;

/**
 * All chat behavior in one hook: state (via the pure chatReducer) plus the side effects
 * (calling the API, streaming, cancelling, opening old conversations).
 * @param {{ onConversationCreated?: (id: string) => void, onAnswerFinished?: () => void }} [callbacks]
 */
export function useChat(callbacks = {}) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [conversationId, setConversationId] = useState(/** @type {string|null} */ (null));
  const [loadError, setLoadError] = useState(/** @type {string|null} */ (null));
  /** Same as conversationId, but readable inside async code without stale closures. */
  const conversationIdRef = useRef(/** @type {string|null} */ (null));
  /** Cancels whatever is in progress: an answer being streamed or a history being loaded. */
  const controllerRef = useRef(/** @type {AbortController|null} */ (null));
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => () => controllerRef.current?.abort(), []);

  /** @param {string|null} id */
  const setActive = (id) => {
    conversationIdRef.current = id;
    setConversationId(id);
  };

  const send = useCallback(async (/** @type {string} */ content) => {
    const text = content.trim();
    if (!text || controllerRef.current) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    const assistantId = nextLocalId();
    dispatch({ type: 'send', userId: nextLocalId(), assistantId, content: text });

    try {
      if (!conversationIdRef.current) {
        const created = await createConversation({ signal: controller.signal });
        setActive(created.id);
        callbacksRef.current.onConversationCreated?.(created.id);
      }
      await sendMessage(/** @type {string} */ (conversationIdRef.current), text, {
        signal: controller.signal,
        onEvent: (event, data) => dispatch({ type: 'event', id: assistantId, event, data }),
      });
    } catch (err) {
      if (controller.signal.aborted) {
        dispatch({ type: 'stopped', id: assistantId });
      } else {
        dispatch({ type: 'failed', id: assistantId, message: err instanceof ApiError ? err.message : API_UNREACHABLE_MESSAGE });
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      dispatch({ type: 'finished', id: assistantId });
      callbacksRef.current.onAnswerFinished?.();
    }
  }, []);

  /** Opens an existing conversation and loads its history from the API. */
  const open = useCallback(async (/** @type {string} */ id) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setActive(id);
    setLoadError(null);
    dispatch({ type: 'loading' });
    try {
      const messages = await getMessages(id, { signal: controller.signal });
      dispatch({ type: 'load', messages: messages.filter((m) => m.role !== 'system').map(fromServerMessage) });
    } catch (err) {
      if (controller.signal.aborted) return;
      dispatch({ type: 'load', messages: [] });
      setLoadError(err instanceof ApiError ? err.message : API_UNREACHABLE_MESSAGE);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setActive(null);
    setLoadError(null);
    dispatch({ type: 'reset' });
  }, []);

  return {
    messages: state.messages,
    isStreaming: state.streamingId !== null,
    loading: state.loading,
    loadError,
    conversationId,
    send,
    open,
    stop,
    reset,
  };
}
