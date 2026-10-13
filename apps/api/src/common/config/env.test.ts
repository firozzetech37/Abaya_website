import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://x@localhost:5432/db',
  SUPABASE_URL: 'https://ref.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  CLERK_SECRET_KEY: 'sk_test_abc',
  RAZORPAY_KEY_ID: 'rzp_test_x',
  RAZORPAY_KEY_SECRET: 'secret',
  RAZORPAY_WEBHOOK_SECRET: 'whsec',
};

describe('parseEnv', () => {
  it('fails fast and names every missing value', () => {
    expect(() => parseEnv({ DATABASE_URL: 'x' })).toThrow(/SUPABASE_URL[\s\S]*CLERK_SECRET_KEY/);
  });

  it('needs Razorpay keys unless fake payments are chosen, and never allows fake payments in production', () => {
    const { RAZORPAY_KEY_ID: _i, ...noKey } = base;
    expect(() => parseEnv(noKey)).toThrow(/RAZORPAY_KEY_ID/);
    expect(parseEnv({ ...noKey, PAYMENT_PROVIDER: 'fake' }).PAYMENT_PROVIDER).toBe('fake');
    expect(() => parseEnv({ ...base, PAYMENT_PROVIDER: 'fake', NODE_ENV: 'production' })).toThrow(/development only/);
  });

  it('requires a Clerk secret key', () => {
    const { CLERK_SECRET_KEY: _k, ...noClerk } = base;
    expect(() => parseEnv(noClerk)).toThrow(/CLERK_SECRET_KEY/);
    expect(() => parseEnv({ ...base, CLERK_SECRET_KEY: 'pk_test_wrong' })).toThrow(/Clerk secret key/);
  });

  it('turns the AI assistant on only with a URL and token, with sane thresholds', () => {
    const off = parseEnv(base);
    expect(off.AI_SERVICE_URL).toBeUndefined();
    expect(off.AI_DUPLICATE_THRESHOLD).toBe(0.96);
    expect(off.AI_SIMILAR_THRESHOLD).toBe(0.93);
    expect(() => parseEnv({ ...base, AI_SERVICE_URL: 'http://localhost:8000' })).toThrow(/AI_SERVICE_TOKEN/);
    expect(parseEnv({ ...base, AI_SERVICE_URL: 'http://localhost:8000', AI_SERVICE_TOKEN: 'dev' }).AI_WORKER_ENABLED).toBe(true);
    expect(() =>
      parseEnv({ ...base, NODE_ENV: 'production', PAYMENT_PROVIDER: 'razorpay', AI_SERVICE_URL: 'https://ai.internal', AI_SERVICE_TOKEN: 'short' }),
    ).toThrow(/at least 24/);
    expect(() => parseEnv({ ...base, AI_SIMILAR_THRESHOLD: '0.97' })).toThrow(/AI_SIMILAR_THRESHOLD/);
  });

  it('treats empty strings as missing', () => {
    expect(() => parseEnv({ ...base, RAZORPAY_KEY_SECRET: '' })).toThrow(/RAZORPAY_KEY_SECRET/);
    expect(parseEnv({ ...base, RESEND_API_KEY: '' }).RESEND_API_KEY).toBeUndefined();
  });

  it('parses CORS origins and uses the host PORT when API_PORT is unset', () => {
    const env = parseEnv({ ...base, CORS_ORIGINS: 'https://a.in, https://b.in', PORT: '10000' });
    expect(env.CORS_ORIGINS).toEqual(['https://a.in', 'https://b.in']);
    expect(env.API_PORT).toBe(10000);
    expect(parseEnv({ ...base, API_PORT: '4001', PORT: '10000' }).API_PORT).toBe(4001);
  });

  it('needs the provider settings when WhatsApp is switched on', () => {
    expect(parseEnv(base).WHATSAPP_PROVIDER).toBe('none');
    expect(() => parseEnv({ ...base, WHATSAPP_PROVIDER: 'interakt' })).toThrow(/WHATSAPP_PROVIDER_API_KEY/);
    expect(() => parseEnv({ ...base, WHATSAPP_PROVIDER: 'gupshup', WHATSAPP_PROVIDER_API_KEY: 'k' })).toThrow(
      /GUPSHUP_SOURCE_NUMBER[\s\S]*WHATSAPP_TEMPLATE_IDS/,
    );
    expect(parseEnv({ ...base, WHATSAPP_PROVIDER: 'interakt', WHATSAPP_PROVIDER_API_KEY: 'k' }).WHATSAPP_PROVIDER).toBe('interakt');
  });

  it('runs the notification worker everywhere except tests', () => {
    expect(parseEnv({ ...base, NODE_ENV: 'test' }).NOTIFY_WORKER_ENABLED).toBe(false);
    expect(parseEnv({ ...base, NODE_ENV: 'production' }).NOTIFY_WORKER_ENABLED).toBe(true);
  });

  it('requires staff MFA in production unless switched off explicitly', () => {
    expect(parseEnv({ ...base, NODE_ENV: 'production' }).STAFF_MFA_REQUIRED).toBe(true);
    expect(parseEnv({ ...base, NODE_ENV: 'development' }).STAFF_MFA_REQUIRED).toBe(false);
    expect(parseEnv({ ...base, NODE_ENV: 'production', STAFF_MFA_REQUIRED: 'false' }).STAFF_MFA_REQUIRED).toBe(false);
  });
});
