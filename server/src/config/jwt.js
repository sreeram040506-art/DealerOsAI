import crypto from 'crypto';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Resolves the secret used to sign and verify session tokens.
 *
 * This used to silently fall back to the literal string 'secret' when JWT_SECRET wasn't
 * set, in three different files. That meant anyone who read the source — which now includes
 * this repo's git history — could forge a valid token for any user, SUPER_ADMIN included,
 * just by signing with that known word. There is no safe fallback for a signing secret, so
 * this throws in production instead of degrading quietly.
 *
 * In development, generating a random secret per process keeps `npm run dev:server` working
 * with no setup while guaranteeing nothing predictable is ever used to sign a token. The
 * trade-off is that tokens don't survive a restart — set JWT_SECRET in server/.env for a
 * stable local session.
 */
function resolveJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  if (isProduction) {
    throw new Error(
      'JWT_SECRET is not set. Refusing to start in production with an undefined token-signing ' +
      'secret — set JWT_SECRET in the environment before starting the server.'
    );
  }

  const generated = crypto.randomBytes(48).toString('hex');
  console.warn(
    '[auth] JWT_SECRET is not set — generated a random secret for this process only. ' +
    'Set JWT_SECRET in server/.env so sessions survive a restart.'
  );
  return generated;
}

export const JWT_SECRET = resolveJwtSecret();
