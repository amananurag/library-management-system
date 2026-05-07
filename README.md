# Library Management System

A small full-stack library management app: list books, check them out, and return them. Chekout and return is just a status change technically for now.
- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Node.js + Express + TypeScript
- **Database:** SQLite (via `better-sqlite3`) — no external DB server needed
- **Auth:** Two-tier — an API-level client-credential token + per-user email/password login (bcrypt salt+hash). 



## Architecture overview

```
┌────────────────┐    /api/*    ┌─────────────────────┐    SQL    ┌──────────────┐
│  React (Vite)  │ ───────────▶ │ Express + TS        │ ────────▶ │ SQLite file  │
│  port 5173     │              │ port 4000           │           │ data/*.sqlite│
└────────────────┘              └─────────────────────┘           └──────────────┘
       │ X-Client-Token: <opaque, from /auth/client-token>
       │ Authorization: Bearer <opaque, from /auth/login>
```

The Vite dev server proxies `/api` to the Express backend, so the React app calls relative URLs.

### Why this stack

- **SQLite** `better-sqlite3` is a synchronous, embedded driver that needs zero configuration, runs in CI, and is plenty fast for this scope. WAL journal mode is on for safe concurrent reads.
- **Express** because it's the most boring/correct choice for a small REST API.
- **TypeScript** end-to-end so request/response shapes are checked at the boundary.
- **Opaque tokens stored in SQLite** instead of JWTs, random "access token" just for demo purpose would be replaced by actual OAuth  
- **bcrypt** for the user password hash. bcrypt embeds the salt in the hash output, so we only persist `password_hash`.

---

## Data model



    users {
        INTEGER id PK
        TEXT email UK
        TEXT name
        TEXT password_hash
        TEXT created_at
    }
    books {
        INTEGER id PK
        TEXT title
        TEXT author
        TEXT isbn
        TEXT status "available | checked_out"
        INTEGER checked_out_by FK
        TEXT created_at
    }
    transactions {
        INTEGER id PK
        INTEGER book_id FK
        INTEGER user_id FK
        TEXT action "checkout | return"
        TEXT created_at
    }
    user_tokens {
        TEXT token PK
        INTEGER user_id FK
        TEXT expires_at
        TEXT created_at
    }
    client_tokens {
        TEXT token PK
        TEXT client_id
        TEXT expires_at
        TEXT created_at
    }
```

The `books` table is seeded with ~10 sample books on first start.

Indexes are created on `users.email`, `books.status`, `user_tokens.user_id`, `user_tokens.expires_at`, `client_tokens.expires_at`, `transactions.book_id`, and `transactions.user_id` to keep the common queries (`WHERE email = ?`, `WHERE status = 'available'`, token lookups, per-user transaction history) fast on a larger dataset.

---

## How auth works (two tiers)

The spec calls for an API-level client-credential token *plus* per-user email/password login — so we have two independent layers:



1. **Client-credential token** (the API gate). The backend reads `CLIENT_ID` and `CLIENT_SECRET` from `.env`. Calling `POST /api/auth/client-token` with those credentials returns a random 32-byte hex `clientToken`, persisted in `client_tokens`. **Every** other `/api/*` route requires `X-Client-Token: <clientToken>` and rejects requests without one.
2. **User token** (borrower identity). Email/password login hashes the password with bcrypt and on success returns a random 32-byte hex `userToken` (persisted in `user_tokens`). Endpoints that need to know which user is acting (`/api/auth/logout`, `/api/books`, `/api/checkout`, `/api/return`) require the user token in addition to the client token, sent as `Authorization: Bearer <userToken>`.


The frontend wrapper [`frontend/src/api.ts`](frontend/src/api.ts) handles this transparently: on first call it exchanges `VITE_CLIENT_ID` / `VITE_CLIENT_SECRET` for a `clientToken`, caches it in memory until it nears expiry, and attaches both headers to every subsequent fetch.

> The frontend's client secret being readable in the browser is acceptable for this POC; in production the client-credentials exchange would happen server-to-server only.

---

## API reference



| Method | Path | `X-Client-Token` | `Bearer` user token | Body | Success |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/auth/client-token` | no | no | `{ client_id, client_secret }` | `200 { clientToken, expiresAt }` |
| `POST` | `/api/auth/register` | yes | no | `{ email, name, password }` | `201 { id, email, name }` |
| `POST` | `/api/auth/login` | yes | no | `{ email, password }` | `200 { userToken, expiresAt, user }` |
| `POST` | `/api/auth/logout` | yes | yes | (none) | `204` |
| `GET` | `/api/books` | yes | **no** | (none) | `200 Book[]` (public catalog) |
| `POST` | `/api/checkout` | yes | yes | `{ bookId }` | `200 { book, transaction }` |
| `POST` | `/api/return` | yes | yes | `{ bookId }` | `200 { book, transaction }` |
| `GET` | `/api/health` | no | no | (none) | `200 { status: "ok" }` |


`Book`:
```ts
{ id: number; title: string; author: string; isbn: string | null;
  status: 'available' | 'checked_out'; checked_out_by: number | null;
  created_at: string }
```
`Transaction`:
```ts
{ id: number; book_id: number; user_id: number;
  action: 'checkout' | 'return'; created_at: string }
```

### Error codes

`400 invalid_email`, `400 password_too_short`, `400 name_required`, `400 bookId_required`, `400 email_and_password_required`, `400 client_id and client_secret are required`,
`401 missing_client_token | invalid_client_token | expired_client_token`,
`401 missing_user_token | invalid_user_token | expired_user_token`,
`401 invalid_credentials | invalid_client_credentials`,
`403 not_borrower`,
`404 book_not_found | not_found`,
`409 email_already_registered | book_not_available | book_not_checked_out`.

---

## Run

> Requires Node.js 20+.

```bash
# 1. install root + backend + frontend deps in one shot
npm run install:all

# 2. copy the env templates
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. start both apps in dev mode (concurrently)
npm run dev
```

Then open http://localhost:5173 in a browser.

- Frontend (Vite): http://localhost:5173 (proxies `/api` to the backend)
- Backend (Express): http://localhost:4000
- Health check: `curl http://localhost:4000/api/health`

### Run individually

```bash
npm run dev:api    # backend only (tsx watch)
npm run dev:web    # frontend only (vite)
```

### Production build

```bash
npm run build      # builds both
npm run build:api  # backend → backend/dist
npm run build:web  # frontend → frontend/dist
```

To run the built backend: `node backend/dist/index.js` (after copying `.env` next to it or setting env vars).

### Tests

```bash
npm test           # runs both
npm run test:api   # backend (vitest + supertest, in-memory SQLite)
npm run test:web   # frontend (vitest + RTL)
```

### Clean rebuild

```bash
npm run clean        # removes all node_modules, dist/, the SQLite db, and TS build cache
npm run install:all  # reinstall everything
npm run build        # rebuild both
npm run dev          # start dev mode again
```

Targeted cleans:

```bash
npm run clean:api    # backend/node_modules + backend/dist + backend/data (sqlite)
npm run clean:web    # frontend/node_modules + frontend/dist
npm run clean:root   # just root node_modules
```



