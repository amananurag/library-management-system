import { Router } from 'express';

import type { DB } from '../db';
import { config } from '../config';
import {
  getUserToken,
  hashPassword,
  issueClientToken,
  issueUserToken,
  requireClientToken,
  requireUser,
  revokeUserToken,
  verifyPassword,
} from '../auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
}

export function buildAuthRouter(db: DB): Router {
  const router = Router();

  router.post('/client-token', (req, res) => {
    const body = req.body ?? {};
    const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
    const clientSecret = typeof body.client_secret === 'string' ? body.client_secret : '';

    if (!clientId || !clientSecret) {
      res.status(400).json({ error: 'client_id and client_secret are required' });
      return;
    }
    if (clientId !== config.clientId || clientSecret !== config.clientSecret) {
      res.status(401).json({ error: 'invalid_client_credentials' });
      return;
    }

    const { token, expiresAt } = issueClientToken(db, clientId);
    res.status(200).json({ clientToken: token, expiresAt });
  });

  const requireClient = requireClientToken(db);
  const requireU = requireUser(db);

  router.post('/register', requireClient, async (req, res) => {
    const body = req.body ?? {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !EMAIL_RE.test(email)) {
      res.status(400).json({ error: 'invalid_email' });
      return;
    }
    if (!name) {
      res.status(400).json({ error: 'name_required' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'password_too_short', detail: 'must be at least 6 chars' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'email_already_registered' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const info = db
      .prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
      .run(email, name, passwordHash);

    res.status(201).json({ id: Number(info.lastInsertRowid), email, name });
  });

  router.post('/login', requireClient, async (req, res) => {
    const body = req.body ?? {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'email_and_password_required' });
      return;
    }

    const user = db
      .prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?')
      .get(email) as UserRow | undefined;

    if (!user) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }

    const { token, expiresAt } = issueUserToken(db, user.id);
    res.status(200).json({
      userToken: token,
      expiresAt,
      user: { id: user.id, email: user.email, name: user.name },
    });
  });

  router.post('/logout', requireClient, requireU, (req, res) => {
    const token = getUserToken(req);
    if (token) revokeUserToken(db, token);
    res.status(204).send();
  });

  return router;
}
