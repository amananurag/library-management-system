import express from 'express';
import cors from 'cors';

import type { DB } from './db';
import { buildAuthRouter } from './routes/auth.routes';
import { buildBooksRouter } from './routes/books.routes';
import { buildTransactionsRouter } from './routes/transactions.routes';

export function createApp(db: DB, opts: { corsOrigin?: string } = {}): express.Express {
  const app = express();

  app.use(cors({ origin: opts.corsOrigin ?? '*' }));
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/auth', buildAuthRouter(db));
  app.use('/api/books', buildBooksRouter(db));
  app.use('/api', buildTransactionsRouter(db));

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
