/**
 * State of the "Humanizar" screen, as a pure reducer (easy to test, no React needed).
 *
 * @typedef {'idle'|'streaming'|'done'|'stopped'|'error'} HumanizeStatus
 * @typedef {{ status: HumanizeStatus, output: string, error: string|null, model: string|null,
 *   latencyMs: number|null, replaced: boolean }} HumanizeState
 *
 * @typedef {{ type: 'start' }
 *   | { type: 'event', event: string, data: any }
 *   | { type: 'stopped' }
 *   | { type: 'failed', message: string }
 *   | { type: 'reset' }} HumanizeAction
 */

/** @type {HumanizeState} */
export const initialHumanizeState = Object.freeze({
  status: 'idle',
  output: '',
  error: null,
  model: null,
  latencyMs: null,
  replaced: false,
});

/**
 * @param {HumanizeState} state
 * @param {HumanizeAction} action
 * @returns {HumanizeState}
 */
export function humanizeReducer(state, action) {
  switch (action.type) {
    case 'start':
      return { ...initialHumanizeState, status: 'streaming' };
    case 'event': {
      const { event, data } = action;
      if (state.status !== 'streaming') return state;
      if (event === 'meta') return { ...state, model: data?.model ?? null };
      if (event === 'token') return { ...state, output: state.output + (data?.text ?? '') };
      if (event === 'done') {
        const replacement = typeof data?.replacement === 'string' ? data.replacement : null;
        return {
          ...state,
          status: 'done',
          output: replacement ?? state.output,
          replaced: replacement !== null,
          latencyMs: data?.latencyMs ?? null,
        };
      }
      if (event === 'error') return { ...state, status: 'error', error: data?.message ?? 'Algo deu errado. Tente de novo.' };
      return state;
    }
    case 'stopped':
      return state.status === 'streaming' ? { ...state, status: 'stopped' } : state;
    case 'failed':
      return { ...state, status: 'error', error: action.message };
    case 'reset':
      return initialHumanizeState;
    default:
      return state;
  }
}
