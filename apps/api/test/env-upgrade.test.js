import { describe, expect, it } from 'vitest';
import { upgradeEnv } from '../../../scripts/env-upgrade.mjs';

describe('upgradeEnv (scripts/env-upgrade.mjs)', () => {
  it('replaces the old default DATABASE_URL and keeps everything else', () => {
    const { text, changes } = upgradeEnv('NODE_ENV=development\r\nDATABASE_URL=postgres://acaia:acaia@localhost:5432/acaia\r\nPRO_MODEL=x\r\n');
    expect(text).toBe('NODE_ENV=development\r\nDATABASE_URL=postgres://acaia:acaia@127.0.0.1:25432/acaia\r\nPRO_MODEL=x\r\n');
    expect(changes).toHaveLength(1);
  });

  it('also moves the intermediate 5433 value to 25432', () => {
    const { text } = upgradeEnv('DATABASE_URL=postgres://acaia:acaia@127.0.0.1:5433/acaia\n');
    expect(text).toBe('DATABASE_URL=postgres://acaia:acaia@127.0.0.1:25432/acaia\n');
  });

  it('never touches customized values', () => {
    for (const custom of ['postgresql://acaia:acaia@localhost:5432/acaia', 'postgres://eu:senha@localhost:5432/outro', 'postgresql://user@ep-x.sa-east-1.aws.neon.tech/acaia']) {
      const original = `DATABASE_URL=${custom}\n`;
      expect(upgradeEnv(original)).toEqual({ text: original, changes: [] });
    }
  });
});
