import { describe, expect, it } from 'vitest';
import { createLogger, maskPII } from '../src/lib/logger.js';

describe('maskPII', () => {
  it.each([
    ['fale com eduardo.levy@exemplo.com.br', 'fale com [EMAIL]'],
    ['CPF 123.456.789-09', 'CPF [CPF]'],
    ['CPF 12345678909', 'CPF [CPF]'],
    ['ligue +55 (11) 91234-5678', 'ligue [PHONE]'],
    ['ligue (11) 91234-5678', 'ligue [PHONE]'],
    ['ligue 11 3456-7890', 'ligue [PHONE]'],
    ['Authorization: Bearer abc.def-123', 'Authorization: Bearer [REDACTED]'],
    ['key sk-abcdefghijklmnop1234', 'key [REDACTED_KEY]'],
    ['google AIzaSyA1234567890abcdefghijklmnopqrstuv', 'google [REDACTED_KEY]'],
    ['GET /v1/models?key=abc123&x=1', 'GET /v1/models?key=[REDACTED]&x=1'],
    ['jwt eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl', 'jwt [REDACTED_JWT]'],
  ])('masks %j', (input, expected) => {
    expect(maskPII(input)).toBe(expected);
  });

  it('does not touch UUIDs, numbers or ordinary text', () => {
    const id = '0b5c2a3e-1234-4cde-8f00-123456789abc';
    expect(maskPII(`conversa ${id}`)).toBe(`conversa ${id}`);
    expect(maskPII('porta 8080, 1500 ms')).toBe('porta 8080, 1500 ms');
    expect(maskPII(1732560000000)).toBe(1732560000000);
  });

  it('redacts sensitive keys in nested objects and arrays', () => {
    const masked = maskPII({
      headers: { Authorization: 'anything', accept: 'text/event-stream' },
      items: [{ apiKey: 'k', email: 'a@b.co' }],
    });
    expect(masked).toEqual({
      headers: { Authorization: '[REDACTED]', accept: 'text/event-stream' },
      items: [{ apiKey: '[REDACTED]', email: '[EMAIL]' }],
    });
  });

  it('serializes errors without the stack', () => {
    const err = Object.assign(new Error('falhou para x@y.com'), { code: 'E1' });
    expect(maskPII(err)).toEqual({ name: 'Error', message: 'falhou para [EMAIL]', code: 'E1' });
  });
});

describe('createLogger', () => {
  it('writes one masked JSON line with severity and message', () => {
    const lines = [];
    const logger = createLogger({ sink: (line) => lines.push(line) });
    logger.info('user_login', { email: 'a@b.co' });
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ severity: 'INFO', message: 'user_login', email: '[EMAIL]' });
    expect(typeof entry.time).toBe('string');
  });

  it('respects the level and keeps child bindings', () => {
    const lines = [];
    const logger = createLogger({ level: 'warn', sink: (line) => lines.push(line) }).child({ component: 'test' });
    logger.info('ignored');
    logger.error('kept');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ severity: 'ERROR', message: 'kept', component: 'test' });
  });
});
