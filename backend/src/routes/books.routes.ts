import { Router } from 'express';

import type { DB } from '../db';
import { requireClientToken } from '../auth';

interface BookRow {
  id: number;
  title: string;
  author: string;
  isbn: string | null;
  status: 'available' | 'checked_out';
  checked_out_by: number | null;
  created_at: string;
}

export function buildBooksRouter(db: DB): Router {
  const router = Router();
  const requireClient = requireClientToken(db);

  router.get('/', requireClient, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT id, title, author, isbn, status, checked_out_by, created_at
           FROM books
          ORDER BY title ASC`,
      )
      .all() as BookRow[];
    res.status(200).json(rows);
  });

  return router;
}
