import { Router } from 'express';

import type { DB } from '../db';
import { requireClientToken, requireUser } from '../auth';

interface BookRow {
  id: number;
  title: string;
  author: string;
  isbn: string | null;
  status: 'available' | 'checked_out';
  checked_out_by: number | null;
  created_at: string;
}

interface TransactionRow {
  id: number;
  book_id: number;
  user_id: number;
  action: 'checkout' | 'return';
  created_at: string;
}

function readBookId(req: { body: unknown }): number | null {
  const body = (req.body ?? {}) as { bookId?: unknown };
  const raw = body.bookId;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number.parseInt(raw, 10);
  return null;
}

export function buildTransactionsRouter(db: DB): Router {
  const router = Router();
  const requireClient = requireClientToken(db);
  const requireU = requireUser(db);

  router.post('/checkout', requireClient, requireU, (req, res) => {
    const bookId = readBookId(req);
    if (!bookId) {
      res.status(400).json({ error: 'bookId_required' });
      return;
    }
    const userId = req.user!.id;

    try {
      const result = db.transaction(() => {
        const book = db
          .prepare('SELECT * FROM books WHERE id = ?')
          .get(bookId) as BookRow | undefined;
        if (!book) throw new Error('book_not_found');
        if (book.status !== 'available') throw new Error('book_not_available');

        db.prepare(
          'UPDATE books SET status = \'checked_out\', checked_out_by = ? WHERE id = ?',
        ).run(userId, bookId);

        const txInfo = db
          .prepare(
            'INSERT INTO transactions (book_id, user_id, action) VALUES (?, ?, \'checkout\')',
          )
          .run(bookId, userId);

        const updatedBook = db
          .prepare('SELECT * FROM books WHERE id = ?')
          .get(bookId) as BookRow;
        const transaction = db
          .prepare('SELECT * FROM transactions WHERE id = ?')
          .get(Number(txInfo.lastInsertRowid)) as TransactionRow;

        return { updatedBook, transaction };
      })();

      res.status(200).json({ book: result.updatedBook, transaction: result.transaction });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown_error';
      if (msg === 'book_not_found') {
        res.status(404).json({ error: msg });
      } else if (msg === 'book_not_available') {
        res.status(409).json({ error: msg });
      } else {
        res.status(500).json({ error: 'checkout_failed', detail: msg });
      }
    }
  });

  router.post('/return', requireClient, requireU, (req, res) => {
    const bookId = readBookId(req);
    if (!bookId) {
      res.status(400).json({ error: 'bookId_required' });
      return;
    }
    const userId = req.user!.id;

    try {
      const result = db.transaction(() => {
        const book = db
          .prepare('SELECT * FROM books WHERE id = ?')
          .get(bookId) as BookRow | undefined;
        if (!book) throw new Error('book_not_found');
        if (book.status !== 'checked_out') throw new Error('book_not_checked_out');
        if (book.checked_out_by !== userId) throw new Error('not_borrower');

        db.prepare(
          'UPDATE books SET status = \'available\', checked_out_by = NULL WHERE id = ?',
        ).run(bookId);

        const txInfo = db
          .prepare(
            'INSERT INTO transactions (book_id, user_id, action) VALUES (?, ?, \'return\')',
          )
          .run(bookId, userId);

        const updatedBook = db
          .prepare('SELECT * FROM books WHERE id = ?')
          .get(bookId) as BookRow;
        const transaction = db
          .prepare('SELECT * FROM transactions WHERE id = ?')
          .get(Number(txInfo.lastInsertRowid)) as TransactionRow;

        return { updatedBook, transaction };
      })();

      res.status(200).json({ book: result.updatedBook, transaction: result.transaction });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown_error';
      if (msg === 'book_not_found') {
        res.status(404).json({ error: msg });
      } else if (msg === 'book_not_checked_out') {
        res.status(409).json({ error: msg });
      } else if (msg === 'not_borrower') {
        res.status(403).json({ error: msg });
      } else {
        res.status(500).json({ error: 'return_failed', detail: msg });
      }
    }
  });

  return router;
}
