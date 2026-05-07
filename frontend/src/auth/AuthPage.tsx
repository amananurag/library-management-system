import { FormEvent, useState } from 'react';
import { ApiError, api, type User } from '../api';

type Tab = 'login' | 'register';

interface AuthPageProps {
  onAuthenticated: (user: User) => void;
}

export function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [tab, setTab] = useState<Tab>('login');

  return (
    <div className="card">
      <div className="tabs" role="tablist" aria-label="Authentication">
        <button
          role="tab"
          aria-selected={tab === 'login'}
          className={tab === 'login' ? 'active' : ''}
          onClick={() => setTab('login')}
        >
          Login
        </button>
        <button
          role="tab"
          aria-selected={tab === 'register'}
          className={tab === 'register' ? 'active' : ''}
          onClick={() => setTab('register')}
        >
          Register
        </button>
      </div>
      {tab === 'login' ? (
        <LoginForm onAuthenticated={onAuthenticated} />
      ) : (
        <RegisterForm onRegistered={() => setTab('login')} />
      )}
    </div>
  );
}

function LoginForm({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await api.login({ email, password });
      onAuthenticated(user);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="form" onSubmit={onSubmit} aria-label="Login form">
      <label>
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error ? <div className="error" role="alert">{error}</div> : null}
      <button type="submit" className="primary" disabled={loading}>
        {loading ? 'Signing in...' : 'Login'}
      </button>
    </form>
  );
}

function RegisterForm({ onRegistered }: { onRegistered: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await api.register({ email, name, password });
      setSuccess('Account created. You can log in now.');
      setTimeout(onRegistered, 600);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="form" onSubmit={onSubmit} aria-label="Register form">
      <label>
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        Name
        <input
          type="text"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Password (min 6 chars)
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error ? <div className="error" role="alert">{error}</div> : null}
      {success ? <div className="error" style={{ background: '#e6f5e9', color: '#1a7a35' }}>{success}</div> : null}
      <button type="submit" className="primary" disabled={loading}>
        {loading ? 'Creating...' : 'Create account'}
      </button>
    </form>
  );
}

function humanizeError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'invalid_credentials':
        return 'Wrong email or password.';
      case 'email_already_registered':
        return 'That email is already registered.';
      case 'invalid_email':
        return 'Please enter a valid email address.';
      case 'password_too_short':
        return 'Password must be at least 6 characters.';
      case 'name_required':
        return 'Name is required.';
      default:
        return err.message;
    }
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}
