import { OAuth2Client } from 'google-auth-library';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

if (!GOOGLE_CLIENT_ID) {
  throw new Error('GOOGLE_CLIENT_ID is not set in environment variables.');
}

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export interface GoogleTokenPayload {
  sub: string;       // stable Google user ID
  email: string;
  name: string;
  hd?: string;       // hosted domain — only present for Workspace accounts
  picture?: string;
}

/**
 * Verifies a Google ID token (from GSI or Credential Manager).
 * Returns the verified payload or throws if the token is invalid/expired.
 *
 * Also enforces ALLOWED_EMAIL_DOMAIN if that env var is set —
 * this restricts login to a specific Google Workspace domain.
 */
export async function verifyGoogleToken(
  idToken: string
): Promise<GoogleTokenPayload> {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID!,
  });

  const payload = ticket.getPayload();

  if (!payload || !payload.email || !payload.sub || !payload.name) {
    throw new Error('Google token payload is missing required fields.');
  }

  // Domain restriction (optional — set ALLOWED_EMAIL_DOMAIN in .env)
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (allowedDomain) {
    // hd claim is only present for Workspace accounts, so we also check the email suffix
    const emailDomain = payload.email.split('@')[1];
    if (emailDomain !== allowedDomain && payload.hd !== allowedDomain) {
      throw new Error(
        `Login restricted to @${allowedDomain} accounts. Got @${emailDomain}.`
      );
    }
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    hd: payload.hd,
    picture: payload.picture,
  };
}
