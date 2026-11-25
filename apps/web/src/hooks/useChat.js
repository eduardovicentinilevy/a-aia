import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ApiError, createConversation, sendMessage } from '../lib/api.js';
import { chatReducer, initialChatState } from '../lib/chat-reducer.js';

const API_UNREACHABLE_MESSAGE = 'Não consegui falar com a API. Ela está rodando? (npm run dev)';

let localIdCounter = 0;
/** Local ids for React keys (crypto.randomUUID only works on https/localhost). */
const nextLocalId = () => `local-${++localIdCounter}`;

/**
 * All chat behavior in one hook: state (via the pure chatReducer) plus the side effects
 * (calling the API, streaming, cancelling).
 */
export function useChat() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  /** Conversation id on the server; created lazily on the first message. */
  const conversationIdRef = useRef(/** @type {string|null} */ (null));
  /** Cancels the answer in progress (stop button, new chat, leaving the page). */
  const controllerRef = useRef(/** @type {AbortController|null} */ (null));

  useEffect(() => () => controllerRef.current?.abort(), []);

  const send = useCallback(async (/** @type {string} */ content) => {
    const text = content.trim();
    if (!text || controllerRef.current) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    const assistantId = nextLocalId();
    dispatch({ type: 'send', userId: nextLocalId(), assistantId, content: text });

    try {
      conversationIdRef.current ??= (await createConversation({ signal: controller.signal })).id;
      await sendMessage(conversationIdRef.current, text, {
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
    }
  }, []);

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    conversationIdRef.current = null;
    dispatch({ type: 'reset' });
  }, []);

  return {
    messages: state.messages,
    isStreaming: state.streamingId !== null,
    send,
    stop,
    reset,
  };
}
