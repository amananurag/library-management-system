import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app';
import { openDb, seedBooksIfEmpty, type DB } from '../src/db';
import { config } from '../src/config';

const CLIENT_ID = config.clientId;
const CLIENT_SECRET = config.clientSecret;

let db: DB;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = openDb(':memory:');
  seedBooksIfEmpty(db);
  app = createApp(db);
});

afterEach(() => {
  db.close();
});

async function clientToken(): Promise<string> {
  const res = await request(app)
    .post('/api/auth/client-token')
    .send({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
  expect(res.status).toBe(200);
  return res.body.clientToken as string;
}

async function registerAndLogin(
  ct: string,
  email: string,
  name: string,
  password: string,
): Promise<{ userToken: string; userId: number }> {
  const reg = await request(app)
    .post('/api/auth/register')
    .set('X-Client-Token', ct)
    .send({ email, name, password });
  expect(reg.status).toBe(201);

  const login = await request(app)
    .post('/api/auth/login')
    .set('X-Client-Token', ct)
    .send({ email, password });
  expect(login.status).toBe(200);

  return { userToken: login.body.userToken as string, userId: login.body.user.id as number };
}

describe('client-token gate', () => {
  it('rejects when client credentials are missing or wrong', async () => {
    const r1 = await request(app).post('/api/auth/client-token').send({});
    expect(r1.status).toBe(400);

    const r2 = await request(app)
      .post('/api/auth/client-token')
      .send({ client_id: 'wrong', client_secret: 'wrong' });
    expect(r2.status).toBe(401);
  });

  it('issues a client token for valid credentials', async () => {
    const r = await request(app)
      .post('/api/auth/client-token')
      .send({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
    expect(r.status).toBe(200);
    expect(typeof r.body.clientToken).toBe('string');
    expect(r.body.clientToken.length).toBeGreaterThan(20);
  });

  it('rejects every other endpoint without an X-Client-Token header', async () => {
    const r1 = await request(app).post('/api/auth/register').send({});
    expect(r1.status).toBe(401);
    expect(r1.body.error).toBe('missing_client_token');

    const r2 = await request(app).get('/api/books');
    expect(r2.status).toBe(401);
    expect(r2.body.error).toBe('missing_client_token');
  });
});

describe('register + login', () => {
  it('registers a user and rejects duplicate email', async () => {
    const ct = await clientToken();

    const r1 = await request(app)
      .post('/api/auth/register')
      .set('X-Client-Token', ct)
      .send({ email: 'alice@example.com', name: 'Alice', password: 'secret123' });
    expect(r1.status).toBe(201);
    expect(r1.body.email).toBe('alice@example.com');

    const r2 = await request(app)
      .post('/api/auth/register')
      .set('X-Client-Token', ct)
      .send({ email: 'alice@example.com', name: 'Alice', password: 'secret123' });
    expect(r2.status).toBe(409);
  });

  it('rejects login with wrong password and accepts correct one', async () => {
    const ct = await clientToken();
    await request(app)
      .post('/api/auth/register')
      .set('X-Client-Token', ct)
      .send({ email: 'bob@example.com', name: 'Bob', password: 'goodpass' });

    const bad = await request(app)
      .post('/api/auth/login')
      .set('X-Client-Token', ct)
      .send({ email: 'bob@example.com', password: 'wrongpass' });
    expect(bad.status).toBe(401);

    const good = await request(app)
      .post('/api/auth/login')
      .set('X-Client-Token', ct)
      .send({ email: 'bob@example.com', password: 'goodpass' });
    expect(good.status).toBe(200);
    expect(typeof good.body.userToken).toBe('string');
    expect(good.body.user.email).toBe('bob@example.com');
  });
});

describe('books listing', () => {
  it('is publicly readable with only a client token (no user token required)', async () => {
    const ct = await clientToken();
    const res = await request(app).get('/api/books').set('X-Client-Token', ct);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('title');
    expect(res.body[0]).toHaveProperty('status');
  });

  it('still requires the client token (perimeter gate)', async () => {
    const res = await request(app).get('/api/books');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('missing_client_token');
  });

  it('checkout is still gated by the user token', async () => {
    const ct = await clientToken();
    const res = await request(app)
      .post('/api/checkout')
      .set('X-Client-Token', ct)
      .send({ bookId: 1 });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('missing_user_token');
  });
});

describe('checkout + return', () => {
  it('marks a book as checked_out, writes a transaction, and returns 409 on double-checkout', async () => {
    const ct = await clientToken();
    const { userToken, userId } = await registerAndLogin(
      ct,
      'dave@example.com',
      'Dave',
      'secret123',
    );

    const list = await request(app)
      .get('/api/books')
      .set('X-Client-Token', ct)
      .set('Authorization', `Bearer ${userToken}`);
    const bookId = list.body[0].id as number;

    const co = await request(app)
      .post('/api/checkout')
      .set('X-Client-Token', ct)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ bookId });
    expect(co.status).toBe(200);
    expect(co.body.book.status).toBe('checked_out');
    expect(co.body.book.checked_out_by).toBe(userId);
    expect(co.body.transaction.action).toBe('checkout');

    const dup = await request(app)
      .post('/api/checkout')
      .set('X-Client-Token', ct)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ bookId });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('book_not_available');
  });

  it('return only works for the current borrower', async () => {
    const ct = await clientToken();
    const dave = await registerAndLogin(ct, 'dave2@example.com', 'Dave2', 'secret123');
    const eve = await registerAndLogin(ct, 'eve@example.com', 'Eve', 'secret123');

    const list = await request(app)
      .get('/api/books')
      .set('X-Client-Token', ct)
      .set('Authorization', `Bearer ${dave.userToken}`);
    const bookId = list.body[0].id as number;

    await request(app)
      .post('/api/checkout')
      .set('X-Client-Token', ct)
      .set('Authorization', `Bearer ${dave.userToken}`)
      .send({ bookId })
      .expect(200);

    const wrongUser = await request(app)
      .post('/api/return')
      .set('X-Client-Token', ct)
      .set('Authorization', `Bearer ${eve.userToken}`)
      .send({ bookId });
    expect(wrongUser.status).toBe(403);
    expect(wrongUser.body.error).toBe('not_borrower');

    const ok = await request(app)
      .post('/api/return')
      .set('X-Client-Token', ct)
      .set('Authorization', `Bearer ${dave.userToken}`)
      .send({ bookId });
    expect(ok.status).toBe(200);
    expect(ok.body.book.status).toBe('available');
    expect(ok.body.book.checked_out_by).toBeNull();
    expect(ok.body.transaction.action).toBe('return');
  });
});
