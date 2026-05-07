import crypto from 'crypto';
import bcrypt from 'bcrypt';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

import type { DB } from './db';
import { config } from './config';

export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      clientId?: string;
    }
  }
}

function newRandomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function isExpired(expiresAt: string): boolean {
  return Date.parse(expiresAt) <= Date.now();
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.bcryptRounds);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function issueClientToken(db: DB, clientId: string): { token: string; expiresAt: string } {
  const token = newRandomToken();
  const expiresAt = isoFromNow(config.clientTokenTtlMs);
  db.prepare(
    'INSERT INTO client_tokens (token, client_id, expires_at) VALUES (?, ?, ?)',
  ).run(token, clientId, expiresAt);
  return { token, expiresAt };
}

export function issueUserToken(db: DB, userId: number): { token: string; expiresAt: string } {
  const token = newRandomToken();
  const expiresAt = isoFromNow(config.userTokenTtlMs);
  db.prepare(
    'INSERT INTO user_tokens (token, user_id, expires_at) VALUES (?, ?, ?)',
  ).run(token, userId, expiresAt);
  return { token, expiresAt };
}

export function revokeUserToken(db: DB, token: string): void {
  db.prepare('DELETE FROM user_tokens WHERE token = ?').run(token);
}

function readBearer(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1]!.trim() : null;
}

export function requireClientToken(db: DB): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.header('x-client-token');
    if (!token) {
      res.status(401).json({ error: 'missing_client_token' });
      return;
    }
    const row = db
      .prepare('SELECT client_id, expires_at FROM client_tokens WHERE token = ?')
      .get(token) as { client_id: string; expires_at: string } | undefined;
    if (!row) {
      res.status(401).json({ error: 'invalid_client_token' });
      return;
    }
    if (isExpired(row.expires_at)) {
      db.prepare('DELETE FROM client_tokens WHERE token = ?').run(token);
      res.status(401).json({ error: 'expired_client_token' });
      return;
    }
    req.clientId = row.client_id;
    next();
  };
}

export function requireUser(db: DB): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = readBearer(req);
    if (!token) {
      res.status(401).json({ error: 'missing_user_token' });
      return;
    }
    const row = db
      .prepare(
        `SELECT t.user_id AS userId, t.expires_at AS expiresAt,
                u.email AS email, u.name AS name
           FROM user_tokens t
           JOIN users u ON u.id = t.user_id
          WHERE t.token = ?`,
      )
      .get(token) as
      | { userId: number; expiresAt: string; email: string; name: string }
      | undefined;
    if (!row) {
      res.status(401).json({ error: 'invalid_user_token' });
      return;
    }
    if (isExpired(row.expiresAt)) {
      db.prepare('DELETE FROM user_tokens WHERE token = ?').run(token);
      res.status(401).json({ error: 'expired_user_token' });
      return;
    }
    req.user = { id: row.userId, email: row.email, name: row.name };
    (req as Request & { _userToken?: string })._userToken = token;
    next();
  };
}

export function getUserToken(req: Request): string | undefined {
  return (req as Request & { _userToken?: string })._userToken;
}
