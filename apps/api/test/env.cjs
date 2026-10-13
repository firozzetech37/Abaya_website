// Test environment for every e2e worker. Only placeholder secrets; nothing real.
const { generateKeyPairSync } = require('node:crypto');

// A throwaway RS256 key pair stands in for Clerk's signing key: tests sign session
// tokens with the private key; the API verifies them networklessly via CLERK_JWT_KEY.
if (!process.env.E2E_CLERK_PRIVATE_KEY) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.E2E_CLERK_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
  process.env.CLERK_JWT_KEY = publicKey.export({ type: 'spki', format: 'pem' });
}

const url = process.env.E2E_DATABASE_URL || 'postgresql://postgres@127.0.0.1:55432/abaya_e2e';
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: url,
  SUPABASE_URL: 'https://e2e-project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'e2e-service-role',
  CLERK_SECRET_KEY: 'sk_test_e2e_not_a_real_key',
  RAZORPAY_KEY_ID: 'rzp_test_e2e',
  RAZORPAY_KEY_SECRET: 'e2e_key_secret',
  RAZORPAY_WEBHOOK_SECRET: 'e2e_webhook_secret',
  CORS_ORIGINS: 'http://localhost:3000',
  STAFF_MFA_REQUIRED: 'false',
  RESEND_API_KEY: '',
  // The AI assistant is on; tests replace the Python service with FakeAnalyzer (test/helpers.ts).
  AI_SERVICE_URL: 'http://ai.test',
  AI_SERVICE_TOKEN: 'test-token',
});
