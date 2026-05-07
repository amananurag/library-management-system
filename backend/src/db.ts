import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export type DB = Database.Database;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS books (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    author          TEXT NOT NULL,
    isbn            TEXT,
    status          TEXT NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available','checked_out')),
    checked_out_by  INTEGER REFERENCES users(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER NOT NULL REFERENCES books(id),
    user_id     INTEGER NOT NULL REFERENCES users(id),
    action      TEXT NOT NULL CHECK (action IN ('checkout','return')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_tokens (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS client_tokens (
    token       TEXT PRIMARY KEY,
    client_id   TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_email           ON users(email);
  CREATE INDEX IF NOT EXISTS idx_books_status          ON books(status);
  CREATE INDEX IF NOT EXISTS idx_user_tokens_user      ON user_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_tokens_expires   ON user_tokens(expires_at);
  CREATE INDEX IF NOT EXISTS idx_client_tokens_expires ON client_tokens(expires_at);
  CREATE INDEX IF NOT EXISTS idx_transactions_book     ON transactions(book_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_user     ON transactions(user_id);
`;

export function openDb(dbPath: string): DB {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}

const SAMPLE_BOOKS: ReadonlyArray<{ title: string; author: string; isbn: string }> = [
  { title: 'The Pragmatic Programmer',          author: 'Andrew Hunt, David Thomas',   isbn: '9780201616224' },
  { title: 'Clean Code',                         author: 'Robert C. Martin',            isbn: '9780132350884' },
  { title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann',         isbn: '9781449373320' },
  { title: 'The Mythical Man-Month',             author: 'Frederick P. Brooks Jr.',     isbn: '9780201835953' },
  { title: 'Refactoring',                        author: 'Martin Fowler',               isbn: '9780134757599' },
  { title: 'Domain-Driven Design',               author: 'Eric Evans',                  isbn: '9780321125217' },
  { title: 'Structure and Interpretation of Computer Programs', author: 'Harold Abelson, Gerald Jay Sussman', isbn: '9780262510875' },
  { title: 'Code Complete',                      author: 'Steve McConnell',             isbn: '9780735619678' },
  { title: 'The Phoenix Project',                author: 'Gene Kim, Kevin Behr, George Spafford', isbn: '9780988262508' },
  { title: 'You Don\'t Know JS Yet',              author: 'Kyle Simpson',                isbn: '9798602477429' },
];

export function seedBooksIfEmpty(db: DB): void {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number }).n;
  if (count > 0) return;

  const insert = db.prepare(
    'INSERT INTO books (title, author, isbn, status) VALUES (?, ?, ?, \'available\')',
  );
  const tx = db.transaction((rows: typeof SAMPLE_BOOKS) => {
    for (const r of rows) insert.run(r.title, r.author, r.isbn);
  });
  tx(SAMPLE_BOOKS);
}

let _db: DB | null = null;

export function getDb(dbPath: string): DB {
  if (_db) return _db;
  _db = openDb(dbPath);
  seedBooksIfEmpty(_db);
  return _db;
}

export function setDbForTests(db: DB | null): void {
  _db = db;
}
