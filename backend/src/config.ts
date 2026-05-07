import 'dotenv/config';
import path from 'path';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Env var ${name} must be an integer, got: ${raw}`);
  }
  return n;
}

export const config = {
  port: int('PORT', 4000),
  dbPath: path.resolve(process.cwd(), required('DB_PATH', './data/library.sqlite')),
  clientId: required('CLIENT_ID', 'demo-client'),
  clientSecret: required('CLIENT_SECRET', 'demo-client-secret-change-me'),
  clientTokenTtlMs: int('CLIENT_TOKEN_TTL_MS', 60 * 60 * 1000),
  userTokenTtlMs: int('USER_TOKEN_TTL_MS', 24 * 60 * 60 * 1000),
  bcryptRounds: int('BCRYPT_ROUNDS', 10),
  corsOrigin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
};
