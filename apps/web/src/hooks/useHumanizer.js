import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ApiError, humanizeText } from '../lib/api.js';
import { humanizeReducer, initialHumanizeState } from '../lib/humanize-reducer.js';

const API_UNREACHABLE_MESSAGE = 'Não consegui falar com a API. Ela está rodando?';

/**
 * Behavior of the "Humanizar" screen: calls the API, streams the rewrite, lets the user stop it.
 * @param {{ onFinished?: () => void }} [callbacks]
 */
export function useHumanizer(callbacks = {}) {
  const [state, dispatch] = useReducer(humanizeReducer, initialHumanizeState);
  const controllerRef = useRef(/** @type {AbortController|null} */ (null));
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => () => controllerRef.current?.abort(), []);

  const run = useCallback(async (/** @type {{ text: string, tone: string, strength: string }} */ input) => {
    if (!input.text.trim() || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    dispatch({ type: 'start' });
    try {
      await humanizeText(input, {
        signal: controller.signal,
        onEvent: (event, data) => dispatch({ type: 'event', event, data }),
      });
      // Stream ended without "done" (connection cut): keep what arrived.
      dispatch({ type: 'stopped' });
    } catch (err) {
      if (controller.signal.aborted) dispatch({ type: 'stopped' });
      else dispatch({ type: 'failed', message: err instanceof ApiError ? err.message : API_UNREACHABLE_MESSAGE });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      callbacksRef.current.onFinished?.();
    }
  }, []);

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    dispatch({ type: 'reset' });
  }, []);

  return { ...state, isStreaming: state.status === 'streaming', run, stop, reset };
}
