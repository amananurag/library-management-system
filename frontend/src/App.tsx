import { useEffect, useState } from 'react';
import { AuthPage } from './auth/AuthPage';
import { BooksPage } from './books/BooksPage';
import { api, getStoredUser, type User } from './api';

type AuthSheet = null | 'login';

export function App() {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [sheet, setSheet] = useState<AuthSheet>(null);

  useEffect(() => {
    const onStorage = () => setUser(getStoredUser());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const onLogout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Library Management System</h1>
        {user ? (
          <div className="user-info">
            <span>
              Signed in as <strong>{user.name}</strong> ({user.email})
            </span>
            <button className="danger" onClick={() => void onLogout()}>
              Logout
            </button>
          </div>
        ) : (
          <div className="user-info">
            <span style={{ color: '#888', fontSize: 13 }}>Browsing as guest</span>
            <button onClick={() => setSheet('login')}>Login / Register</button>
          </div>
        )}
      </header>
      <main>
        {sheet === 'login' && !user ? (
          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Login or Register</h2>
            <AuthPage
              onAuthenticated={(u) => {
                setUser(u);
                setSheet(null);
              }}
            />
            <button style={{ marginTop: 12 }} onClick={() => setSheet(null)}>
              Back to books
            </button>
          </div>
        ) : (
          <BooksPage currentUser={user} onAuthenticated={setUser} />
        )}
      </main>
    </div>
  );
}
