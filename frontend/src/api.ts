const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
const CLIENT_ID = import.meta.env.VITE_CLIENT_ID as string;
const CLIENT_SECRET = import.meta.env.VITE_CLIENT_SECRET as string;

const USER_TOKEN_KEY = 'lms.userToken';
const USER_KEY = 'lms.user';

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface Book {
  id: number;
  title: string;
  author: string;
  isbn: string | null;
  status: 'available' | 'checked_out';
  checked_out_by: number | null;
  created_at: string;
}

export interface Transaction {
  id: number;
  book_id: number;
  user_id: number;
  action: 'checkout' | 'return';
  created_at: string;
}

interface ClientTokenCache {
  token: string;
  expiresAt: number;
}

let clientTokenCache: ClientTokenCache | null = null;
let clientTokenInflight: Promise<string> | null = null;

async function fetchClientToken(): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      'VITE_CLIENT_ID / VITE_CLIENT_SECRET are not configured (copy .env.example to .env)',
    );
  }
  const res = await fetch(`${API_BASE}/api/auth/client-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  if (!res.ok) {
    throw new Error(`failed to obtain client token (status ${res.status})`);
  }
  const body = (await res.json()) as { clientToken: string; expiresAt: string };
  clientTokenCache = {
    token: body.clientToken,
    expiresAt: Date.parse(body.expiresAt),
  };
  return body.clientToken;
}

async function getClientToken(): Promise<string> {
  const now = Date.now();
  if (clientTokenCache && clientTokenCache.expiresAt - 60_000 > now) {
    return clientTokenCache.token;
  }
  if (!clientTokenInflight) {
    clientTokenInflight = fetchClientToken().finally(() => {
      clientTokenInflight = null;
    });
  }
  return clientTokenInflight;
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function getStoredUserToken(): string | null {
  return localStorage.getItem(USER_TOKEN_KEY);
}

function setSession(user: User, userToken: string): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(USER_TOKEN_KEY, userToken);
}

export function clearSession(): void {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(USER_TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface RequestOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  withUserToken?: boolean;
}

async function apiRequest<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = {
    'X-Client-Token': await getClientToken(),
  };

  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (opts.withUserToken) {
    const userToken = getStoredUserToken();
    if (userToken) {
      headers['Authorization'] = `Bearer ${userToken}`;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const errBody = (payload ?? {}) as { error?: string; detail?: string };

    if (res.status === 401 && errBody.error?.includes('client_token')) {
      clientTokenCache = null;
    }
    if (res.status === 401 && errBody.error?.includes('user_token')) {
      clearSession();
    }

    throw new ApiError(
      errBody.detail ?? errBody.error ?? `request failed with status ${res.status}`,
      res.status,
      errBody.error,
    );
  }

  return payload as T;
}

export const api = {
  async register(input: { email: string; name: string; password: string }): Promise<User> {
    return apiRequest<User>('/api/auth/register', { method: 'POST', body: input });
  },

  async login(input: { email: string; password: string }): Promise<User> {
    const body = await apiRequest<{ userToken: string; expiresAt: string; user: User }>(
      '/api/auth/login',
      { method: 'POST', body: input },
    );
    setSession(body.user, body.userToken);
    return body.user;
  },

  async logout(): Promise<void> {
    try {
      await apiRequest<void>('/api/auth/logout', { method: 'POST', withUserToken: true });
    } catch {
      // ignore network or already-expired errors on logout
    } finally {
      clearSession();
    }
  },

  async listBooks(): Promise<Book[]> {
    return apiRequest<Book[]>('/api/books', { withUserToken: true });
  },

  async checkoutBook(bookId: number): Promise<{ book: Book; transaction: Transaction }> {
    return apiRequest<{ book: Book; transaction: Transaction }>('/api/checkout', {
      method: 'POST',
      body: { bookId },
      withUserToken: true,
    });
  },

  async returnBook(bookId: number): Promise<{ book: Book; transaction: Transaction }> {
    return apiRequest<{ book: Book; transaction: Transaction }>('/api/return', {
      method: 'POST',
      body: { bookId },
      withUserToken: true,
    });
  },
};
