import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('uses safe defaults (mock provider) when nothing is set', () => {
    const config = loadConfig({});
    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(8080);
    expect(config.pro.provider).toBe('mock');
    expect(config.corsOrigins).toEqual(['http://localhost:5173']);
    expect(config.maxOutputTokens).toBe(1024);
  });

  it('treats blank values from .env as not set', () => {
    const config = loadConfig({ PRO_PROVIDER: '', PORT: '', PRO_MODEL: '  ' });
    expect(config.pro.provider).toBe('mock');
    expect(config.port).toBe(8080);
    expect(config.pro.model).toBeUndefined();
  });

  it('splits CORS_ORIGIN by comma', () => {
    const config = loadConfig({ CORS_ORIGIN: 'http://localhost:5173, https://acaia.example ' });
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'https://acaia.example']);
  });

  it('requires base URL, key and model for the openai-compatible provider', () => {
    try {
      loadConfig({ PRO_PROVIDER: 'openai-compatible' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const problems = /** @type {ConfigError} */ (err).problems.join('\n');
      expect(problems).toContain('PRO_BASE_URL');
      expect(problems).toContain('PRO_API_KEY');
      expect(problems).toContain('PRO_MODEL');
    }
  });

  it('accepts a complete openai-compatible configuration', () => {
    const config = loadConfig({
      PRO_PROVIDER: 'openai-compatible',
      PRO_BASE_URL: 'https://llm.example/v1',
      PRO_API_KEY: 'secret',
      PRO_MODEL: 'some-model',
    });
    expect(config.pro).toMatchObject({ provider: 'openai-compatible', model: 'some-model', timeoutMs: 30_000 });
  });

  it('rejects invalid values without echoing them', () => {
    expect(() => loadConfig({ PORT: 'abc', PRO_PROVIDER: 'super-secret-value' })).toThrow(ConfigError);
    try {
      loadConfig({ PRO_PROVIDER: 'super-secret-value' });
    } catch (err) {
      expect(/** @type {Error} */ (err).message).not.toContain('super-secret-value');
    }
  });

  it('parses invite and admin lists (admins are always invited)', () => {
    const config = loadConfig({ ALLOWED_EMAILS: ' Alice@Example.com, bob@example.com ', ADMIN_EMAILS: 'eduardo@example.com' });
    expect(config.allowedEmails).toEqual(['alice@example.com', 'bob@example.com', 'eduardo@example.com']);
    expect(config.adminEmails).toEqual(['eduardo@example.com']);
    expect(() => loadConfig({ ALLOWED_EMAILS: 'not-an-email' })).toThrow(/ALLOWED_EMAILS/);
  });

  it('converts the monthly budget to centavos and reads limits', () => {
    const config = loadConfig({ MONTHLY_BUDGET_BRL: '150', DAILY_TOKEN_LIMIT_PER_USER: '20000' });
    expect(config.monthlyBudgetCents).toBe(15_000);
    expect(config.dailyTokenLimit).toBe(20_000);
  });

  it('demands login, database and invite list in production', () => {
    try {
      loadConfig({ NODE_ENV: 'production' });
      expect.unreachable();
    } catch (err) {
      const problems = /** @type {ConfigError} */ (err).problems.join('\n');
      expect(problems).toContain('FIREBASE_PROJECT_ID');
      expect(problems).toContain('DATABASE_URL');
      expect(problems).toContain('ALLOWED_EMAILS');
    }
    const ok = loadConfig({
      NODE_ENV: 'production',
      FIREBASE_PROJECT_ID: 'acaia-123456',
      DATABASE_URL: 'postgres://u:p@host/db',
      ADMIN_EMAILS: 'eduardo@example.com',
    });
    expect(ok.firebaseProjectId).toBe('acaia-123456');
  });
});
