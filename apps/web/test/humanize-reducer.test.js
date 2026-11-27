import { describe, expect, it } from 'vitest';
import { humanizeReducer, initialHumanizeState } from '../src/lib/humanize-reducer.js';

/** @param {any[]} actions */
const play = (actions) => actions.reduce(humanizeReducer, initialHumanizeState);
const ev = (event, data) => ({ type: 'event', event, data });

describe('humanizeReducer', () => {
  it('accumulates tokens and finishes on done', () => {
    const state = play([{ type: 'start' }, ev('meta', { model: 'mock' }), ev('token', { text: 'Olá, ' }), ev('token', { text: 'mundo.' }), ev('done', { latencyMs: 42 })]);
    expect(state).toMatchObject({ status: 'done', output: 'Olá, mundo.', model: 'mock', latencyMs: 42, replaced: false });
  });

  it('uses the replacement sent by output moderation', () => {
    const state = play([{ type: 'start' }, ev('token', { text: 'ruim' }), ev('done', { replacement: 'Removido.' })]);
    expect(state).toMatchObject({ status: 'done', output: 'Removido.', replaced: true });
  });

  it('shows the error message from the stream', () => {
    const state = play([{ type: 'start' }, ev('error', { message: 'O modelo demorou demais.' })]);
    expect(state).toMatchObject({ status: 'error', error: 'O modelo demorou demais.' });
  });

  it('keeps the partial text when stopped, and ignores late events', () => {
    const stopped = play([{ type: 'start' }, ev('token', { text: 'meio' }), { type: 'stopped' }, ev('token', { text: ' tarde' })]);
    expect(stopped).toMatchObject({ status: 'stopped', output: 'meio' });
    // "stopped" after "done" changes nothing.
    expect(play([{ type: 'start' }, ev('done', {}), { type: 'stopped' }]).status).toBe('done');
  });

  it('starts clean every time', () => {
    const state = play([{ type: 'start' }, ev('token', { text: 'velho' }), ev('done', {}), { type: 'start' }]);
    expect(state).toMatchObject({ status: 'streaming', output: '', error: null });
  });
});
