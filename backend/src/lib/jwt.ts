import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set in environment variables.');
}

export interface JwtPayload {
  userId: string;
  email: string;
  name: string;
  role: 'admin' | 'team_lead' | 'agent';
}

/**
 * Mints a short-lived (8h) JWT for an authenticated user.
 * The role is embedded so every subsequent request doesn't need a DB lookup.
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: '8h' });
}

/**
 * Verifies a token and returns the typed payload.
 * Throws if the token is expired, tampered, or otherwise invalid.
 */
export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET!) as jwt.JwtPayload;

  if (
    typeof decoded.userId !== 'string' ||
    typeof decoded.email !== 'string' ||
    typeof decoded.role !== 'string'
  ) {
    throw new Error('Malformed JWT payload');
  }

  return {
    userId: decoded.userId,
    email: decoded.email,
    name: decoded.name ?? '',
    role: decoded.role as JwtPayload['role'],
  };
}
