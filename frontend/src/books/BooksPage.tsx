import { useEffect, useState } from 'react';
import { ApiError, api, type Book, type User } from '../api';
import { AuthPage } from '../auth/AuthPage';

interface BooksPageProps {
  currentUser: User | null;
  onAuthenticated: (user: User) => void;
}

export function BooksPage({ currentUser, onAuthenticated }: BooksPageProps) {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyBookId, setBusyBookId] = useState<number | null>(null);

  // when a guest clicks Checkout we capture the intent and show the auth pane;
  // after a successful login/register we resume the original action.
  const [pendingCheckoutBookId, setPendingCheckoutBookId] = useState<number | null>(null);

  const refresh = async () => {
    setError(null);
    try {
      const next = await api.listBooks();
      setBooks(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load books.');
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const performCheckout = async (bookId: number) => {
    setError(null);
    setBusyBookId(bookId);
    try {
      const { book: updated } = await api.checkoutBook(bookId);
      setBooks((cur) => (cur ?? []).map((b) => (b.id === updated.id ? updated : b)));
    } catch (err) {
      setError(err instanceof ApiError ? humanizeBookError(err) : 'Checkout failed.');
    } finally {
      setBusyBookId(null);
    }
  };

  const onCheckoutClick = (book: Book) => {
    if (!currentUser) {
      setPendingCheckoutBookId(book.id);
      return;
    }
    void performCheckout(book.id);
  };

  const onAuthSuccess = (user: User) => {
    onAuthenticated(user);
    if (pendingCheckoutBookId != null) {
      const bookId = pendingCheckoutBookId;
      setPendingCheckoutBookId(null);
      void performCheckout(bookId);
    }
  };

  const onCancelAuth = () => setPendingCheckoutBookId(null);

  const onReturn = async (book: Book) => {
    setError(null);
    setBusyBookId(book.id);
    try {
      const { book: updated } = await api.returnBook(book.id);
      setBooks((cur) => (cur ?? []).map((b) => (b.id === updated.id ? updated : b)));
    } catch (err) {
      setError(err instanceof ApiError ? humanizeBookError(err) : 'Return failed.');
    } finally {
      setBusyBookId(null);
    }
  };

  if (pendingCheckoutBookId != null) {
    const pendingBook = books?.find((b) => b.id === pendingCheckoutBookId);
    return (
      <div className="card">
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Sign in to checkout</h2>
          {pendingBook ? (
            <p style={{ marginTop: 6, color: '#555', fontSize: 14 }}>
              You're checking out <strong>{pendingBook.title}</strong>. Login or register to
              continue.
            </p>
          ) : (
            <p style={{ marginTop: 6, color: '#555', fontSize: 14 }}>
              Login or register to continue with your checkout.
            </p>
          )}
        </div>
        <AuthPage onAuthenticated={onAuthSuccess} />
        <button onClick={onCancelAuth} style={{ marginTop: 12 }}>
          Cancel and keep browsing
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Books</h2>
        <button onClick={() => void refresh()}>Refresh</button>
      </div>

      {!currentUser ? (
        <p style={{ color: '#555', fontSize: 13, marginTop: 0 }}>
          Browsing as a guest. Click <strong>Checkout</strong> on any available book and we'll
          ask you to login or register before placing the order.
        </p>
      ) : null}

      {error ? <div className="error" role="alert">{error}</div> : null}
      {books == null ? <p>Loading books...</p> : null}

      {books && books.length === 0 ? <p>No books in the library yet.</p> : null}

      {books && books.length > 0 ? (
        <table className="books-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>ISBN</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {books.map((book) => {
              const isMine = currentUser != null && book.checked_out_by === currentUser.id;
              const busy = busyBookId === book.id;
              return (
                <tr key={book.id}>
                  <td>{book.title}</td>
                  <td>{book.author}</td>
                  <td>{book.isbn ?? '-'}</td>
                  <td>
                    <span className={`status-pill ${book.status}`}>
                      {book.status === 'available' ? 'Available' : 'Checked out'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {book.status === 'available' ? (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => onCheckoutClick(book)}
                      >
                        {busy ? 'Checking out...' : 'Checkout'}
                      </button>
                    ) : isMine ? (
                      <button disabled={busy} onClick={() => void onReturn(book)}>
                        {busy ? 'Returning...' : 'Return'}
                      </button>
                    ) : (
                      <span style={{ color: '#888', fontSize: 13 }}>Unavailable</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

function humanizeBookError(err: ApiError): string {
  switch (err.code) {
    case 'book_not_available':
      return 'That book is already checked out.';
    case 'book_not_checked_out':
      return 'That book is not currently checked out.';
    case 'not_borrower':
      return 'Only the borrower can return this book.';
    case 'book_not_found':
      return 'Book not found (try Refresh).';
    default:
      return err.message;
  }
}
