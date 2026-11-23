import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export interface AuthSession {
  userId: number;
  role: 'admin' | 'agent';
  identifier: string;
  fullName: string;
  isEnvAdmin?: boolean;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthSession;
}

export function isEnvAdminPasscodeConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
}

export function verifyEnvAdminPasscode(candidate: string): boolean {
  const configured = process.env.ADMIN_PASSCODE?.trim();
  if (!configured) return false;
  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(configured).digest();
  return crypto.timingSafeEqual(a, b);
}

export function signSessionToken(session: Omit<AuthSession, 'exp'>): string {
  const payload: AuthSession = {
    ...session,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sigB64}`;
}

export function verifySessionToken(token: string): AuthSession | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');

  const sigBuf = Buffer.from(sigB64);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as AuthSession;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    if (parsed.role !== 'admin' && parsed.role !== 'agent') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Session expired or invalid' });
    return;
  }

  if (session.isEnvAdmin && isEnvAdminPasscodeConfigured()) {
    req.auth = session;
    next();
    return;
  }

  const user = db
    .prepare('SELECT id, role, identifier, full_name, active FROM users WHERE id = ?')
    .get(session.userId) as
    | { id: number; role: 'admin' | 'agent'; identifier: string; full_name: string; active: number }
    | undefined;

  if (!user || user.active !== 1 || user.role !== session.role) {
    res.status(401).json({ error: 'Account inactive or unauthorized' });
    return;
  }

  req.auth = {
    userId: user.id,
    role: user.role,
    identifier: user.identifier,
    fullName: user.full_name,
    exp: session.exp,
  };
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.auth?.role !== 'admin') {
      res.status(403).json({ error: 'Admin privileges required' });
      return;
    }
    next();
  });
}
