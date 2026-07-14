// src/lib/password-reset.ts — demo mode

type MessageResponse = { message: string };

export function requestPasswordReset(_email: string): Promise<MessageResponse> {
  return Promise.resolve({ message: 'If an account exists for that email, a reset link has been sent.' });
}

export function resetPassword(_token: string, _password: string): Promise<MessageResponse> {
  return Promise.resolve({ message: 'Password reset successfully.' });
}
