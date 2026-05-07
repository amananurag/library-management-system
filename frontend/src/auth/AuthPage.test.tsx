import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthPage } from './AuthPage';

describe('AuthPage', () => {
  it('renders login and register tabs and switches between them', async () => {
    const user = userEvent.setup();
    render(<AuthPage onAuthenticated={vi.fn()} />);

    const loginTab = screen.getByRole('tab', { name: /login/i });
    const registerTab = screen.getByRole('tab', { name: /register/i });

    expect(loginTab).toBeInTheDocument();
    expect(registerTab).toBeInTheDocument();

    expect(screen.getByRole('form', { name: /login form/i })).toBeInTheDocument();

    await user.click(registerTab);
    expect(screen.getByRole('form', { name: /register form/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();

    await user.click(loginTab);
    expect(screen.getByRole('form', { name: /login form/i })).toBeInTheDocument();
  });
});
